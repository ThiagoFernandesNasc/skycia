const db = require('../db');
const fs = require('fs');
const path = require('path');

const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';
const OPEN_SKY_TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const AERODATABOX_HOST = 'aerodatabox.p.rapidapi.com';
const AERODATABOX_BASE = `https://${AERODATABOX_HOST}`;
const REQUEST_TIMEOUT_MS = 9000;
const MIN_CACHE_TTL = 20;
const MAX_CACHE_TTL = 40;

const cache = new Map();
const DEBUG_LOG = path.join(process.cwd(), 'opensky_debug.log');

function debugLog(message) {
  try {
    fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${message}\n`);
  } catch (_) {
    // ignore logging errors
  }
}

function parseNumber(value) {
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
    airline: inferAirlineFromCallsign(callsign),
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

  const payload = await fetchJsonWithTimeout(OPEN_SKY_URL, { headers });
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
    airline: firstString(nested(flight, 'airline.name'), nested(flight, 'airline.iata'), nested(flight, 'airline.icao')),
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

  const airports = String(process.env.LIVE_FLIGHTS_AIRPORTS || 'GRU,GIG,BSB')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 5);

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
      console.warn(`[liveFlights] AeroDataBox falhou para ${code}: ${error?.message || error}`);
    }
    if (delayMs && i < airports.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (okCount === 0) {
    throw new Error('AeroDataBox indisponivel para todos os aeroportos configurados');
  }
  return flights.filter((item) => item.id);
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

function pickBestFlight(a, b) {
  const isPresent = (value) => value !== null && value !== undefined && value !== '';
  const isAero = (item) => item?.source === 'aerodatabox';
  const isOpen = (item) => item?.source === 'opensky';

  const merged = { ...a, ...b };
  const aero = isAero(a) ? a : (isAero(b) ? b : null);
  const open = isOpen(a) ? a : (isOpen(b) ? b : null);

  const operationalFields = ['callsign', 'airline', 'aircraft', 'origin', 'destination', 'status', 'departureTime', 'arrivalTime'];
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
    const key = normalizeFlightKey(item.callsign) || normalizeFlightKey(item.id);
    if (!key) return;
    if (!byId.has(key)) {
      byId.set(key, item);
      return;
    }
    byId.set(key, pickBestFlight(byId.get(key), item));
  });
  return [...byId.values()];
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

  cache.set(cacheKey, {
    expiresAt: now + ttlSeconds * 1000,
    data: payload,
  });

  return payload;
}

module.exports = {
  getLiveFlights,
};
