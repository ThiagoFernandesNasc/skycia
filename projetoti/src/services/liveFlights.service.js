const db = require('../db');
const fs = require('fs');
const path = require('path');

const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';
const OPEN_SKY_TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const AERODATABOX_HOST = 'aerodatabox.p.rapidapi.com';
const AERODATABOX_BASE = `https://${AERODATABOX_HOST}`;
const REQUEST_TIMEOUT_MS = 9000;
const OPENSKY_TIMEOUT_MS = 18000;
const MIN_CACHE_TTL = 20;
const MAX_CACHE_TTL = 40;
const AERODATABOX_COOLDOWN_MS = 10 * 60 * 1000;

const cache = new Map();
const DEBUG_LOG = path.join(process.cwd(), 'opensky_debug.log');
const aeroDataBoxState = {
  cooldownUntil: 0,
  reason: null,
};
let ensureLiveSchemaPromise = null;

function debugLog(message) {
  try {
    fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${message}\n`);
  } catch (_) {
    // ignore logging errors
  }
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string') {
      const clean = value.trim();
      if (clean) return clean;
    }
  }
  return null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCacheTtlSeconds() {
  const raw = Number(process.env.LIVE_FLIGHTS_CACHE_TTL || 30);
  if (!Number.isFinite(raw)) return 30;
  return clamp(Math.round(raw), MIN_CACHE_TTL, MAX_CACHE_TTL);
}

function normalizeSourceQuery(source) {
  const value = String(source || 'all').toLowerCase();
  if (value === 'opensky' || value === 'aerodatabox' || value === 'all') return value;
  return 'all';
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed)) return 100;
  return clamp(parsed, 1, 300);
}

function normalizeStatusFilter(status) {
  if (!status) return null;
  return String(status).trim().toLowerCase();
}

function getConfiguredAirports() {
  return String(process.env.LIVE_FLIGHTS_AIRPORTS || 'GRU,GIG,BSB')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, clamp(Number(process.env.LIVE_AERODATABOX_AIRPORT_LIMIT || 3), 1, 5));
}

function buildOpenSkyUrl() {
  const lamin = parseNumber(process.env.OPENSKY_LAMIN);
  const lamax = parseNumber(process.env.OPENSKY_LAMAX);
  const lomin = parseNumber(process.env.OPENSKY_LOMIN);
  const lomax = parseNumber(process.env.OPENSKY_LOMAX);

  if ([lamin, lamax, lomin, lomax].every(Number.isFinite)) {
    const params = new URLSearchParams({
      lamin: String(lamin),
      lamax: String(lamax),
      lomin: String(lomin),
      lomax: String(lomax),
    });
    return `${OPEN_SKY_URL}?${params.toString()}`;
  }

  // Default window focused on Brazil and nearby international corridors.
  return `${OPEN_SKY_URL}?${new URLSearchParams({
    lamin: '-35',
    lamax: '12',
    lomin: '-80',
    lomax: '-20',
  }).toString()}`;
}

function nested(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

async function fetchJsonWithTimeout(
  url,
  { method = 'GET', headers = {}, body } = {},
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 180)}` : ''}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function isRateLimitErrorMessage(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('429') || text.includes('too many requests') || text.includes('rate limit') || text.includes('quota');
}

function isAeroDataBoxCooldownActive() {
  return aeroDataBoxState.cooldownUntil > Date.now();
}

function getAeroDataBoxCooldownMessage() {
  const remainingMs = Math.max(0, aeroDataBoxState.cooldownUntil - Date.now());
  const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
  const reason = aeroDataBoxState.reason ? ` Motivo: ${aeroDataBoxState.reason}.` : '';
  return `AeroDataBox em cooldown por ${remainingMin} min.${reason}`;
}

function activateAeroDataBoxCooldown(message) {
  aeroDataBoxState.cooldownUntil = Date.now() + AERODATABOX_COOLDOWN_MS;
  aeroDataBoxState.reason = String(message || '429 Too Many Requests');
  console.warn(`[liveFlights] AeroDataBox cooldown ativado: ${aeroDataBoxState.reason}`);
}

function clearAeroDataBoxCooldown() {
  aeroDataBoxState.cooldownUntil = 0;
  aeroDataBoxState.reason = null;
}

function inferAirlineFromCallsign(callsign) {
  if (!callsign) return null;
  const code = callsign.replace(/\s+/g, '').slice(0, 3).toUpperCase();
  if (!code) return null;
  return code;
}

function normalizeFlightKey(value) {
  if (!value) return null;
  const key = String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return key || null;
}

const ICAO_TO_COMMERCIAL_PREFIX = {
  AZU: 'AD',
  GLO: 'G3',
  TAM: 'LA',
  LAN: 'LA',
  ONE: 'O6',
  PTB: '2Z',
};

const AIRLINE_NAME_BY_PREFIX = {
  AD: 'Azul',
  AZU: 'Azul',
  G3: 'Gol',
  GLO: 'Gol',
  JJ: 'LATAM Brasil',
  LA: 'LATAM',
  LAN: 'LATAM',
  TAM: 'LATAM Brasil',
  O6: 'Avianca Brasil',
  ONE: 'Avianca Brasil',
  '2Z': 'VoePass',
  PTB: 'VoePass',
};

const COMMERCIAL_TO_ICAO_PREFIX = Object.entries(ICAO_TO_COMMERCIAL_PREFIX).reduce((acc, [icao, commercial]) => {
  acc[commercial] = icao;
  return acc;
}, {});

function inferAirlineName(value) {
  const key = normalizeFlightKey(value);
  if (!key) return null;
  const three = key.slice(0, 3);
  const two = key.slice(0, 2);
  return AIRLINE_NAME_BY_PREFIX[three] || AIRLINE_NAME_BY_PREFIX[two] || null;
}

function expandFlightKeyAliases(value) {
  const key = normalizeFlightKey(value);
  if (!key) return [];

  const aliases = new Set([key]);
  const icaoMatch = key.match(/^([A-Z]{3})(\d{2,5}[A-Z]?)$/);
  if (icaoMatch && ICAO_TO_COMMERCIAL_PREFIX[icaoMatch[1]]) {
    aliases.add(`${ICAO_TO_COMMERCIAL_PREFIX[icaoMatch[1]]}${icaoMatch[2]}`);
  }

  const commercialMatch = key.match(/^([A-Z0-9]{2})(\d{2,5}[A-Z]?)$/);
  if (commercialMatch && COMMERCIAL_TO_ICAO_PREFIX[commercialMatch[1]]) {
    aliases.add(`${COMMERCIAL_TO_ICAO_PREFIX[commercialMatch[1]]}${commercialMatch[2]}`);
  }

  return [...aliases];
}

function getFlightIdentityKeys(item) {
  const aliases = new Set();
  [item?.callsign, item?.id, item?.number, item?.numero_voo].forEach((value) => {
    expandFlightKeyAliases(value).forEach((alias) => aliases.add(alias));
  });
  return [...aliases];
}

function canonicalFlightKey(item) {
  const keys = getFlightIdentityKeys(item);
  const commercial = keys.find((key) => /^[A-Z0-9]{2}\d/.test(key));
  return commercial || keys[0] || null;
}

function mapOpenSkyStatus(onGround) {
  return onGround ? 'CONCLUIDO' : 'EM_VOO';
}

function normalizeOpenSkyFlight(state) {
  const icao24 = firstString(state?.[0]);
  const callsignRaw = firstString(state?.[1]);
  const callsign = normalizeFlightKey(callsignRaw);
  const updatedSec = firstDefined(parseNumber(state?.[4]), parseNumber(state?.[3]));
  const altitudeMeters = firstDefined(parseNumber(state?.[13]), parseNumber(state?.[7]));
  const speedMs = parseNumber(state?.[9]);

  return {
	    id: firstString(callsign, normalizeFlightKey(icao24)) || `opensky-${Math.random().toString(36).slice(2, 8)}`,
	    callsign,
	    airline: inferAirlineName(callsign) || inferAirlineFromCallsign(callsign),
    aircraft: null,
    origin: null,
    destination: null,
    lat: parseNumber(state?.[6]),
    lng: parseNumber(state?.[5]),
    altitude: altitudeMeters !== null ? Math.round(altitudeMeters * 3.28084) : null,
    speed: speedMs !== null ? Math.round(speedMs * 3.6) : null,
    heading: parseNumber(state?.[10]),
    status: mapOpenSkyStatus(Boolean(state?.[8])),
    departureTime: null,
    arrivalTime: null,
    source: 'opensky',
    updatedAt: updatedSec ? new Date(updatedSec * 1000).toISOString() : new Date().toISOString(),
  };
}

async function fetchOpenSkyFlights() {
  const headers = {};
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;

  if (clientId && clientSecret) {
    const now = Date.now();
    if (!fetchOpenSkyFlights.tokenCache) {
      fetchOpenSkyFlights.tokenCache = { token: null, expiresAt: 0 };
    }
    const cache = fetchOpenSkyFlights.tokenCache;
    if (!cache.token || cache.expiresAt <= now + 30_000) {
      const debugLine = `[liveFlights] OpenSky OAuth: client_id_len=${String(clientId).length}, client_secret_len=${String(
        clientSecret
      ).length}`;
      console.log(debugLine);
      debugLog(debugLine);
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString();
      const tokenPayload = await fetchJsonWithTimeout(
        OPEN_SKY_TOKEN_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
        REQUEST_TIMEOUT_MS
      );
      const accessToken = tokenPayload?.access_token;
      const expiresIn = Number(tokenPayload?.expires_in || 0);
      if (!accessToken) {
        debugLog('[liveFlights] OpenSky OAuth: token ausente no payload');
        throw new Error('OpenSky token invalido ou ausente');
      }
      console.log('[liveFlights] OpenSky OAuth: token recebido');
      debugLog('[liveFlights] OpenSky OAuth: token recebido');
      cache.token = accessToken;
      cache.expiresAt = now + Math.max(30, expiresIn) * 1000;
    }
    headers.Authorization = `Bearer ${cache.token}`;
  } else if (username && password) {
    const debugLine = `[liveFlights] OpenSky Basic: user_len=${String(username).length}, pass_len=${String(password).length}`;
    console.log(debugLine);
    debugLog(debugLine);
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  } else {
    debugLog('[liveFlights] OpenSky credenciais ausentes');
  }

  const payload = await fetchJsonWithTimeout(buildOpenSkyUrl(), { headers }, OPENSKY_TIMEOUT_MS);
  const states = Array.isArray(payload?.states) ? payload.states : [];
  return states.map(normalizeOpenSkyFlight).filter((item) => item.id);
}

function mapAeroStatus(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('cancel')) return 'CANCELADO';
  if (text.includes('delay') || text.includes('late')) return 'ATRASADO';
  if (text.includes('arriv') || text.includes('land')) return 'CONCLUIDO';
  if (text.includes('depart') || text.includes('enroute') || text.includes('airborne') || text.includes('active')) return 'EM_VOO';
  return 'PREVISTO';
}

function collectAeroFlights(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const list = [];
  const maybeArrays = [
    payload.departures,
    payload.arrivals,
    payload.flights,
    nested(payload, 'data.departures'),
    nested(payload, 'data.arrivals'),
    nested(payload, 'items'),
  ];
  maybeArrays.forEach((bucket) => {
    if (Array.isArray(bucket)) list.push(...bucket);
  });
  return list;
}

function normalizeAeroDataBoxFlight(flight) {
  const callsignRaw = firstString(
    nested(flight, 'callSign'),
    nested(flight, 'callsign'),
    nested(flight, 'number'),
    nested(flight, 'flight.number')
  );
  const callsign = normalizeFlightKey(callsignRaw);

  const departureTime = firstString(
    nested(flight, 'departure.scheduledTime.utc'),
    nested(flight, 'departure.revisedTime.utc'),
    nested(flight, 'departure.actualTime.utc')
  );
  const arrivalTime = firstString(
    nested(flight, 'arrival.scheduledTime.utc'),
    nested(flight, 'arrival.revisedTime.utc'),
    nested(flight, 'arrival.actualTime.utc')
  );
  const departureGate = firstString(
    nested(flight, 'departure.gate'),
    nested(flight, 'departureGate'),
    nested(flight, 'departure.gateNumber')
  );
  const arrivalGate = firstString(
    nested(flight, 'arrival.gate'),
    nested(flight, 'arrivalGate'),
    nested(flight, 'arrival.gateNumber')
  );
  const departureTerminal = firstString(
    nested(flight, 'departure.terminal'),
    nested(flight, 'departureTerminal')
  );
  const arrivalTerminal = firstString(
    nested(flight, 'arrival.terminal'),
    nested(flight, 'arrivalTerminal')
  );

  const lat = firstDefined(
    parseNumber(nested(flight, 'location.latitude')),
    parseNumber(nested(flight, 'location.lat')),
    parseNumber(nested(flight, 'aircraft.location.latitude')),
    parseNumber(nested(flight, 'latitude'))
  );
  const lng = firstDefined(
    parseNumber(nested(flight, 'location.longitude')),
    parseNumber(nested(flight, 'location.lon')),
    parseNumber(nested(flight, 'aircraft.location.longitude')),
    parseNumber(nested(flight, 'longitude'))
  );

  const speedKmh = firstDefined(
    parseNumber(nested(flight, 'location.speed.kmh')),
    parseNumber(nested(flight, 'location.speed.kph')),
    (() => {
      const knots = parseNumber(nested(flight, 'location.speed.kts'));
      return knots !== null ? Math.round(knots * 1.852) : null;
    })()
  );

  const updatedAt = firstString(
    nested(flight, 'location.updatedUtc'),
    nested(flight, 'updatedUtc'),
    nested(flight, 'updatedAtUtc'),
    nested(flight, 'lastUpdatedUtc')
  ) || new Date().toISOString();

  const idRaw = firstString(nested(flight, 'number'), callsignRaw, nested(flight, 'flight.number'));

  return {
    id: normalizeFlightKey(idRaw) || `aerodatabox-${Math.random().toString(36).slice(2, 8)}`,
    callsign,
    airline: firstString(
      nested(flight, 'airline.name'),
      inferAirlineName(callsign),
      inferAirlineName(idRaw),
      nested(flight, 'airline.iata'),
      nested(flight, 'airline.icao')
    ),
    aircraft: firstString(nested(flight, 'aircraft.model'), nested(flight, 'aircraft.reg'), nested(flight, 'aircraft.icaoCode')),
    origin: firstString(
      nested(flight, 'departure.airport.iata'),
      nested(flight, 'departure.airport.icao'),
      nested(flight, 'movement.airport.iata')
    ),
    destination: firstString(
      nested(flight, 'arrival.airport.iata'),
      nested(flight, 'arrival.airport.icao'),
      nested(flight, 'movement.airport.iata')
    ),
    lat,
    lng,
    altitude: firstDefined(
      parseNumber(nested(flight, 'location.altitude.feet')),
      parseNumber(nested(flight, 'location.altitudeFeet')),
      parseNumber(nested(flight, 'aircraft.location.altitude'))
    ),
    speed: speedKmh,
    heading: firstDefined(parseNumber(nested(flight, 'location.heading')), parseNumber(nested(flight, 'location.track'))),
    status: mapAeroStatus(firstString(nested(flight, 'status'), nested(flight, 'movement.status'))),
    departureTime,
    arrivalTime,
    departureGate,
    arrivalGate,
    departureTerminal,
    arrivalTerminal,
    source: 'aerodatabox',
    updatedAt,
  };
}

async function fetchAeroDataBoxForAirport(code, apiKey, fromIso, toIso) {
  const headers = {
    'X-RapidAPI-Key': apiKey,
    'X-RapidAPI-Host': AERODATABOX_HOST,
  };

  const primaryUrl = `${AERODATABOX_BASE}/flights/airports/iata/${encodeURIComponent(code)}/${encodeURIComponent(fromIso)}/${encodeURIComponent(toIso)}?withLocation=true&withCargo=false&withPrivate=false`;
  const secondaryUrl = `${AERODATABOX_BASE}/flights/airports/iata/${encodeURIComponent(code)}?offsetMinutes=-120&durationMinutes=360&withLocation=true&withCargo=false&withPrivate=false`;

  try {
    return await fetchJsonWithTimeout(primaryUrl, { headers });
  } catch (primaryError) {
    console.warn(`[liveFlights] AeroDataBox primary endpoint falhou para ${code}: ${primaryError.message}`);
    return fetchJsonWithTimeout(secondaryUrl, { headers });
  }
}

async function fetchAeroDataBoxFlights() {
  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) {
    throw new Error('AERODATABOX_API_KEY nao configurada');
  }
  if (isAeroDataBoxCooldownActive()) {
    throw new Error(getAeroDataBoxCooldownMessage());
  }

  const airports = getConfiguredAirports();

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString();

  const flights = [];
  let okCount = 0;
  const delayMsRaw = Number(process.env.LIVE_AERODATABOX_DELAY_MS || 350);
  const delayMs = Number.isFinite(delayMsRaw) ? Math.max(0, delayMsRaw) : 350;

  for (let i = 0; i < airports.length; i += 1) {
    const code = airports[i];
    try {
      const payload = await fetchAeroDataBoxForAirport(code, apiKey, from, to);
      okCount += 1;
      const items = collectAeroFlights(payload);
      items.forEach((item) => flights.push(normalizeAeroDataBoxFlight(item)));
    } catch (error) {
      const message = error?.message || String(error);
      console.warn(`[liveFlights] AeroDataBox falhou para ${code}: ${message}`);
      if (isRateLimitErrorMessage(message)) {
        activateAeroDataBoxCooldown(message);
        break;
      }
    }
    if (delayMs && i < airports.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (okCount > 0) {
    clearAeroDataBoxCooldown();
  }
  if (okCount === 0) {
    throw new Error('AeroDataBox indisponivel para todos os aeroportos configurados');
  }
  return flights.filter((item) => item.id);
}

function toAirportHints(...values) {
  const out = [];
  values.forEach((value) => {
    if (!value) return;
    const match = String(value).toUpperCase().match(/\b[A-Z]{3}\b/);
    if (match) out.push(match[0]);
  });
  return out;
}

function mapLocalStatus(value) {
  const status = String(value || '').toUpperCase();
  if (['PREVISTO', 'EM_VOO', 'ATRASADO', 'CANCELADO', 'CONCLUIDO'].includes(status)) return status;
  return 'PREVISTO';
}

async function fetchLocalFlights() {
  const [rows] = await db.query(`
    SELECT
      v.numero_voo,
      v.companhia,
      v.status,
      v.horario_previsto,
      o.cidade AS origem_cidade,
      o.estado AS origem_estado,
      d.cidade AS destino_cidade,
      d.estado AS destino_estado
    FROM voo v
    INNER JOIN aeroporto o ON o.id = v.origem_id
    INNER JOIN aeroporto d ON d.id = v.destino_id
    ORDER BY v.horario_previsto DESC
    LIMIT 300
  `);

  return rows.map((row) => ({
    id: firstString(row.numero_voo) || `local-${Math.random().toString(36).slice(2, 8)}`,
    callsign: firstString(row.numero_voo),
    airline: firstString(row.companhia),
    aircraft: null,
    origin: `${row.origem_cidade || ''} ${row.origem_estado || ''}`.trim() || null,
    destination: `${row.destino_cidade || ''} ${row.destino_estado || ''}`.trim() || null,
    lat: null,
    lng: null,
    altitude: null,
    speed: null,
    heading: null,
    status: mapLocalStatus(row.status),
    departureTime: row.horario_previsto ? new Date(row.horario_previsto).toISOString() : null,
    arrivalTime: null,
    source: 'local',
    updatedAt: new Date().toISOString(),
  }));
}

async function fetchLocalFlightByKey(flightKey) {
  const [rows] = await db.query(
    `
    SELECT
      v.numero_voo,
      v.companhia,
      v.status,
      v.horario_previsto,
      ao.iata AS origem_iata,
      ao.cidade AS origem_cidade,
      ao.estado AS origem_estado,
      ad.iata AS destino_iata,
      ad.cidade AS destino_cidade,
      ad.estado AS destino_estado
    FROM voo v
    JOIN aeroporto ao ON ao.id = v.origem_id
    JOIN aeroporto ad ON ad.id = v.destino_id
    WHERE UPPER(REPLACE(v.numero_voo, ' ', '')) = ?
    LIMIT 1
    `,
    [normalizeFlightKey(flightKey)]
  );

  const row = rows?.[0];
  if (!row) return null;
  return {
    id: firstString(row.numero_voo),
    callsign: firstString(row.numero_voo),
    airline: firstString(row.companhia),
    aircraft: null,
    origin: firstString(row.origem_iata) || `${row.origem_cidade || ''} ${row.origem_estado || ''}`.trim() || null,
    destination: firstString(row.destino_iata) || `${row.destino_cidade || ''} ${row.destino_estado || ''}`.trim() || null,
    lat: null,
    lng: null,
    altitude: null,
    speed: null,
    heading: null,
    status: mapLocalStatus(row.status),
    departureTime: row.horario_previsto ? new Date(row.horario_previsto).toISOString() : null,
    arrivalTime: null,
    source: 'local',
    updatedAt: new Date().toISOString(),
  };
}

function pickBestFlight(a, b) {
  const isPresent = (value) => value !== null && value !== undefined && value !== '';
  const isAero = (item) => item?.source === 'aerodatabox';
  const isOpen = (item) => item?.source === 'opensky';

  const merged = { ...a, ...b };
  const aero = isAero(a) ? a : (isAero(b) ? b : null);
  const open = isOpen(a) ? a : (isOpen(b) ? b : null);

  const operationalFields = [
    'callsign',
    'airline',
    'aircraft',
    'origin',
    'destination',
    'status',
    'departureTime',
    'arrivalTime',
    'departureGate',
    'arrivalGate',
    'departureTerminal',
    'arrivalTerminal',
  ];
  operationalFields.forEach((key) => {
    if (aero && isPresent(aero[key])) {
      merged[key] = aero[key];
      return;
    }
    if (isPresent(a[key])) merged[key] = a[key];
    else if (isPresent(b[key])) merged[key] = b[key];
  });

  const positionFields = ['lat', 'lng', 'altitude', 'speed', 'heading'];
  positionFields.forEach((key) => {
    if (open && isPresent(open[key])) {
      merged[key] = open[key];
      return;
    }
    if (isPresent(a[key])) merged[key] = a[key];
    else if (isPresent(b[key])) merged[key] = b[key];
  });

  const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  merged.updatedAt = (aTime >= bTime ? a?.updatedAt : b?.updatedAt) || new Date().toISOString();
  merged.source = a?.source === b?.source ? a?.source : 'all';
  return merged;
}

function mergeFlights(items) {
  const byId = new Map();
  items.forEach((item) => {
    const keys = getFlightIdentityKeys(item);
    const existingKey = keys.find((key) => byId.has(key));
    const key = existingKey || canonicalFlightKey(item);
    if (!key) return;
    const next = byId.has(key) ? pickBestFlight(byId.get(key), item) : item;
    keys.forEach((alias) => byId.set(alias, next));
    if (!existingKey) {
      byId.set(key, next);
      return;
    }
  });
  return [...new Set(byId.values())];
}

function applyFilters(items, { status, limit }) {
  let out = items;
  if (status) {
    out = out.filter((item) => String(item.status || '').toLowerCase().includes(status));
  }
  out = out
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, limit);
  return out;
}

async function ensureLivePersistenceSchema() {
  if (!ensureLiveSchemaPromise) {
    ensureLiveSchemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS voo_live_estado (
          id INT AUTO_INCREMENT PRIMARY KEY,
          flight_key VARCHAR(32) NOT NULL,
          numero_voo VARCHAR(32) NULL,
          callsign VARCHAR(32) NULL,
          companhia VARCHAR(120) NULL,
          aeronave VARCHAR(120) NULL,
          origem VARCHAR(120) NULL,
          destino VARCHAR(120) NULL,
          latitude DECIMAL(10,6) NULL,
          longitude DECIMAL(10,6) NULL,
          altitude_pes INT NULL,
          velocidade_kmh INT NULL,
          rumo_graus DECIMAL(8,2) NULL,
          status VARCHAR(40) NULL,
          horario_partida DATETIME NULL,
          horario_chegada DATETIME NULL,
          portao_partida VARCHAR(20) NULL,
          portao_chegada VARCHAR(20) NULL,
          terminal_partida VARCHAR(20) NULL,
          terminal_chegada VARCHAR(20) NULL,
          fonte VARCHAR(30) NULL,
          fallback_fonte VARCHAR(30) NULL,
          atualizado_api_em DATETIME NULL,
          persistido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          payload_json JSON NULL,
          UNIQUE KEY uq_voo_live_estado_flight_key (flight_key),
          KEY idx_voo_live_estado_numero_voo (numero_voo),
          KEY idx_voo_live_estado_status (status),
          KEY idx_voo_live_estado_atualizado (atualizado_api_em)
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS voo_live_snapshot (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          flight_key VARCHAR(32) NOT NULL,
          numero_voo VARCHAR(32) NULL,
          callsign VARCHAR(32) NULL,
          companhia VARCHAR(120) NULL,
          aeronave VARCHAR(120) NULL,
          origem VARCHAR(120) NULL,
          destino VARCHAR(120) NULL,
          latitude DECIMAL(10,6) NULL,
          longitude DECIMAL(10,6) NULL,
          altitude_pes INT NULL,
          velocidade_kmh INT NULL,
          rumo_graus DECIMAL(8,2) NULL,
          status VARCHAR(40) NULL,
          horario_partida DATETIME NULL,
          horario_chegada DATETIME NULL,
          portao_partida VARCHAR(20) NULL,
          portao_chegada VARCHAR(20) NULL,
          terminal_partida VARCHAR(20) NULL,
          terminal_chegada VARCHAR(20) NULL,
          fonte VARCHAR(30) NULL,
          fallback_fonte VARCHAR(30) NULL,
          atualizado_api_em DATETIME NULL,
          capturado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          payload_json JSON NULL,
          KEY idx_voo_live_snapshot_flight_key (flight_key),
          KEY idx_voo_live_snapshot_numero_voo (numero_voo),
          KEY idx_voo_live_snapshot_capturado (capturado_em)
        )
      `);

      await db.query(`
        UPDATE voo_live_estado
        SET
          latitude = CASE WHEN latitude = 0 THEN NULL ELSE latitude END,
          longitude = CASE WHEN longitude = 0 THEN NULL ELSE longitude END,
          altitude_pes = CASE WHEN altitude_pes = 0 THEN NULL ELSE altitude_pes END,
          velocidade_kmh = CASE WHEN velocidade_kmh = 0 THEN NULL ELSE velocidade_kmh END,
          rumo_graus = CASE WHEN rumo_graus = 0 THEN NULL ELSE rumo_graus END
        WHERE fonte = 'aerodatabox'
          AND (
            latitude = 0 OR longitude = 0 OR altitude_pes = 0 OR velocidade_kmh = 0 OR rumo_graus = 0
          )
      `);
    })().catch((error) => {
      ensureLiveSchemaPromise = null;
      throw error;
    });
  }

  return ensureLiveSchemaPromise;
}

function toSqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeLiveFlightRecord(item, meta) {
  const flightKey = canonicalFlightKey(item);
  if (!flightKey) return null;

  return {
    flightKey,
    numeroVoo: firstString(item.id, item.callsign),
    callsign: firstString(item.callsign),
    companhia: firstString(item.airline, inferAirlineName(item.callsign), inferAirlineName(item.id)),
    aeronave: firstString(item.aircraft),
    origem: firstString(item.origin),
    destino: firstString(item.destination),
    latitude: parseNumber(item.lat),
    longitude: parseNumber(item.lng),
    altitudePes: parseNumber(item.altitude),
    velocidadeKmh: parseNumber(item.speed),
    rumoGraus: parseNumber(item.heading),
    status: firstString(item.status),
    horarioPartida: toSqlDateTime(item.departureTime),
    horarioChegada: toSqlDateTime(item.arrivalTime),
    portaoPartida: firstString(item.departureGate),
    portaoChegada: firstString(item.arrivalGate),
    terminalPartida: firstString(item.departureTerminal),
    terminalChegada: firstString(item.arrivalTerminal),
    fonte: firstString(item.source),
    fallbackFonte: firstString(meta?.fallback),
    atualizadoApiEm: toSqlDateTime(item.updatedAt),
    payloadJson: JSON.stringify(item),
  };
}

async function persistLiveFlights(items, meta) {
  if (!Array.isArray(items) || !items.length) return { saved: 0 };
  await ensureLivePersistenceSchema();

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let saved = 0;
	    for (const item of items) {
	      const row = normalizeLiveFlightRecord(item, meta);
	      if (!row) continue;
	      const aliasKeys = [...new Set(getFlightIdentityKeys(item).filter((key) => key !== row.flightKey))];
	      let previousPayload = null;
	      let previousRow = null;
	      if (aliasKeys.length) {
	        const aliasPlaceholders = aliasKeys.map(() => '?').join(', ');
	        const [existingRows] = await conn.query(
	          `
	          SELECT *
	          FROM voo_live_estado
	          WHERE flight_key IN (${aliasPlaceholders})
	             OR UPPER(REPLACE(COALESCE(numero_voo, ''), ' ', '')) IN (${aliasPlaceholders})
	             OR UPPER(REPLACE(COALESCE(callsign, ''), ' ', '')) IN (${aliasPlaceholders})
	          ORDER BY COALESCE(atualizado_api_em, persistido_em) DESC
	          LIMIT 1
	          `,
	          [...aliasKeys, ...aliasKeys, ...aliasKeys]
	        );
	        previousRow = existingRows?.[0] || null;
	        const rawPayload = previousRow?.payload_json;
	        if (rawPayload) {
	          try {
	            previousPayload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
	          } catch (_) {
	            previousPayload = null;
	          }
	        }
	      }
	      if (previousPayload) {
	        const enrichedItem = pickBestFlight(item, previousPayload);
	        const enrichedRow = normalizeLiveFlightRecord({ ...enrichedItem, id: row.flightKey }, meta);
	        Object.assign(row, enrichedRow, { flightKey: row.flightKey });
	      } else if (previousRow) {
	        row.numeroVoo = firstString(row.numeroVoo, previousRow.numero_voo);
	        row.callsign = firstString(row.callsign, previousRow.callsign);
	        row.companhia = firstString(row.companhia, previousRow.companhia);
	        row.aeronave = firstString(row.aeronave, previousRow.aeronave);
	        row.origem = firstString(row.origem, previousRow.origem);
	        row.destino = firstString(row.destino, previousRow.destino);
	      }

	      const params = [
        row.flightKey,
        row.numeroVoo,
        row.callsign,
        row.companhia,
        row.aeronave,
        row.origem,
        row.destino,
        row.latitude,
        row.longitude,
        row.altitudePes,
        row.velocidadeKmh,
        row.rumoGraus,
        row.status,
        row.horarioPartida,
        row.horarioChegada,
        row.portaoPartida,
        row.portaoChegada,
        row.terminalPartida,
        row.terminalChegada,
        row.fonte,
        row.fallbackFonte,
        row.atualizadoApiEm,
        row.payloadJson,
      ];

      await conn.query(
        `
        INSERT INTO voo_live_estado (
          flight_key, numero_voo, callsign, companhia, aeronave, origem, destino,
          latitude, longitude, altitude_pes, velocidade_kmh, rumo_graus, status,
          horario_partida, horario_chegada, portao_partida, portao_chegada,
          terminal_partida, terminal_chegada, fonte, fallback_fonte,
          atualizado_api_em, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	        ON DUPLICATE KEY UPDATE
	          numero_voo = COALESCE(VALUES(numero_voo), numero_voo),
	          callsign = COALESCE(VALUES(callsign), callsign),
	          companhia = COALESCE(VALUES(companhia), companhia),
	          aeronave = COALESCE(VALUES(aeronave), aeronave),
	          origem = COALESCE(VALUES(origem), origem),
	          destino = COALESCE(VALUES(destino), destino),
	          latitude = COALESCE(VALUES(latitude), NULLIF(latitude, 0)),
	          longitude = COALESCE(VALUES(longitude), NULLIF(longitude, 0)),
	          altitude_pes = COALESCE(VALUES(altitude_pes), NULLIF(altitude_pes, 0)),
	          velocidade_kmh = COALESCE(VALUES(velocidade_kmh), NULLIF(velocidade_kmh, 0)),
	          rumo_graus = COALESCE(VALUES(rumo_graus), NULLIF(rumo_graus, 0)),
	          status = COALESCE(VALUES(status), status),
	          horario_partida = COALESCE(VALUES(horario_partida), horario_partida),
	          horario_chegada = COALESCE(VALUES(horario_chegada), horario_chegada),
	          portao_partida = COALESCE(VALUES(portao_partida), portao_partida),
	          portao_chegada = COALESCE(VALUES(portao_chegada), portao_chegada),
	          terminal_partida = COALESCE(VALUES(terminal_partida), terminal_partida),
	          terminal_chegada = COALESCE(VALUES(terminal_chegada), terminal_chegada),
          fonte = VALUES(fonte),
          fallback_fonte = VALUES(fallback_fonte),
          atualizado_api_em = VALUES(atualizado_api_em),
          payload_json = VALUES(payload_json),
          persistido_em = CURRENT_TIMESTAMP
        `,
        params
      );

      await conn.query(
        `
        INSERT INTO voo_live_snapshot (
          flight_key, numero_voo, callsign, companhia, aeronave, origem, destino,
          latitude, longitude, altitude_pes, velocidade_kmh, rumo_graus, status,
          horario_partida, horario_chegada, portao_partida, portao_chegada,
          terminal_partida, terminal_chegada, fonte, fallback_fonte,
          atualizado_api_em, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params
      );
      saved += 1;
    }
    await conn.commit();
    return { saved };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function getPersistedLiveFlights({ limit, status, flightKey } = {}) {
  await ensureLivePersistenceSchema();
  const normalizedLimit = clamp(Number.parseInt(limit, 10) || 100, 1, 500);
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('LOWER(v.status) LIKE ?');
    params.push(`%${String(status).trim().toLowerCase()}%`);
  }
  if (flightKey) {
    const key = normalizeFlightKey(flightKey);
    if (key) {
      conditions.push('(v.flight_key = ? OR UPPER(REPLACE(COALESCE(v.numero_voo, \'\'), \' \', \'\')) = ?)');
      params.push(key, key);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await db.query(
    `
    SELECT
      v.flight_key,
      v.numero_voo,
      v.callsign,
      v.companhia,
      v.aeronave,
      v.origem,
      v.destino,
      v.latitude,
      v.longitude,
      v.altitude_pes,
      v.velocidade_kmh,
      v.rumo_graus,
      v.status,
      v.horario_partida,
      v.horario_chegada,
      v.portao_partida,
      v.portao_chegada,
      v.terminal_partida,
      v.terminal_chegada,
      v.fonte,
      v.fallback_fonte,
      v.atualizado_api_em,
      v.persistido_em,
      (
        SELECT COUNT(*)
        FROM voo_live_snapshot s
        WHERE s.flight_key = v.flight_key
      ) AS total_snapshots
    FROM voo_live_estado v
    ${where}
    ORDER BY COALESCE(v.atualizado_api_em, v.persistido_em) DESC
    LIMIT ?
    `,
    [...params, normalizedLimit]
  );

  return {
    items: rows,
    meta: {
      total: rows.length,
      limit: normalizedLimit,
      updatedAt: new Date().toISOString(),
    },
  };
}

async function getPersistedLiveFlightRaw(flightKey) {
  await ensureLivePersistenceSchema();
  const normalized = normalizeFlightKey(flightKey);
  if (!normalized) return null;
  const aliases = expandFlightKeyAliases(normalized);
  const placeholders = aliases.map(() => '?').join(', ');
  const [rows] = await db.query(
    `
    SELECT payload_json
    FROM voo_live_estado
    WHERE flight_key IN (${placeholders})
       OR UPPER(REPLACE(COALESCE(numero_voo, ''), ' ', '')) IN (${placeholders})
       OR UPPER(REPLACE(COALESCE(callsign, ''), ' ', '')) IN (${placeholders})
    ORDER BY COALESCE(atualizado_api_em, persistido_em) DESC
    LIMIT 1
    `,
    [...aliases, ...aliases, ...aliases]
  );
  const raw = rows?.[0]?.payload_json;
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_) {
    return null;
  }
}

async function fetchOpenSkyFlightByKey(flightKey) {
  const normalized = normalizeFlightKey(flightKey);
  if (!normalized) return null;
  const aliases = new Set(expandFlightKeyAliases(normalized));
  const flights = await fetchOpenSkyFlights();
  return flights.find((item) => getFlightIdentityKeys(item).some((key) => aliases.has(key))) || null;
}

async function fetchAeroDataBoxFlightByKey(flightKey, hints = {}) {
  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey || isAeroDataBoxCooldownActive()) return null;

  const normalized = normalizeFlightKey(flightKey);
  if (!normalized) return null;
  const aliases = new Set(expandFlightKeyAliases(normalized));

  const airportHints = [
    ...toAirportHints(hints.origin, hints.destination),
    ...getConfiguredAirports(),
  ];
  const airports = [...new Set(airportHints)].filter(Boolean).slice(0, 4);
  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString();

  for (const code of airports) {
    try {
      const payload = await fetchAeroDataBoxForAirport(code, apiKey, from, to);
      const flights = collectAeroFlights(payload).map(normalizeAeroDataBoxFlight);
      const found = flights.find((item) => getFlightIdentityKeys(item).some((key) => aliases.has(key)));
      if (found) return found;
    } catch (error) {
      const message = error?.message || String(error);
      if (isRateLimitErrorMessage(message)) {
        activateAeroDataBoxCooldown(message);
        return null;
      }
    }
  }
  return null;
}

async function getLiveFlightDetails({ flightKey } = {}) {
  const normalized = normalizeFlightKey(flightKey);
  if (!normalized) return null;

  const persisted = await getPersistedLiveFlightRaw(normalized);
  const local = await fetchLocalFlightByKey(normalized);
  const openSky = await fetchOpenSkyFlightByKey(normalized).catch(() => null);
  const hints = {
    origin: persisted?.origin || local?.origin,
    destination: persisted?.destination || local?.destination,
  };
  const aero = await fetchAeroDataBoxFlightByKey(normalized, hints).catch(() => null);

  const parts = [local, persisted, openSky, aero].filter(Boolean);
  if (!parts.length) return null;

  const item = parts.reduce((acc, current) => (acc ? pickBestFlight(acc, current) : current), null);
  return {
    item,
    meta: {
      source: item?.source || 'local',
      usedAeroDataBox: Boolean(aero),
      usedOpenSky: Boolean(openSky),
      usedLocal: Boolean(local),
      updatedAt: new Date().toISOString(),
    },
  };
}

async function getLiveFlights({ limit, source, status } = {}) {
  const normalized = {
    limit: normalizeLimit(limit),
    source: normalizeSourceQuery(source),
    status: normalizeStatusFilter(status),
  };
  const cacheKey = JSON.stringify(normalized);
  const ttlSeconds = getCacheTtlSeconds();
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { ...cached.data, meta: { ...cached.data.meta, cached: true } };
  }

  const sourceErrors = {};
  let sourceUsed = 'all';
  let merged = [];

  if (normalized.source === 'opensky') {
    try {
      merged = await fetchOpenSkyFlights();
      sourceUsed = 'opensky';
    } catch (error) {
      sourceErrors.opensky = error.message;
      console.warn(`[liveFlights] OpenSky indisponivel: ${error.message}`);
    }
  } else if (normalized.source === 'aerodatabox') {
    try {
      merged = await fetchAeroDataBoxFlights();
      sourceUsed = 'aerodatabox';
    } catch (error) {
      sourceErrors.aerodatabox = error.message;
      console.warn(`[liveFlights] AeroDataBox indisponivel: ${error.message}`);
    }
  } else {
    const results = await Promise.allSettled([fetchOpenSkyFlights(), fetchAeroDataBoxFlights()]);
    const openskyOk = results[0].status === 'fulfilled';
    const aeroOk = results[1].status === 'fulfilled';
    const openskyFlights = openskyOk ? results[0].value : [];
    const aeroFlights = aeroOk ? results[1].value : [];

    if (!openskyOk) {
      sourceErrors.opensky = results[0].reason?.message || String(results[0].reason);
      console.warn(`[liveFlights] OpenSky indisponivel: ${sourceErrors.opensky}`);
    }
    if (!aeroOk) {
      sourceErrors.aerodatabox = results[1].reason?.message || String(results[1].reason);
      console.warn(`[liveFlights] AeroDataBox indisponivel: ${sourceErrors.aerodatabox}`);
    }

    if (openskyFlights.length && aeroFlights.length) {
      merged = mergeFlights([...aeroFlights, ...openskyFlights]);
      sourceUsed = 'all';
    } else if (openskyFlights.length) {
      merged = openskyFlights;
      sourceUsed = 'opensky';
    } else if (aeroFlights.length) {
      merged = aeroFlights;
      sourceUsed = 'aerodatabox';
    }
  }

  let fallback = null;
  if (!merged.length) {
    merged = await fetchLocalFlights();
    sourceUsed = 'local';
    fallback = 'local';
    console.warn('[liveFlights] Fallback local aplicado');
  }

  const items = applyFilters(merged, normalized);
  const payload = {
    items,
    meta: {
      source: sourceUsed,
      fallback,
      cached: false,
      total: items.length,
      ttlSeconds,
      updatedAt: new Date().toISOString(),
      errors: Object.keys(sourceErrors).length ? sourceErrors : undefined,
    },
  };

  try {
    const persistence = await persistLiveFlights(items, payload.meta);
    payload.meta.persisted = true;
    payload.meta.persistedCount = persistence.saved;
  } catch (error) {
    payload.meta.persisted = false;
    payload.meta.persistenceError = error.message;
    console.error('[liveFlights] erro ao persistir voos ao vivo:', error);
  }

  cache.set(cacheKey, {
    expiresAt: now + ttlSeconds * 1000,
    data: payload,
  });

  return payload;
}

module.exports = {
  getLiveFlights,
  getPersistedLiveFlights,
  getLiveFlightDetails,
};
