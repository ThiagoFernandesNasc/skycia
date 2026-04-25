import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { jsPDF } from 'jspdf';
import api, { clearAuthToken, getAuthToken, setAuthToken } from './api';
import './App.css';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const MOCK_RELATORIOS = [
  { nome: 'Relatório de Voos - Diário', tipo: 'Operacional', tamanho: '2.4 MB', status: 'Pronto', lgpd: 'Conforme', dateOffsetDays: 0 },
  { nome: 'Análise de Atrasos - Semanal', tipo: 'Análise', tamanho: '1.8 MB', status: 'Pronto', lgpd: 'Conforme', dateOffsetDays: 0 },
  { nome: 'Manutenção de Aeronaves', tipo: 'Técnico', tamanho: '3.2 MB', status: 'Processando', lgpd: 'Conforme', dateOffsetDays: 0 },
  { nome: 'Ocupação de Portões', tipo: 'Operacional', tamanho: '1.1 MB', status: 'Pronto', lgpd: 'Conforme', dateOffsetDays: 0 },
  { nome: 'Performance Mensal', tipo: 'Gerencial', tamanho: '5.7 MB', status: 'Pronto', lgpd: 'Conforme', dateOffsetDays: -27 },
  { nome: 'Previsão de Atrasos - Próxima Semana', tipo: 'Preditivo', tamanho: '-', status: 'Agendado', lgpd: 'Conforme', dateOffsetDays: 1 },
];

const REPORT_NAME_EN = {
  'Relatório de Voos - Diário': 'Flight Report - Daily',
  'Análise de Atrasos - Semanal': 'Delay Analysis - Weekly',
  'Manutenção de Aeronaves': 'Aircraft Maintenance',
  'Ocupação de Portões': 'Gate Occupancy',
  'Performance Mensal': 'Monthly Performance',
  'Previsão de Atrasos - Próxima Semana': 'Delay Forecast - Next Week',
};

const REPORT_TYPE_EN = {
  Operacional: 'Operational',
  'Análise': 'Analysis',
  Técnico: 'Technical',
  Gerencial: 'Managerial',
  Preditivo: 'Predictive',
};

const ROLE_LABELS = {
  ADMIN: { pt: 'Administrador', en: 'Administrator' },
  OPERADOR: { pt: 'Operador', en: 'Operator' },
  PASSAGEIRO: { pt: 'Passageiro', en: 'Passenger' },
  CIA: { pt: 'Companhia', en: 'Airline' },
};

const DEFAULT_ASSISTANT_PT = 'Posso responder sobre o site e sobre voos. Exemplo: "quais voos estão atrasados?"';
const DEFAULT_ASSISTANT_EN = 'I can answer about the website and flights. Example: "which flights are delayed?"';

const LGPD_PURPOSES = [
  {
    key: 'OPERACIONAL',
    titlePt: 'Operação de voos',
    titleEn: 'Flight operations',
    descPt: 'Uso de dados de conta e navegação para monitorar voos, filtros, alertas e sessões.',
    descEn: 'Account and navigation data used for flight monitoring, filters, alerts and sessions.',
  },
  {
    key: 'IA_PREDITIVA',
    titlePt: 'IA preditiva',
    titleEn: 'Predictive AI',
    descPt: 'Uso de dados operacionais para estimar probabilidade de atraso do voo selecionado.',
    descEn: 'Operational data used to estimate delay probability for the selected flight.',
  },
  {
    key: 'IA_GENERATIVA',
    titlePt: 'IA generativa',
    titleEn: 'Generative AI',
    descPt: 'Uso do contexto enviado pelo usuario para gerar explicacoes e respostas no assistente.',
    descEn: 'User-provided context used to generate explanations and assistant answers.',
  },
  {
    key: 'RELATORIOS',
    titlePt: 'Relatorios e exportacoes',
    titleEn: 'Reports and exports',
    descPt: 'Tratamento de dados para gerar relatorios operacionais e arquivos de acompanhamento.',
    descEn: 'Data processing to generate operational reports and monitoring files.',
  },
  {
    key: 'AUDITORIA',
    titlePt: 'Auditoria e seguranca',
    titleEn: 'Audit and security',
    descPt: 'Registro de acessos e acoes criticas para rastreabilidade e seguranca da conta.',
    descEn: 'Access and critical action logs for traceability and account security.',
  },
];

function sanitizeFileName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function compareBySort(a, b, field, direction) {
  const left = String(a?.[field] ?? '').toLowerCase();
  const right = String(b?.[field] ?? '').toLowerCase();
  if (left === right) return 0;
  const base = left > right ? 1 : -1;
  return direction === 'desc' ? base * -1 : base;
}

function formatDateBr(date) {
  const d = new Date(date);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function shiftDays(baseDate, days = 0) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function buildInitialReports(baseDate = new Date()) {
  return MOCK_RELATORIOS.map((r) => ({
    ...r,
    data: formatDateBr(shiftDays(baseDate, r.dateOffsetDays)),
  }));
}

const LIVE_AIRLINE_POOL = [
  { name: 'LATAM', prefix: 'LA', fleet: ['Airbus A320', 'Boeing 787-9', 'Airbus A321neo'] },
  { name: 'Gol', prefix: 'G3', fleet: ['Boeing 737-800', 'Boeing 737 MAX 8'] },
  { name: 'Azul', prefix: 'AZ', fleet: ['Embraer E195', 'Airbus A320neo', 'Airbus A321neo'] },
  { name: 'TAP', prefix: 'TP', fleet: ['Airbus A330-900', 'Airbus A321LR'] },
  { name: 'Air France', prefix: 'AF', fleet: ['Airbus A350-900', 'Boeing 777-300ER'] },
  { name: 'Lufthansa', prefix: 'LH', fleet: ['Boeing 747-8', 'Airbus A350-900'] },
  { name: 'KLM', prefix: 'KL', fleet: ['Boeing 787-10', 'Boeing 777-300ER'] },
  { name: 'United', prefix: 'UA', fleet: ['Boeing 787-9', 'Boeing 777-300ER'] },
  { name: 'Qatar', prefix: 'QR', fleet: ['Boeing 777-300ER', 'Airbus A350-900'] },
  { name: 'Emirates', prefix: 'EK', fleet: ['Airbus A380-800', 'Boeing 777-300ER'] },
  { name: 'Singapore', prefix: 'SQ', fleet: ['Airbus A350-900', 'Boeing 787-10'] },
  { name: 'Qantas', prefix: 'QF', fleet: ['Boeing 787-9', 'Airbus A330-300'] },
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timePlusMinutes(baseDate, deltaMinutes) {
  const d = new Date(baseDate.getTime() + deltaMinutes * 60_000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickWeightedRisk() {
  const r = Math.random();
  if (r < 0.66) return 'operando';
  if (r < 0.9) return 'atencao';
  return 'atraso';
}

function buildLiveFlight(airports, takenIds) {
  const br = airports.filter((a) => a.country === 'Brasil');
  const intl = airports.filter((a) => a.country !== 'Brasil');
  const mix = Math.random();
  let fromAirport = null;
  let toAirport = null;

  if (mix < 0.34) {
    fromAirport = pickRandom(br);
    toAirport = pickRandom(br.filter((a) => a.code !== fromAirport.code));
  } else if (mix < 0.72) {
    const brToIntl = Math.random() < 0.5;
    if (brToIntl) {
      fromAirport = pickRandom(br);
      toAirport = pickRandom(intl);
    } else {
      fromAirport = pickRandom(intl);
      toAirport = pickRandom(br);
    }
  } else {
    fromAirport = pickRandom(intl);
    toAirport = pickRandom(intl.filter((a) => a.code !== fromAirport.code));
  }

  const airline = pickRandom(LIVE_AIRLINE_POOL);
  const fleet = pickRandom(airline.fleet);
  let flightNumber = '';
  for (let i = 0; i < 12; i += 1) {
    const candidate = `${airline.prefix}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!takenIds.has(candidate)) {
      flightNumber = candidate;
      break;
    }
  }
  if (!flightNumber) {
    flightNumber = `${airline.prefix}${Date.now().toString().slice(-4)}`;
  }

  const now = new Date();
  const distanceKm = haversineKm(fromAirport.lat, fromAirport.lng, toAirport.lat, toAirport.lng);
  const cruiseKmh = 720 + Math.random() * 220;
  const durationMinutes = Math.max(55, Math.round((distanceKm / cruiseKmh) * 60 + 35));
  const fromTime = timePlusMinutes(now, -Math.floor(Math.random() * 45));
  const toTime = timePlusMinutes(now, durationMinutes);
  const risk = pickWeightedRisk();
  const statusUpdated = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())} UTC`;
  const gateLetter = ['A', 'B', 'C', 'D', 'E'][Math.floor(Math.random() * 5)];
  const gate = `${gateLetter}${pad2(Math.floor(1 + Math.random() * 15))}`;
  const region = fromAirport.country === toAirport.country
    ? (fromAirport.country === 'Brasil' ? 'Nacional/Regional' : fromAirport.country)
    : `${fromAirport.country}/${toAirport.country}`;

  return {
    id: flightNumber,
    cia: airline.name,
    from: {
      code: fromAirport.code,
      city: fromAirport.city,
      x: 50,
      y: 50,
      time: fromTime,
      lat: fromAirport.lat,
      lng: fromAirport.lng,
    },
    to: {
      code: toAirport.code,
      city: toAirport.city,
      x: 50,
      y: 50,
      time: toTime,
      lat: toAirport.lat,
      lng: toAirport.lng,
    },
    altitude: `${Math.round(29000 + Math.random() * 13000).toLocaleString('pt-BR')} ft`,
    velocidade: `${Math.round(cruiseKmh)} km/h`,
    aeronave: fleet,
    portao: gate,
    progress: 0.02 + Math.random() * 0.12,
    speed: 0.009 + Math.random() * 0.014,
    risco: risk,
    regiao: region,
    atualizado: statusUpdated,
  };
}

const MAP_FLIGHTS_RAW = [
  {
    id: 'TP8091',
    cia: 'TAP',
    from: { code: 'GRU', city: 'Sao Paulo', x: 33, y: 66, time: '14:30' },
    to: { code: 'LIS', city: 'Lisboa', x: 47, y: 38, time: '05:45' },
    altitude: '38.000 ft',
    velocidade: '850 km/h',
    aeronave: 'Airbus A330-900',
    portao: 'A12',
    progress: 0.62,
    speed: 0.022,
    risco: 'operando',
    regiao: 'Europa',
    atualizado: '14:12 UTC',
  },
  {
    id: 'LA3502',
    cia: 'LATAM',
    from: { code: 'GRU', city: 'Sao Paulo', x: 33, y: 66, time: '15:15' },
    to: { code: 'SCL', city: 'Santiago', x: 29, y: 72, time: '18:30' },
    altitude: '36.200 ft',
    velocidade: '822 km/h',
    aeronave: 'Boeing 787-9',
    portao: 'B07',
    progress: 0.56,
    speed: 0.014,
    risco: 'operando',
    regiao: 'Nacional/Regional',
    atualizado: '14:15 UTC',
  },
  {
    id: 'AZ4123',
    cia: 'Azul',
    from: { code: 'VCP', city: 'Campinas', x: 33, y: 65, time: '15:25' },
    to: { code: 'REC', city: 'Recife', x: 36, y: 55, time: '18:10' },
    altitude: '31.400 ft',
    velocidade: '768 km/h',
    aeronave: 'Airbus A321neo',
    portao: 'A09',
    progress: 0.41,
    speed: 0.013,
    risco: 'atencao',
    regiao: 'Nacional/Regional',
    atualizado: '14:16 UTC',
  },
  {
    id: 'G31847',
    cia: 'Gol',
    from: { code: 'CGH', city: 'Sao Paulo', x: 33, y: 66, time: '15:45' },
    to: { code: 'BSB', city: 'Brasilia', x: 35, y: 62, time: '17:00' },
    altitude: '29.500 ft',
    velocidade: '744 km/h',
    aeronave: 'Boeing 737-800',
    portao: 'C04',
    progress: 0.49,
    speed: 0.015,
    risco: 'atencao',
    regiao: 'Nacional/Regional',
    atualizado: '14:18 UTC',
  },
  {
    id: 'AF0456',
    cia: 'Air France',
    from: { code: 'CDG', city: 'Paris', x: 46, y: 33, time: '17:30' },
    to: { code: 'GRU', city: 'Sao Paulo', x: 33, y: 66, time: '05:10' },
    altitude: '37.400 ft',
    velocidade: '840 km/h',
    aeronave: 'Airbus A350-900',
    portao: 'E11',
    progress: 0.52,
    speed: 0.012,
    risco: 'atraso',
    regiao: 'Europa',
    atualizado: '14:20 UTC',
  },
  {
    id: 'KL0679',
    cia: 'KLM',
    from: { code: 'AMS', city: 'Amsterdã', x: 47, y: 31, time: '16:20' },
    to: { code: 'NBO', city: 'Nairobi', x: 55, y: 58, time: '23:40' },
    altitude: '35.700 ft',
    velocidade: '812 km/h',
    aeronave: 'Boeing 787-10',
    portao: 'D10',
    progress: 0.47,
    speed: 0.011,
    risco: 'operando',
    regiao: 'Europa/Africa',
    atualizado: '14:11 UTC',
  },
  {
    id: 'BA0247',
    cia: 'British Airways',
    from: { code: 'LHR', city: 'Londres', x: 45, y: 32, time: '16:00' },
    to: { code: 'JNB', city: 'Johannesburgo', x: 54, y: 72, time: '04:20' },
    altitude: '39.100 ft',
    velocidade: '865 km/h',
    aeronave: 'Airbus A380-800',
    portao: 'C08',
    progress: 0.39,
    speed: 0.01,
    risco: 'atraso',
    regiao: 'Africa',
    atualizado: '14:08 UTC',
  },
  {
    id: 'ET0507',
    cia: 'Ethiopian',
    from: { code: 'ADD', city: 'Adis Abeba', x: 56, y: 55, time: '17:40' },
    to: { code: 'LOS', city: 'Lagos', x: 48, y: 56, time: '22:05' },
    altitude: '34.000 ft',
    velocidade: '790 km/h',
    aeronave: 'Boeing 777-200LR',
    portao: 'B03',
    progress: 0.63,
    speed: 0.012,
    risco: 'operando',
    regiao: 'Africa',
    atualizado: '14:10 UTC',
  },
  {
    id: 'EK0262',
    cia: 'Emirates',
    from: { code: 'DXB', city: 'Dubai', x: 56, y: 43, time: '18:00' },
    to: { code: 'SIN', city: 'Singapura', x: 69, y: 58, time: '06:55' },
    altitude: '41.000 ft',
    velocidade: '905 km/h',
    aeronave: 'Airbus A380-800',
    portao: 'D08',
    progress: 0.28,
    speed: 0.012,
    risco: 'atencao',
    regiao: 'Asia',
    atualizado: '14:13 UTC',
  },
  {
    id: 'QR0789',
    cia: 'Qatar',
    from: { code: 'DOH', city: 'Doha', x: 55, y: 44, time: '18:20' },
    to: { code: 'BKK', city: 'Bangkok', x: 66, y: 52, time: '01:40' },
    altitude: '38.600 ft',
    velocidade: '876 km/h',
    aeronave: 'Boeing 777-300ER',
    portao: 'D11',
    progress: 0.44,
    speed: 0.013,
    risco: 'operando',
    regiao: 'Asia',
    atualizado: '14:14 UTC',
  },
  {
    id: 'SQ0673',
    cia: 'Singapore',
    from: { code: 'SIN', city: 'Singapura', x: 69, y: 58, time: '19:00' },
    to: { code: 'NRT', city: 'Toquio', x: 82, y: 38, time: '02:30' },
    altitude: '36.900 ft',
    velocidade: '845 km/h',
    aeronave: 'Airbus A350-900',
    portao: 'E02',
    progress: 0.31,
    speed: 0.011,
    risco: 'atencao',
    regiao: 'Asia',
    atualizado: '14:09 UTC',
  },
  {
    id: 'UA0834',
    cia: 'United',
    from: { code: 'NRT', city: 'Toquio', x: 82, y: 38, time: '16:50' },
    to: { code: 'SFO', city: 'San Francisco', x: 12, y: 38, time: '01:15' },
    altitude: '39.100 ft',
    velocidade: '890 km/h',
    aeronave: 'Boeing 777-300ER',
    portao: 'D02',
    progress: 0.44,
    speed: 0.01,
    risco: 'atencao',
    regiao: 'America do Norte/Asia',
    atualizado: '14:05 UTC',
  },
  {
    id: 'IB6823',
    cia: 'Iberia',
    from: { code: 'MAD', city: 'Madri', x: 45, y: 35, time: '16:35' },
    to: { code: 'LIS', city: 'Lisboa', x: 43, y: 36, time: '17:40' },
    altitude: '25.000 ft',
    velocidade: '640 km/h',
    aeronave: 'Airbus A320',
    portao: 'C02',
    progress: 0.72,
    speed: 0.016,
    risco: 'operando',
    regiao: 'Europa',
    atualizado: '14:19 UTC',
  },
  {
    id: 'LH2098',
    cia: 'Lufthansa',
    from: { code: 'FRA', city: 'Frankfurt', x: 46, y: 33, time: '15:50' },
    to: { code: 'GRU', city: 'Sao Paulo', x: 33, y: 66, time: '04:30' },
    altitude: '37.000 ft',
    velocidade: '830 km/h',
    aeronave: 'Boeing 747-8',
    portao: 'E05',
    progress: 0.28,
    speed: 0.013,
    risco: 'operando',
    regiao: 'Europa',
    atualizado: '14:02 UTC',
  },
  {
    id: 'SU9876',
    cia: 'Aeroflot',
    from: { code: 'SVO', city: 'Moscou', x: 60, y: 28, time: '17:10' },
    to: { code: 'GRU', city: 'Sao Paulo', x: 33, y: 66, time: '03:50' },
    altitude: '36.500 ft',
    velocidade: '820 km/h',
    aeronave: 'Airbus A330',
    portao: 'E09',
    progress: 0.12,
    speed: 0.011,
    risco: 'operando',
    regiao: 'Europa/Asia',
    atualizado: '14:06 UTC',
  },
  {
    id: 'SA5599',
    cia: 'South African',
    from: { code: 'JNB', city: 'Johannesburgo', x: 54, y: 72, time: '18:20' },
    to: { code: 'LIS', city: 'Lisboa', x: 43, y: 36, time: '05:50' },
    altitude: '35.800 ft',
    velocidade: '815 km/h',
    aeronave: 'Boeing 777-200',
    portao: 'D01',
    progress: 0.46,
    speed: 0.012,
    risco: 'atencao',
    regiao: 'Africa/Europa',
    atualizado: '14:07 UTC',
  },
  {
    id: 'CA5678',
    cia: 'Air China',
    from: { code: 'PEK', city: 'Pequim', x: 80, y: 36, time: '19:05' },
    to: { code: 'GRU', city: 'Sao Paulo', x: 33, y: 66, time: '06:40' },
    altitude: '39.000 ft',
    velocidade: '860 km/h',
    aeronave: 'Boeing 777-300ER',
    portao: 'F02',
    progress: 0.05,
    speed: 0.014,
    risco: 'operando',
    regiao: 'Asia',
    atualizado: '14:01 UTC',
  },
  {
    id: 'QF400',
    cia: 'Qantas',
    from: { code: 'SYD', city: 'Sydney', x: 95, y: 50, time: '20:10' },
    to: { code: 'AKL', city: 'Auckland', x: 98, y: 44, time: '05:10' },
    altitude: '34.000 ft',
    velocidade: '780 km/h',
    aeronave: 'Boeing 787-9',
    portao: 'A01',
    progress: 0.66,
    speed: 0.012,
    risco: 'operando',
    regiao: 'Oceania',
    atualizado: '14:21 UTC',
  },
  {
    id: 'G32001',
    cia: 'Gol',
    from: { code: 'GRU', city: 'Sao Paulo', x: 33, y: 66, time: '16:05' },
    to: { code: 'CNF', city: 'Belo Horizonte', x: 34, y: 68, time: '17:20' },
    altitude: '28.500 ft',
    velocidade: '720 km/h',
    aeronave: 'Boeing 737-800',
    portao: 'C05',
    progress: 0.22,
    speed: 0.02,
    risco: 'operando',
    regiao: 'Nacional',
    atualizado: '14:17 UTC',
  },
  {
    id: 'AZ5000',
    cia: 'Azul',
    from: { code: 'VCP', city: 'Campinas', x: 33, y: 65, time: '16:40' },
    to: { code: 'BEL', city: 'Belem', x: 38, y: 50, time: '19:10' },
    altitude: '30.200 ft',
    velocidade: '760 km/h',
    aeronave: 'Embraer E195',
    portao: 'B09',
    progress: 0.12,
    speed: 0.018,
    risco: 'operando',
    regiao: 'Nacional',
    atualizado: '14:22 UTC',
  },
  {
    id: 'KQ7700',
    cia: 'Kenya Airways',
    from: { code: 'NBO', city: 'Nairobi', x: 55, y: 58, time: '18:50' },
    to: { code: 'LHR', city: 'Londres', x: 45, y: 32, time: '05:00' },
    altitude: '36.700 ft',
    velocidade: '825 km/h',
    aeronave: 'Boeing 787-8',
    portao: 'D15',
    progress: 0.34,
    speed: 0.012,
    risco: 'operando',
    regiao: 'Africa/Europa',
    atualizado: '14:12 UTC',
  },
];

const AIRPORT_COORDS = {
  ADD: { lat: 8.9779, lng: 38.7993 },
  AKL: { lat: -37.0082, lng: 174.785 },
  AMS: { lat: 52.3105, lng: 4.7683 },
  BEL: { lat: -1.3793, lng: -48.4763 },
  BKK: { lat: 13.69, lng: 100.7501 },
  BSB: { lat: -15.8692, lng: -47.9208 },
  CDG: { lat: 49.0097, lng: 2.5479 },
  CGH: { lat: -23.6267, lng: -46.6564 },
  CNF: { lat: -19.6357, lng: -43.9669 },
  CGR: { lat: -20.4697, lng: -54.6725 },
  DOH: { lat: 25.2736, lng: 51.6081 },
  IGU: { lat: -25.6003, lng: -54.4857 },
  DXB: { lat: 25.2532, lng: 55.3657 },
  FRA: { lat: 50.0379, lng: 8.5622 },
  GRU: { lat: -23.4356, lng: -46.4731 },
  JNB: { lat: -26.1337, lng: 28.242 },
  LHR: { lat: 51.47, lng: -0.4543 },
  LIS: { lat: 38.7742, lng: -9.1342 },
  LOS: { lat: 6.5774, lng: 3.3212 },
  MAD: { lat: 40.4983, lng: -3.5676 },
  NBO: { lat: -1.3192, lng: 36.9278 },
  NRT: { lat: 35.772, lng: 140.3929 },
  PEK: { lat: 40.0799, lng: 116.6031 },
  REC: { lat: -8.1265, lng: -34.9236 },
  SCL: { lat: -33.3929, lng: -70.7858 },
  SFO: { lat: 37.6213, lng: -122.379 },
  SIN: { lat: 1.3644, lng: 103.9915 },
  SVO: { lat: 55.9726, lng: 37.4146 },
  STM: { lat: -2.422, lng: -54.7923 },
  SYD: { lat: -33.9399, lng: 151.1753 },
  SJP: { lat: -20.8166, lng: -49.4065 },
  NVT: { lat: -26.8799, lng: -48.6514 },
  VCP: { lat: -23.0074, lng: -47.1345 },
};

function pointGridToLatLng(point) {
  return [85 - point.y * 1.7, point.x * 3.6 - 180];
}

function enrichAirportPoint(point) {
  const coord = AIRPORT_COORDS[point.code];
  if (coord) return { ...point, lat: coord.lat, lng: coord.lng };
  const [lat, lng] = pointGridToLatLng(point);
  return { ...point, lat, lng };
}

const MAP_FLIGHTS = MAP_FLIGHTS_RAW.map((flight) => ({
  ...flight,
  from: enrichAirportPoint(flight.from),
  to: enrichAirportPoint(flight.to),
}));

const MAP_AIRPORT_POINTS = [
  // Brasil (por estado)
  { code: 'GRU', city: 'Sao Paulo', country: 'Brasil', state: 'SP', lat: -23.4356, lng: -46.4731 },
  { code: 'CGH', city: 'Sao Paulo', country: 'Brasil', state: 'SP', lat: -23.6267, lng: -46.6564 },
  { code: 'CGR', city: 'Campo Grande', country: 'Brasil', state: 'MS', lat: -20.4697, lng: -54.6725 },
  { code: 'VCP', city: 'Campinas', country: 'Brasil', state: 'SP', lat: -23.0074, lng: -47.1345 },
  { code: 'SJP', city: 'Sao Jose do Rio Preto', country: 'Brasil', state: 'SP', lat: -20.8166, lng: -49.4065 },
  { code: 'SDU', city: 'Rio de Janeiro', country: 'Brasil', state: 'RJ', lat: -22.9114, lng: -43.1649 },
  { code: 'GIG', city: 'Rio de Janeiro', country: 'Brasil', state: 'RJ', lat: -22.809, lng: -43.2506 },
  { code: 'BSB', city: 'Brasilia', country: 'Brasil', state: 'DF', lat: -15.8692, lng: -47.9208 },
  { code: 'CNF', city: 'Belo Horizonte', country: 'Brasil', state: 'MG', lat: -19.6357, lng: -43.9669 },
  { code: 'REC', city: 'Recife', country: 'Brasil', state: 'PE', lat: -8.1265, lng: -34.9236 },
  { code: 'SSA', city: 'Salvador', country: 'Brasil', state: 'BA', lat: -12.9086, lng: -38.3225 },
  { code: 'FOR', city: 'Fortaleza', country: 'Brasil', state: 'CE', lat: -3.7763, lng: -38.5326 },
  { code: 'BEL', city: 'Belem', country: 'Brasil', state: 'PA', lat: -1.3793, lng: -48.4763 },
  { code: 'STM', city: 'Santarem', country: 'Brasil', state: 'PA', lat: -2.422, lng: -54.7923 },
  { code: 'MAO', city: 'Manaus', country: 'Brasil', state: 'AM', lat: -3.0386, lng: -60.0497 },
  { code: 'NVT', city: 'Navegantes', country: 'Brasil', state: 'SC', lat: -26.8799, lng: -48.6514 },
  { code: 'IGU', city: 'Foz do Iguacu', country: 'Brasil', state: 'PR', lat: -25.6003, lng: -54.4857 },
  { code: 'POA', city: 'Porto Alegre', country: 'Brasil', state: 'RS', lat: -29.9944, lng: -51.1714 },
  { code: 'CWB', city: 'Curitiba', country: 'Brasil', state: 'PR', lat: -25.5317, lng: -49.1761 },
  { code: 'FLN', city: 'Florianopolis', country: 'Brasil', state: 'SC', lat: -27.6703, lng: -48.5525 },
  { code: 'NAT', city: 'Natal', country: 'Brasil', state: 'RN', lat: -5.7681, lng: -35.3761 },
  { code: 'MCZ', city: 'Maceio', country: 'Brasil', state: 'AL', lat: -9.5108, lng: -35.7917 },
  { code: 'AJU', city: 'Aracaju', country: 'Brasil', state: 'SE', lat: -10.984, lng: -37.0703 },
  { code: 'GYN', city: 'Goiania', country: 'Brasil', state: 'GO', lat: -16.632, lng: -49.2207 },
  { code: 'CGB', city: 'Cuiaba', country: 'Brasil', state: 'MT', lat: -15.6529, lng: -56.1167 },
  { code: 'PMW', city: 'Palmas', country: 'Brasil', state: 'TO', lat: -10.2915, lng: -48.357 },
  { code: 'RIO', city: 'Rio Branco', country: 'Brasil', state: 'AC', lat: -9.8689, lng: -67.8981 },
  { code: 'BVB', city: 'Boa Vista', country: 'Brasil', state: 'RR', lat: 2.8463, lng: -60.6909 },
  { code: 'PVH', city: 'Porto Velho', country: 'Brasil', state: 'RO', lat: -8.7093, lng: -63.9023 },
  { code: 'MCP', city: 'Macapa', country: 'Brasil', state: 'AP', lat: 0.0507, lng: -51.0722 },
  { code: 'THE', city: 'Teresina', country: 'Brasil', state: 'PI', lat: -5.0607, lng: -42.8235 },
  { code: 'SLZ', city: 'Sao Luis', country: 'Brasil', state: 'MA', lat: -2.5854, lng: -44.2341 },
  { code: 'VIX', city: 'Vitoria', country: 'Brasil', state: 'ES', lat: -20.258, lng: -40.2864 },
  { code: 'JPA', city: 'Joao Pessoa', country: 'Brasil', state: 'PB', lat: -7.1459, lng: -34.9486 },
  { code: 'UDI', city: 'Uberlandia', country: 'Brasil', state: 'MG', lat: -18.8836, lng: -48.2253 },
  // Internacional (por pais)
  // America do Sul
  { code: 'SCL', city: 'Santiago', country: 'Chile', state: '-', lat: -33.3929, lng: -70.7858 },
  { code: 'EZE', city: 'Buenos Aires', country: 'Argentina', state: '-', lat: -34.8222, lng: -58.5358 },
  { code: 'AEP', city: 'Buenos Aires', country: 'Argentina', state: '-', lat: -34.5592, lng: -58.4156 },
  { code: 'MVD', city: 'Montevideu', country: 'Uruguai', state: '-', lat: -34.8384, lng: -56.0308 },
  { code: 'ASU', city: 'Assuncao', country: 'Paraguai', state: '-', lat: -25.2399, lng: -57.5191 },
  { code: 'LIM', city: 'Lima', country: 'Peru', state: '-', lat: -12.0219, lng: -77.1143 },
  { code: 'BOG', city: 'Bogota', country: 'Colombia', state: '-', lat: 4.7016, lng: -74.1469 },
  { code: 'UIO', city: 'Quito', country: 'Equador', state: '-', lat: -0.1292, lng: -78.3575 },
  { code: 'CCS', city: 'Caracas', country: 'Venezuela', state: '-', lat: 10.6031, lng: -66.9906 },
  // America do Norte e Central
  { code: 'SFO', city: 'San Francisco', country: 'EUA', state: 'CA', lat: 37.6213, lng: -122.379 },
  { code: 'LAX', city: 'Los Angeles', country: 'EUA', state: 'CA', lat: 33.9416, lng: -118.4085 },
  { code: 'JFK', city: 'Nova York', country: 'EUA', state: 'NY', lat: 40.6413, lng: -73.7781 },
  { code: 'EWR', city: 'Newark', country: 'EUA', state: 'NJ', lat: 40.6895, lng: -74.1745 },
  { code: 'MIA', city: 'Miami', country: 'EUA', state: 'FL', lat: 25.7959, lng: -80.287 },
  { code: 'ORD', city: 'Chicago', country: 'EUA', state: 'IL', lat: 41.9742, lng: -87.9073 },
  { code: 'ATL', city: 'Atlanta', country: 'EUA', state: 'GA', lat: 33.6407, lng: -84.4277 },
  { code: 'IAD', city: 'Washington', country: 'EUA', state: 'VA', lat: 38.9531, lng: -77.4565 },
  { code: 'SEA', city: 'Seattle', country: 'EUA', state: 'WA', lat: 47.4502, lng: -122.3088 },
  { code: 'YYZ', city: 'Toronto', country: 'Canada', state: '-', lat: 43.6777, lng: -79.6248 },
  { code: 'YVR', city: 'Vancouver', country: 'Canada', state: '-', lat: 49.1967, lng: -123.1815 },
  { code: 'MEX', city: 'Cidade do Mexico', country: 'Mexico', state: '-', lat: 19.4361, lng: -99.0719 },
  { code: 'PTY', city: 'Cidade do Panama', country: 'Panama', state: '-', lat: 9.0714, lng: -79.3835 },
  // Europa
  { code: 'LIS', city: 'Lisboa', country: 'Portugal', state: '-', lat: 38.7742, lng: -9.1342 },
  { code: 'OPO', city: 'Porto', country: 'Portugal', state: '-', lat: 41.2481, lng: -8.6814 },
  { code: 'MAD', city: 'Madri', country: 'Espanha', state: '-', lat: 40.4983, lng: -3.5676 },
  { code: 'BCN', city: 'Barcelona', country: 'Espanha', state: '-', lat: 41.2974, lng: 2.0833 },
  { code: 'CDG', city: 'Paris', country: 'Franca', state: '-', lat: 49.0097, lng: 2.5479 },
  { code: 'ORY', city: 'Paris', country: 'Franca', state: '-', lat: 48.7262, lng: 2.3652 },
  { code: 'FRA', city: 'Frankfurt', country: 'Alemanha', state: '-', lat: 50.0379, lng: 8.5622 },
  { code: 'MUC', city: 'Munique', country: 'Alemanha', state: '-', lat: 48.3538, lng: 11.7861 },
  { code: 'AMS', city: 'Amsterdã', country: 'Holanda', state: '-', lat: 52.3105, lng: 4.7683 },
  { code: 'LHR', city: 'Londres', country: 'Reino Unido', state: '-', lat: 51.47, lng: -0.4543 },
  { code: 'LGW', city: 'Londres', country: 'Reino Unido', state: '-', lat: 51.1537, lng: -0.1821 },
  { code: 'DUB', city: 'Dublin', country: 'Irlanda', state: '-', lat: 53.4213, lng: -6.2701 },
  { code: 'FCO', city: 'Roma', country: 'Italia', state: '-', lat: 41.8003, lng: 12.2389 },
  { code: 'MXP', city: 'Milao', country: 'Italia', state: '-', lat: 45.63, lng: 8.7281 },
  { code: 'ZRH', city: 'Zurique', country: 'Suica', state: '-', lat: 47.4581, lng: 8.5555 },
  { code: 'VIE', city: 'Viena', country: 'Austria', state: '-', lat: 48.1103, lng: 16.5697 },
  { code: 'CPH', city: 'Copenhague', country: 'Dinamarca', state: '-', lat: 55.6181, lng: 12.656 },
  { code: 'ARN', city: 'Estocolmo', country: 'Suecia', state: '-', lat: 59.6519, lng: 17.9186 },
  { code: 'OSL', city: 'Oslo', country: 'Noruega', state: '-', lat: 60.1939, lng: 11.1004 },
  { code: 'HEL', city: 'Helsinque', country: 'Finlandia', state: '-', lat: 60.3172, lng: 24.9633 },
  { code: 'SVO', city: 'Moscou', country: 'Rússia', state: '-', lat: 55.9726, lng: 37.4146 },
  { code: 'IST', city: 'Istambul', country: 'Turquia', state: '-', lat: 41.2753, lng: 28.7519 },
  { code: 'ATH', city: 'Atenas', country: 'Grecia', state: '-', lat: 37.9364, lng: 23.9475 },
  // Africa
  { code: 'NBO', city: 'Nairobi', country: 'Quenia', state: '-', lat: -1.3192, lng: 36.9278 },
  { code: 'JNB', city: 'Johannesburgo', country: 'Africa do Sul', state: '-', lat: -26.1337, lng: 28.242 },
  { code: 'CPT', city: 'Cidade do Cabo', country: 'Africa do Sul', state: '-', lat: -33.97, lng: 18.5972 },
  { code: 'ADD', city: 'Adis Abeba', country: 'Etiopia', state: '-', lat: 8.9779, lng: 38.7993 },
  { code: 'LOS', city: 'Lagos', country: 'Nigeria', state: '-', lat: 6.5774, lng: 3.3212 },
  { code: 'CAI', city: 'Cairo', country: 'Egito', state: '-', lat: 30.1219, lng: 31.4056 },
  { code: 'CMN', city: 'Casablanca', country: 'Marrocos', state: '-', lat: 33.3675, lng: -7.5899 },
  { code: 'ALG', city: 'Argel', country: 'Argelia', state: '-', lat: 36.691, lng: 3.2154 },
  { code: 'DSS', city: 'Dacar', country: 'Senegal', state: '-', lat: 14.67, lng: -17.0733 },
  // Oriente Medio e Asia
  { code: 'DXB', city: 'Dubai', country: 'EAU', state: '-', lat: 25.2532, lng: 55.3657 },
  { code: 'AUH', city: 'Abu Dhabi', country: 'EAU', state: '-', lat: 24.433, lng: 54.6511 },
  { code: 'DOH', city: 'Doha', country: 'Catar', state: '-', lat: 25.2736, lng: 51.6081 },
  { code: 'RUH', city: 'Riade', country: 'Arabia Saudita', state: '-', lat: 24.9576, lng: 46.6988 },
  { code: 'TLV', city: 'Tel Aviv', country: 'Israel', state: '-', lat: 32.0005, lng: 34.8708 },
  { code: 'BKK', city: 'Bangkok', country: 'Tailandia', state: '-', lat: 13.69, lng: 100.7501 },
  { code: 'SIN', city: 'Singapura', country: 'Singapura', state: '-', lat: 1.3644, lng: 103.9915 },
  { code: 'KUL', city: 'Kuala Lumpur', country: 'Malasia', state: '-', lat: 2.7456, lng: 101.7072 },
  { code: 'CGK', city: 'Jacarta', country: 'Indonesia', state: '-', lat: -6.1256, lng: 106.6559 },
  { code: 'DEL', city: 'Nova Delhi', country: 'India', state: '-', lat: 28.5562, lng: 77.1 },
  { code: 'BOM', city: 'Mumbai', country: 'India', state: '-', lat: 19.0896, lng: 72.8656 },
  { code: 'HKG', city: 'Hong Kong', country: 'China', state: '-', lat: 22.308, lng: 113.9185 },
  { code: 'PVG', city: 'Xangai', country: 'China', state: '-', lat: 31.1443, lng: 121.8083 },
  { code: 'PEK', city: 'Pequim', country: 'China', state: '-', lat: 40.0799, lng: 116.6031 },
  { code: 'ICN', city: 'Seul', country: 'Coreia do Sul', state: '-', lat: 37.4602, lng: 126.4407 },
  { code: 'NRT', city: 'Toquio', country: 'Japao', state: '-', lat: 35.772, lng: 140.3929 },
  { code: 'HND', city: 'Toquio', country: 'Japao', state: '-', lat: 35.5494, lng: 139.7798 },
  // Oceania
  { code: 'SYD', city: 'Sydney', country: 'Australia', state: '-', lat: -33.9399, lng: 151.1753 },
  { code: 'MEL', city: 'Melbourne', country: 'Australia', state: '-', lat: -37.669, lng: 144.841 },
  { code: 'BNE', city: 'Brisbane', country: 'Australia', state: '-', lat: -27.3842, lng: 153.1175 },
  { code: 'PER', city: 'Perth', country: 'Australia', state: '-', lat: -31.9403, lng: 115.9672 },
  { code: 'AKL', city: 'Auckland', country: 'Nova Zelandia', state: '-', lat: -37.0082, lng: 174.785 },
  { code: 'CHC', city: 'Christchurch', country: 'Nova Zelandia', state: '-', lat: -43.4894, lng: 172.5322 },
];

function mask(text, enabled) {
  return enabled ? '***' : text;
}

function statusClass(status) {
  const value = String(status).toLowerCase();
  if (value.includes('cancel')) return 'danger';
  if (value.includes('atraso') || value.includes('processando')) return 'warn';
  if (value.includes('agendado') || value.includes('programado') || value.includes('voo')) return 'info';
  return 'ok';
}

function aircraftStatusMeta(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('manut')) return { tone: 'danger', label: 'Manutenção' };
  if (value.includes('disp')) return { tone: 'ok', label: 'Disponível' };
  if (value.includes('prog')) return { tone: 'warn', label: 'Programado' };
  return { tone: 'info', label: 'Em Voo' };
}

function pointToLatLng(point) {
  if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng)) {
    return [point.lat, point.lng];
  }
  return pointGridToLatLng(point);
}

function shortestLngDelta(fromLng, toLng) {
  let delta = toLng - fromLng;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function normalizeLng(lng) {
  let value = lng;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function routeLatLngs(from, to) {
  const [fromLat, fromLng] = pointToLatLng(from);
  const [toLat, toLng] = pointToLatLng(to);
  const delta = shortestLngDelta(fromLng, toLng);
  return [
    [fromLat, fromLng],
    [toLat, fromLng + delta],
  ];
}

function interpolatePoint(from, to, progress) {
  const [fromLat, fromLng] = pointToLatLng(from);
  const [toLat, toLng] = pointToLatLng(to);
  const deltaLng = shortestLngDelta(fromLng, toLng);
  return {
    lat: fromLat + (toLat - fromLat) * progress,
    lng: normalizeLng(fromLng + deltaLng * progress),
  };
}

function headingDegrees(from, to) {
  const [fromLat, fromLng] = pointToLatLng(from);
  const [toLat, toLng] = pointToLatLng(to);
  const dy = fromLat - toLat;
  const dx = shortestLngDelta(fromLng, toLng);
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
}

const MAP_TICK_MS = 120;
const MAP_TICK_SECONDS = MAP_TICK_MS / 1000;
const LIVE_REFRESH_MS = 25000;
const LIVE_FLIGHTS_LIMIT = 30;
const AUTH_SESSION_STORAGE_KEY = 'auth_session';

function getStoredSessionFlag() {
  return localStorage.getItem(AUTH_SESSION_STORAGE_KEY) || sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
}

function getRememberMeDefault() {
  return !!localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
}

function persistSessionFlag(isAuthed, rememberMe) {
  if (isAuthed) {
    if (rememberMe) {
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, '1');
      sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    } else {
      sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, '1');
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  } else {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  }
}

function planeIcon(risco, selected, angle) {
  const svgPlane = `<span class="plane-glyph" style="transform: rotate(${angle}deg);">✈</span>`;
  return L.divIcon({
    className: 'plane-icon-wrapper',
    html: `<div class="plane-pin ${risco} ${selected ? 'selected' : ''}">${svgPlane}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function riscoLabel(risco) {
  if (risco === 'atraso') return 'Risco alto de atraso';
  if (risco === 'atencao') return 'Risco moderado';
  return 'Operação estável';
}

function mapFlightStatus(risco) {
  if (risco === 'atraso') return 'Atraso Provável';
  if (risco === 'atencao') return 'Em Voo';
  return 'Confirmado';
}

function mapFlightToTableRow(flight) {
  return {
    cia: flight.cia,
    numero: flight.id,
    destino: flight.to?.city || flight.to?.code || '-',
    horario: flight.from?.time || flight.atualizado || '-',
    portao: flight.portao || '-',
    status: mapFlightStatus(flight.risco),
  };
}

function mapFlightToAircraftStatus(risco) {
  if (risco === 'atraso') return 'Manutenção';
  if (risco === 'atencao') return 'Programado';
  return 'Em Voo';
}

function mapFlightToAircraftCard(flight) {
  return {
    id: flight.id,
    modelo: flight.aeronave || '-',
    cia: flight.cia || '-',
    status: mapFlightToAircraftStatus(flight.risco),
    localizacao: `Em Rota - ${flight.from?.code || '-'}/${flight.to?.code || '-'}`,
    proximo: flight.id || '-',
    manutencao: flight.atualizado || '-',
  };
}

function liveSourceBadgeLabel(source, tr) {
  const value = String(source || '').toLowerCase();
  if (value === 'opensky') return tr('OpenSky', 'OpenSky');
  if (value === 'aerodatabox') return tr('AeroDataBox', 'AeroDataBox');
  if (value === 'local') return tr('Fallback local', 'Local fallback');
  if (value === 'all') return tr('OpenSky + AeroDataBox', 'OpenSky + AeroDataBox');
  return tr('Fallback local', 'Local fallback');
}

function hashFromString(value) {
  const input = String(value || 'live');
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeLiveRisk(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('cancel') || value.includes('atras')) return 'atraso';
  if (value.includes('prev') || value.includes('scheduled') || value.includes('boarding')) return 'atencao';
  return 'operando';
}

function formatTimeFromIso(value) {
  if (!value) return '--:--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatUtcClock(value) {
  if (!value) return '--:-- UTC';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--:-- UTC';
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

function formatCoord(value, isLat) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const dir = n >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
  return `${Math.abs(n).toFixed(2)}° ${dir}`;
}

function formatHeading(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${Math.round(n)}°`;
}

function formatDistanceKm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${Math.round(n).toLocaleString('pt-BR')} km`;
}

function weatherLabelFromCode(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return 'Desconhecido';
  if (c === 0) return 'Céu limpo';
  if (c <= 3) return 'Parcialmente nublado';
  if (c === 45 || c === 48) return 'Neblina';
  if (c >= 51 && c <= 57) return 'Garoa';
  if (c >= 61 && c <= 67) return 'Chuva';
  if (c >= 71 && c <= 77) return 'Neve';
  if (c >= 80 && c <= 82) return 'Pancadas';
  if (c >= 95) return 'Tempestade';
  return 'Instável';
}

function parseAirportRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return { code: 'UNK', city: 'Unknown' };
  const upper = raw.toUpperCase();
  if (/^[A-Z]{3,4}$/.test(upper)) return { code: upper.slice(0, 3), city: upper.slice(0, 3) };
  const codeMatch = upper.match(/\b[A-Z]{3,4}\b/);
  if (codeMatch) return { code: codeMatch[0].slice(0, 3), city: raw };
  const simpleCode = raw.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'UNK';
  return { code: simpleCode, city: raw };
}

function pseudoPointFromSeed(seed, hint) {
  const h1 = hashFromString(`${seed}-lat`);
  const h2 = hashFromString(`${seed}-lng`);
  const lat = -60 + (h1 % 120) + ((h1 % 100) / 100);
  const lng = -170 + (h2 % 340) + ((h2 % 100) / 100);
  return {
    code: hint?.code || 'UNK',
    city: hint?.city || 'Unknown',
    country: 'Global',
    state: '-',
    lat,
    lng,
  };
}

function resolveAirportPoint(refValue, airportCatalog, seed) {
  const parsed = parseAirportRef(refValue);
  const byCode = airportCatalog.get(parsed.code);
  if (byCode) return byCode;

  const cityNorm = parsed.city.toLowerCase();
  for (const candidate of airportCatalog.values()) {
    if (String(candidate.city || '').toLowerCase() === cityNorm) return candidate;
  }
  return pseudoPointFromSeed(seed, parsed);
}

function estimateProgress(fromPoint, toPoint, liveLat, liveLng, fallbackSeed) {
  if (
    Number.isFinite(fromPoint?.lat)
    && Number.isFinite(fromPoint?.lng)
    && Number.isFinite(toPoint?.lat)
    && Number.isFinite(toPoint?.lng)
    && Number.isFinite(liveLat)
    && Number.isFinite(liveLng)
  ) {
    const total = haversineKm(fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng);
    if (total > 1) {
      const done = haversineKm(fromPoint.lat, fromPoint.lng, liveLat, liveLng);
      return clamp(done / total, 0.03, 0.97);
    }
  }
  const fallback = (hashFromString(fallbackSeed) % 75) / 100;
  return clamp(0.1 + fallback, 0.08, 0.95);
}

function isLivePositionPlausible(fromPoint, toPoint, liveLat, liveLng) {
  if (!Number.isFinite(liveLat) || !Number.isFinite(liveLng)) return false;
  if (
    !Number.isFinite(fromPoint?.lat)
    || !Number.isFinite(fromPoint?.lng)
    || !Number.isFinite(toPoint?.lat)
    || !Number.isFinite(toPoint?.lng)
  ) return false;

  const routeKm = haversineKm(fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng);
  if (!Number.isFinite(routeKm) || routeKm < 60) return true;

  const fromToLiveKm = haversineKm(fromPoint.lat, fromPoint.lng, liveLat, liveLng);
  const toToLiveKm = haversineKm(toPoint.lat, toPoint.lng, liveLat, liveLng);

  // Detour factor: point should remain close to route path, not only close to endpoints.
  const detourFactor = (fromToLiveKm + toToLiveKm) / Math.max(1, routeKm);
  if (detourFactor > 1.22) return false;

  // Endpoint sanity: reject points absurdly far from both ends for medium/long routes.
  const endpointTolerance = routeKm * 0.35;
  return fromToLiveKm <= (routeKm + endpointTolerance) && toToLiveKm <= (routeKm + endpointTolerance);
}

function isNationalTemplateFlight(flight) {
  return String(flight?.regiao || '').toLowerCase().includes('nacional');
}

function pickTemplateFlightById(id, mode = 'mixed') {
  const nationalPool = MAP_FLIGHTS.filter(isNationalTemplateFlight);
  const internationalPool = MAP_FLIGHTS.filter((f) => !isNationalTemplateFlight(f));
  const nowHour = new Date().getHours();
  const seed = hashFromString(`${id}-${nowHour}`);
  const ratioNational = (nowHour >= 6 && nowHour <= 21) ? 0.65 : 0.35;

  let pool = MAP_FLIGHTS;
  if (mode === 'national' && nationalPool.length) {
    pool = nationalPool;
  } else if (mode === 'international' && internationalPool.length) {
    pool = internationalPool;
  } else if (mode === 'mixed') {
    const chooseNational = ((seed % 100) / 100) < ratioNational;
    pool = chooseNational ? (nationalPool.length ? nationalPool : MAP_FLIGHTS) : (internationalPool.length ? internationalPool : MAP_FLIGHTS);
  }

  if (!pool.length) return null;
  return pool[seed % pool.length];
}

function fallbackTimesByNow(fromPoint, toPoint, idSeed) {
  const now = new Date();
  const distanceKm = haversineKm(fromPoint?.lat || 0, fromPoint?.lng || 0, toPoint?.lat || 0, toPoint?.lng || 0);
  const cruiseKmh = 700 + (hashFromString(`${idSeed}-cruise`) % 260);
  const durationMinutes = Math.max(50, Math.round((distanceKm / Math.max(420, cruiseKmh)) * 60 + 30));
  const offsetSeed = hashFromString(`${idSeed}-offset`) % 55;
  const departedMinutesAgo = Math.max(5, offsetSeed);
  const departure = new Date(now.getTime() - departedMinutesAgo * 60_000);
  const arrival = new Date(departure.getTime() + durationMinutes * 60_000);
  return {
    departureLabel: `${pad2(departure.getHours())}:${pad2(departure.getMinutes())}`,
    arrivalLabel: `${pad2(arrival.getHours())}:${pad2(arrival.getMinutes())}`,
  };
}

function mapLiveFlightToMapFlight(flight, airportCatalog) {
  const id = String(flight?.id || flight?.callsign || '').trim();
  if (!id) return null;

  const source = String(flight?.source || 'local').toLowerCase();
  const parsedOrigin = parseAirportRef(flight?.origin);
  const parsedDestination = parseAirportRef(flight?.destination);
  const lat = Number.isFinite(Number(flight?.lat)) ? Number(flight.lat) : null;
  const lng = Number.isFinite(Number(flight?.lng)) ? Number(flight.lng) : null;
  const speedKmh = Number.isFinite(Number(flight?.speed)) ? Number(flight.speed) : null;
  const altitudeFeet = Number.isFinite(Number(flight?.altitude)) ? Number(flight.altitude) : null;

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const hasRouteFromApi = parsedOrigin.code !== 'UNK' && parsedDestination.code !== 'UNK';
  const allowSyntheticTrack = source !== 'local';
  if (!hasCoords && !allowSyntheticTrack) return null;
  const templateMode = !hasRouteFromApi ? 'mixed' : 'international';
  const template = pickTemplateFlightById(id, source === 'local' ? 'mixed' : templateMode);
  const gate = flight?.departureGate || flight?.arrivalGate || template?.portao || '-';
  const terminal = flight?.departureTerminal || flight?.arrivalTerminal || '-';

  let fromPoint = resolveAirportPoint(flight.origin, airportCatalog, `${id}-from`);
  let toPoint = resolveAirportPoint(flight.destination, airportCatalog, `${id}-to`);
  if (fromPoint.code === 'UNK' && template?.from) {
    fromPoint = resolveAirportPoint(template.from.code || template.from.city, airportCatalog, `${id}-template-from`);
  }
  if (toPoint.code === 'UNK' && template?.to) {
    toPoint = resolveAirportPoint(template.to.code || template.to.city, airportCatalog, `${id}-template-to`);
  }
  if (fromPoint.code === toPoint.code) {
    if (template?.to && template.to.code !== fromPoint.code) {
      toPoint = resolveAirportPoint(template.to.code || template.to.city, airportCatalog, `${id}-template-alt-dest`);
    } else {
      toPoint = pseudoPointFromSeed(`${id}-alt-dest`, toPoint);
    }
  }

  const heading = Number(flight?.heading);
  const liveHeading = Number.isFinite(heading) ? heading : (hashFromString(`${id}-heading`) % 360);

  // If provider has only current position, build a short synthetic route around it.
  if ((fromPoint.code === 'UNK' || toPoint.code === 'UNK') && Number.isFinite(lat) && Number.isFinite(lng)) {
    const rad = (liveHeading * Math.PI) / 180;
    fromPoint = { ...fromPoint, lat: lat - (Math.cos(rad) * 3), lng: lng - (Math.sin(rad) * 3) };
    toPoint = { ...toPoint, lat: lat + (Math.cos(rad) * 3), lng: lng + (Math.sin(rad) * 3) };
  }

  const progress = estimateProgress(fromPoint, toPoint, lat, lng, `${id}-progress`);
  let departureTimeLabel = formatTimeFromIso(flight?.departureTime);
  let arrivalTimeLabel = formatTimeFromIso(flight?.arrivalTime);
  let timeEstimated = false;
  if (departureTimeLabel === '--:--' || arrivalTimeLabel === '--:--') {
    const fallback = fallbackTimesByNow(fromPoint, toPoint, id);
    if (departureTimeLabel === '--:--') departureTimeLabel = fallback.departureLabel;
    if (arrivalTimeLabel === '--:--') arrivalTimeLabel = fallback.arrivalLabel;
    timeEstimated = true;
  }
  const routePoint = interpolatePoint(fromPoint, toPoint, progress);
  const useLivePosition = isLivePositionPlausible(fromPoint, toPoint, lat, lng);
  const finalLat = useLivePosition ? lat : routePoint.lat;
  const finalLng = useLivePosition ? lng : routePoint.lng;

  const region = fromPoint.country && toPoint.country
    ? (fromPoint.country === toPoint.country
      ? (fromPoint.country === 'Brasil' ? 'Nacional/Regional' : fromPoint.country)
      : `${fromPoint.country}/${toPoint.country}`)
    : (template?.regiao || 'Global');

  return {
    id,
    cia: String(flight?.airline || template?.cia || flight?.callsign || 'N/A'),
    from: {
      code: fromPoint.code || 'UNK',
      city: fromPoint.city || template?.from?.city || 'Unknown',
      lat: fromPoint.lat,
      lng: fromPoint.lng,
      time: departureTimeLabel,
      timeEstimated,
      x: 50,
      y: 50,
    },
    to: {
      code: toPoint.code || 'UNK',
      city: toPoint.city || template?.to?.city || 'Unknown',
      lat: toPoint.lat,
      lng: toPoint.lng,
      time: arrivalTimeLabel,
      timeEstimated,
      x: 50,
      y: 50,
    },
    lat: finalLat,
    lng: finalLng,
    altitude: altitudeFeet !== null ? `${Math.round(altitudeFeet).toLocaleString('pt-BR')} ft` : '-',
    velocidade: speedKmh !== null ? `${Math.round(speedKmh)} km/h` : '-',
    aeronave: String(flight?.aircraft || template?.aeronave || '-'),
    portao: gate,
    terminal,
    progress,
    speed: clamp(((speedKmh || 620) / 1000) * 0.016, 0.006, 0.02),
    risco: normalizeLiveRisk(flight?.status),
    regiao: region,
    atualizado: formatUtcClock(flight?.updatedAt),
    heading: liveHeading,
    statusRaw: String(flight?.status || ''),
    source,
  };
}

function normalizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(99, Math.round(n)));
}

function probabilityMeta(percent) {
  if (percent >= 70) return { tone: 'danger', label: 'high' };
  if (percent >= 40) return { tone: 'warn', label: 'medium' };
  return { tone: 'ok', label: 'low' };
}

function deriveFlightDelayChance(flight) {
  if (!flight) return null;
  const apiPercent = normalizePercent(flight?.riscoInfo?.percent);
  const basePercent = (() => {
    if (flight.risco === 'atraso') return 74;
    if (flight.risco === 'atencao') return 48;
    return 18;
  })();
  const progressAdjust = Math.round((1 - (Number(flight?.progress) || 0)) * 14);
  const percent = apiPercent ?? Math.max(5, Math.min(95, basePercent + progressAdjust));
  return { percent, ...probabilityMeta(percent) };
}

function buildFlightProbabilityForecast(flight, fallbackPercent) {
  const horaBase = new Date().getHours();
  const idSeed = hashFromString(flight?.id || flight?.callsign || 'flight');
  const progress = Number.isFinite(flight?.progress) ? flight.progress : 0.5;
  const sourceBias = String(flight?.source || '').toLowerCase() === 'local' ? 2 : -2;
  const basePercent = normalizePercent(fallbackPercent) ?? 25;
  const progressionBias = Math.round((1 - progress) * 10);
  const offsets = [0, 1, 2, 3];

  return offsets.map((offset) => {
    const hora = String((horaBase + offset) % 24).padStart(2, '0');
    const wave = ((idSeed >> (offset * 3)) % 11) - 5;
    const trend = offset * 3;
    const percent = Math.max(5, Math.min(95, basePercent + progressionBias + sourceBias + wave + trend));
    return { hora: `${hora}:00`, percent, ...probabilityMeta(percent) };
  });
}

function advanceFlightProgress(flight) {
  const baseProgress = Number.isFinite(flight?.progress) ? flight.progress : Math.random();
  const speed = Number.isFinite(flight?.speed) ? flight.speed : 0.012;
  let next = baseProgress + speed * MAP_TICK_SECONDS;
  if (!Number.isFinite(next)) next = Math.random();
  if (next >= 1) next -= 1;
  if (next < 0) next = 0;

  const from = flight?.from;
  const to = flight?.to;
  if (from && to && Number.isFinite(from.lat) && Number.isFinite(from.lng) && Number.isFinite(to.lat) && Number.isFinite(to.lng)) {
    const routePoint = interpolatePoint(from, to, next);
    return { ...flight, progress: next, lat: routePoint.lat, lng: routePoint.lng };
  }
  return { ...flight, progress: next };
}

  // Gera um conjunto de voos "ambient" para popular o mapa (mock de fundo)
  function buildAmbientFlights() {
    const ambient = [];
    for (let i = 0; i < 60; i++) {
      const src = MAP_FLIGHTS[i % MAP_FLIGHTS.length];
      ambient.push({
        id: `${src.id}-A${i}`,
        cia: src.cia,
        from: src.from,
        to: src.to,
        progress: Math.random(),
        speed: src.speed || 0.012,
        risco: src.risco || 'operando'
      });
    }
    return ambient;
  }

  function App() {
  const [token, setToken] = useState(false);
  const [me, setMe] = useState(null);
  const [erro, setErro] = useState('');
  const [email, setEmail] = useState('user1@example.com');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [companhia, setCompanhia] = useState('');
  const [perfil, setPerfil] = useState('OPERADOR');
  const [modoAuth, setModoAuth] = useState('login');
  const [cookieStatus, setCookieStatus] = useState(() => localStorage.getItem('cookie_status') || '');
  const [loginOpen, setLoginOpen] = useState(false);

  const showCookieBanner = cookieStatus !== 'aceito' && cookieStatus !== 'recusado';
  const renderCookieBanner = () => {
    if (!showCookieBanner) return null;
    return (
      <div className="cookie-banner">
        <div className="cookie-text">
          <strong>{tr('Cookies', 'Cookies')}</strong>
          <span>{tr('Usamos cookies para melhorar sua experiência e analisar o tráfego. Você pode aceitar, recusar ou ajustar preferências.', 'We use cookies to improve your experience and analyze traffic. You can accept, reject, or adjust preferences.')}</span>
        </div>
        <div className="cookie-actions">
          <button className="btn ghost" type="button">{tr('Preferências', 'Preferences')}</button>
          <button className="btn ghost" onClick={() => { setCookieStatus('recusado'); localStorage.setItem('cookie_status', 'recusado'); }}>{tr('Recusar', 'Reject')}</button>
          <button className="btn primary" onClick={() => { setCookieStatus('aceito'); localStorage.setItem('cookie_status', 'aceito'); }}>{tr('Aceitar', 'Accept')}</button>
        </div>
      </div>
    );
  };
  const renderAuthModal = () => {
    if (!loginOpen) return null;
    return (
      <div className="auth-modal">
        <div className="auth-wrap">
          <div className="company-corner">SkyTrak AirTraffic Control</div>
          <div className="auth-globe" aria-hidden="true">
            <div className="auth-globe-core" />
          </div>
          <div className="auth-card">
            <button type="button" className="auth-close" onClick={() => setLoginOpen(false)} aria-label={tr('Fechar', 'Close')}>×</button>
            <div className="login-hero">
              <span className="login-badge">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2.2 12.8 10.5 11 19 2.5c.8-.8 2-.8 2.8 0 .8.8.8 2 0 2.8L13.3 14l-1.8 8.3-2.3-2.3-3.3.7.7-3.3-2.4-2.4Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <img
                className="auth-logo"
                src="/skytrak-logo-transparent.png"
                alt="SkyTrak AirTraffic Control"
                onError={(e) => {
                  const cur = e.currentTarget;
                  if (!cur.src.includes('skytrak-logo.png')) cur.src = '/skytrak-logo.png';
                }}
              />
              <p>{tr('Sistema de Gestão Aeroportuária', 'Airport Management System')}</p>
            </div>
            {modoAuth === 'login' ? (
              <form onSubmit={handleLogin} className="auth-form">
                <label>{tr('Email', 'Email')}<input placeholder={tr('seu@email.com', 'your@email.com')} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label>{tr('Senha', 'Password')}
                  <div className="password-wrap">
                    <input type={showLoginPassword ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} />
                    <button type="button" className="toggle-pass" onClick={() => setShowLoginPassword((v) => !v)} aria-label={showLoginPassword ? tr('Ocultar senha', 'Hide password') : tr('Mostrar senha', 'Show password')}>
                      {showLoginPassword ? (
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 4.5 21 19.5M9.9 9.4A3.6 3.6 0 0 1 12 8.8a3.8 3.8 0 0 1 3.8 3.8c0 .7-.2 1.4-.6 2M6.2 7.2A16.3 16.3 0 0 1 12 6c4.8 0 8.4 2.8 9.8 6.6a12.6 12.6 0 0 1-2.4 3.7M4.2 12.6C5.6 8.8 9.2 6 14 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M2.4 12C4 8.4 7.7 6 12 6s8 2.4 9.6 6c-1.6 3.6-5.3 6-9.6 6s-8-2.4-9.6-6Z" stroke="currentColor" strokeWidth="1.6" />
                          <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                      )}
                    </button>
                  </div>
                </label>
                <div className="login-row">
                  <label className="remember-check"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> {tr('Lembrar-me', 'Remember me')}</label>
                  <button type="button" className="btn linklike" onClick={() => setErro(tr('Entre em contato com o administrador para redefinir senha.', 'Contact the administrator to reset password.'))}>{tr('Esqueci a senha', 'Forgot password')}</button>
                </div>
                {erro && <span className="error">{erro}</span>}
                <button className="btn primary" type="submit">{tr('Entrar', 'Sign In')}</button>
                <button className="btn ghost" type="button" onClick={() => setModoAuth('register')}>{tr('Criar conta', 'Create account')}</button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="auth-form">
                <label>{tr('Nome', 'Name')}<input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
                <label>{tr('Email', 'Email')}<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label>{tr('Senha', 'Password')}<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
                <label>{tr('Perfil', 'Profile')}
                  <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
                    <option value="OPERADOR">{tr('Operador', 'Operator')}</option>
                    <option value="ADMIN">{tr('Administrador', 'Administrator')}</option>
                    <option value="CIA">{tr('Companhia', 'Airline')}</option>
                    <option value="PASSAGEIRO">{tr('Passageiro', 'Passenger')}</option>
                  </select>
                </label>
                {perfil === 'CIA' && (
                  <label>{tr('Companhia', 'Airline')}
                    <input
                      value={companhia}
                      onChange={(e) => setCompanhia(e.target.value)}
                      placeholder={tr('Nome da companhia', 'Airline name')}
                    />
                  </label>
                )}
                {erro && <span className="error">{erro}</span>}
                <button className="btn primary" type="submit">{tr('Cadastrar', 'Register')}</button>
                <button className="btn ghost" type="button" onClick={() => setModoAuth('login')}>{tr('Voltar', 'Back')}</button>
              </form>
            )}
            <div className="login-foot-note">
              <span>{tr('Acesso restrito a usuários autorizados', 'Restricted access to authorized users')}</span>
            </div>
          </div>
          {renderCookieBanner()}
        </div>
      </div>
    );
  };

  const [activeSection, setActiveSection] = useState('dashboard');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [buscaGlobal, setBuscaGlobal] = useState('');
  const [mapFlights, setMapFlights] = useState(MAP_FLIGHTS);
  const [ambientFlights, setAmbientFlights] = useState([]);
  const [liveMeta, setLiveMeta] = useState({ source: 'local', fallback: 'local' });
  const [liveError, setLiveError] = useState('');
  const [selectedFlightId, setSelectedFlightId] = useState(null);
  const [selectedFlightData, setSelectedFlightData] = useState(null);
  const [flightWeather, setFlightWeather] = useState({ origin: null, dest: null });
  const [flightHistory, setFlightHistory] = useState(null);
  const weatherCacheRef = useRef(new Map());
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [mapBusca, setMapBusca] = useState('');
  const [mapStatus, setMapStatus] = useState('todos');
  const [mapEscopo, setMapEscopo] = useState('todos');
  const [liveEnabled, setLiveEnabled] = useState(() => localStorage.getItem('live_mode') !== '0');
  const [mapResetKey, setMapResetKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState(() => {
    const initialLanguage = localStorage.getItem('language_mode') || 'pt-BR';
    return [{
      role: 'assistant',
      content: initialLanguage === 'en' ? DEFAULT_ASSISTANT_EN : DEFAULT_ASSISTANT_PT,
      meta: null,
    }];
  });
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatPage, setChatPage] = useState(1);
  const [lastChatRequest, setLastChatRequest] = useState(null);
  const CHAT_MODE_DEFAULT = 'executivo';
  const CHAT_LIMIT_DEFAULT = 10;
  const CHAT_USE_LLM_DEFAULT = true;
  const [tema, setTema] = useState(() => localStorage.getItem('theme_mode') || 'escuro');
  const [idioma, setIdioma] = useState(() => localStorage.getItem('language_mode') || 'pt-BR');
  const [densidade, setDensidade] = useState(() => localStorage.getItem('density_mode') || 'confortavel');
  const [securityView, setSecurityView] = useState('senha');
  const [securityFeedback, setSecurityFeedback] = useState('');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessoes, setSessoes] = useState([]);
  const [lgpdTipo, setLgpdTipo] = useState('EXPORTACAO');
  const [lgpdDetalhes, setLgpdDetalhes] = useState('');
  const [lgpdConsents, setLgpdConsents] = useState({});
  const [lgpdConsentDates, setLgpdConsentDates] = useState({});
  const [relatorios, setRelatorios] = useState(() => buildInitialReports(new Date()));
  const [relatorioPeriodo, setRelatorioPeriodo] = useState('7');
  const [relatorioFiltrosAbertos, setRelatorioFiltrosAbertos] = useState(false);
  const [relatorioFiltroTipo, setRelatorioFiltroTipo] = useState('todos');
  const [relatorioFiltroStatus, setRelatorioFiltroStatus] = useState('todos');
  const [reportPreview, setReportPreview] = useState(null);
  const [vooSort, setVooSort] = useState({ field: 'horario', direction: 'asc' });
  const [vooPage, setVooPage] = useState(1);
  const [vooPageSize, setVooPageSize] = useState(10);
  const [delayAlertEnabled, setDelayAlertEnabled] = useState(() => localStorage.getItem('alert_delay_enabled') !== '0');
  const [delayAlertThreshold, setDelayAlertThreshold] = useState(() => Number(localStorage.getItem('alert_delay_threshold') || 60));
  const [notifCancelamentos, setNotifCancelamentos] = useState(true);
  const [notifManutencao, setNotifManutencao] = useState(false);
  const [notifSistema, setNotifSistema] = useState(true);
  const [delayAlertMessage, setDelayAlertMessage] = useState('');
  const [probHover, setProbHover] = useState(null);
  const [rememberMe, setRememberMe] = useState(() => getRememberMeDefault());
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [clockNow, setClockNow] = useState(new Date());
  const [auditTrail, setAuditTrail] = useState(() => {
    try {
      const raw = localStorage.getItem('audit_trail');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [novoVoo, setNovoVoo] = useState({
    cia: 'LATAM',
    numero: '',
    origem: 'GRU',
    destino: 'BSB',
    horarioPartida: '18:10',
    horarioChegada: '19:30',
    portao: 'A01',
    aeronave: 'Airbus A320',
    risco: 'operando',
  });
  const [vooFeedback, setVooFeedback] = useState('');
  const mapRootRef = useRef(null);
  const leafletRef = useRef({ map: null, markers: new Map(), routes: new Map(), base: null, airportsLayer: null });
  const mapFlightsRef = useRef(mapFlights);
  const lastDelayAlertKeyRef = useRef('');
  const lastReportsDayKeyRef = useRef(formatDateBr(new Date()));

  useEffect(() => {
    mapFlightsRef.current = mapFlights;
  }, [mapFlights]);

  const selectedFlight = useMemo(
    () => mapFlights.find((f) => f.id === selectedFlightId) || null,
    [mapFlights, selectedFlightId]
  );
  const displayedFlight = selectedFlightData || selectedFlight;
  const displayedDistanceKm = useMemo(() => {
    if (!displayedFlight?.from || !displayedFlight?.to) return null;
    const { from, to } = displayedFlight;
    if (!Number.isFinite(from?.lat) || !Number.isFinite(from?.lng) || !Number.isFinite(to?.lat) || !Number.isFinite(to?.lng)) return null;
    return haversineKm(from.lat, from.lng, to.lat, to.lng);
  }, [displayedFlight]);
  const mapFiltrados = useMemo(() => {
    const buscaMapa = (mapBusca || buscaGlobal).toLowerCase().trim();
    return mapFlights.filter((f) => {
      if (mapStatus !== 'todos' && f.risco !== mapStatus) return false;
      const isNacional = String(f.regiao || '').toLowerCase().includes('nacional');
      if (mapEscopo === 'nacional' && !isNacional) return false;
      if (mapEscopo === 'internacional' && isNacional) return false;
      if (!buscaMapa) return true;
      const texto = [f.id, f.cia, f.from.code, f.to.code, f.from.city, f.to.city, f.aeronave, f.portao, f.horario]
        .join(' ')
        .toLowerCase();
      return texto.includes(buscaMapa);
    });
  }, [mapFlights, mapBusca, buscaGlobal, mapStatus, mapEscopo]);

  const voosComBuscaGlobal = useMemo(() => {
    const q = buscaGlobal.toLowerCase().trim();
    if (!q) return mapFlights;
    return mapFlights.filter((f) => {
      const texto = [f.id, f.cia, f.from.code, f.to.code, f.from.city, f.to.city, f.aeronave, f.portao]
        .join(' ')
        .toLowerCase();
      return texto.includes(q);
    });
  }, [mapFlights, buscaGlobal]);

  const flightLookup = useMemo(() => new Map(mapFlights.map((flight) => [flight.id, flight])), [mapFlights]);
  const visiveis = useMemo(() => voosComBuscaGlobal.map(mapFlightToTableRow), [voosComBuscaGlobal]);
  const aeronavesVisiveis = useMemo(() => voosComBuscaGlobal.map(mapFlightToAircraftCard), [voosComBuscaGlobal]);
  const voosBase = voosComBuscaGlobal;
  const voosOrdenados = useMemo(() => {
    const base = [...visiveis];
    base.sort((a, b) => compareBySort(a, b, vooSort.field, vooSort.direction));
    return base;
  }, [visiveis, vooSort]);
  const totalVooPages = useMemo(() => Math.max(1, Math.ceil(voosOrdenados.length / vooPageSize)), [voosOrdenados.length, vooPageSize]);
  const voosPaginaAtual = useMemo(() => {
    const safePage = Math.min(vooPage, totalVooPages);
    const start = (safePage - 1) * vooPageSize;
    return voosOrdenados.slice(start, start + vooPageSize);
  }, [voosOrdenados, vooPage, vooPageSize, totalVooPages]);

  const mapResumo = useMemo(() => ({
    operando: voosBase.filter((f) => f.risco === 'operando').length,
    atencao: voosBase.filter((f) => f.risco === 'atencao').length,
    atraso: voosBase.filter((f) => f.risco === 'atraso').length,
  }), [voosBase]);
  const airportCatalog = useMemo(() => {
    const m = new Map();
    MAP_AIRPORT_POINTS.forEach((a) => m.set(String(a.code).toUpperCase(), a));
    return m;
  }, []);

  const selectedDelayChance = useMemo(() => {
    return deriveFlightDelayChance(displayedFlight);
  }, [displayedFlight]);

  const forecastProbabilidade = useMemo(() => {
    if (displayedFlight) {
      return buildFlightProbabilityForecast(displayedFlight, selectedDelayChance?.percent);
    }

    const baseAtraso = mapResumo.atraso * 85 + mapResumo.atencao * 55 + mapResumo.operando * 22;
    const total = Math.max(1, voosBase.length);
    const base = Math.round(baseAtraso / total);
    const horaBase = new Date().getHours();
    const offsets = [0, 1, 2, 3];
    return offsets.map((offset) => {
      const hora = String((horaBase + offset) % 24).padStart(2, '0');
      const percent = Math.max(8, Math.min(95, base + offset * 7));
      return { hora: `${hora}:00`, percent, ...probabilityMeta(percent) };
    });
  }, [displayedFlight, selectedDelayChance?.percent, voosBase.length, mapResumo]);

  const picoForecast = useMemo(
    () => forecastProbabilidade.reduce((max, item) => (item.percent > max.percent ? item : max), forecastProbabilidade[0]),
    [forecastProbabilidade]
  );

  const probabilityPanelCopy = useMemo(() => {
    const isEn = idioma === 'en';
    if (!displayedFlight) {
      return {
        title: isEn ? 'Operational Delay Probability' : 'Probabilidade de Atrasos Operacionais',
        subtitle: isEn ? 'Forecast for the next 4 hours' : 'Previsão para as próximas 4 horas',
        chip: `${isEn ? 'Forecast peak' : 'Pico previsto'}: ${picoForecast?.hora} (${picoForecast?.percent || 0}%)`,
      };
    }

    const routeLabel = `${displayedFlight.from?.code || '---'} → ${displayedFlight.to?.code || '---'}`;
    return {
      title: isEn ? 'Selected flight probability' : 'Probabilidade do voo selecionado',
      subtitle: isEn
        ? `Forecast for ${displayedFlight.id} (${routeLabel}) over the next 4 hours`
        : `Previsão para ${displayedFlight.id} (${routeLabel}) nas próximas 4 horas`,
      chip: `${isEn ? 'Focus' : 'Foco'}: ${displayedFlight.id} · ${picoForecast?.percent || 0}%`,
    };
  }, [displayedFlight, picoForecast, idioma]);

  function goSection(section) {
    if (DEMO_MODE && section === 'relatorios') {
      setActiveSection('dashboard');
      setMenuOpen(false);
      return;
    }
    setActiveSection(section);
    setMenuOpen(false);
  }

  useEffect(() => {
    persistSessionFlag(!!token, rememberMe);
  }, [token, rememberMe]);

  useEffect(() => {
    let cancelled = false;
    const bootstrapSession = async () => {
      try {
        const meResp = await api.get('/auth/me');
        if (!cancelled) {
          setMe(meResp.data);
          setToken(true);
        }
      } catch (_) {
        if (!cancelled) {
          setMe(null);
          clearAuthToken();
          setToken(false);
        }
      }
    };
    bootstrapSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!displayedFlight) {
      setFlightWeather({ origin: null, dest: null });
      setFlightHistory(null);
      return;
    }

    let cancelled = false;

    const fetchWeather = async (point, labelKey) => {
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
      const key = `${point.lat.toFixed(2)}:${point.lng.toFixed(2)}`;
      if (weatherCacheRef.current.has(key)) return weatherCacheRef.current.get(key);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lng}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('weather_fail');
        const data = await resp.json();
        const current = data?.current || {};
        const payload = {
          temp: Number.isFinite(current.temperature_2m) ? `${Math.round(current.temperature_2m)}°C` : '-',
          wind: Number.isFinite(current.wind_speed_10m) ? `${Math.round(current.wind_speed_10m)} km/h` : '-',
          code: Number(current.weather_code),
          label: weatherLabelFromCode(current.weather_code),
          when: data?.current?.time || null,
          name: labelKey,
        };
        weatherCacheRef.current.set(key, payload);
        return payload;
      } catch (_) {
        return null;
      }
    };

    const fetchHistory = async () => {
      try {
        const params = new URLSearchParams();
        if (displayedFlight?.cia && displayedFlight.cia !== 'N/A') params.set('companhia', displayedFlight.cia);
        if (displayedFlight?.from?.city) params.set('origem', displayedFlight.from.city);
        if (displayedFlight?.to?.city) params.set('destino', displayedFlight.to.city);
        params.set('dias', '90');
        const resp = await api.get(`/voos/historico?${params.toString()}`);
        return resp?.data || null;
      } catch (_) {
        return null;
      }
    };

    const run = async () => {
      const [originWeather, destWeather, history] = await Promise.all([
        fetchWeather(displayedFlight.from, displayedFlight.from?.code),
        fetchWeather(displayedFlight.to, displayedFlight.to?.code),
        fetchHistory(),
      ]);
      if (cancelled) return;
      setFlightWeather({ origin: originWeather, dest: destWeather });
      setFlightHistory(history);
    };

    run();
    return () => { cancelled = true; };
  }, [displayedFlight]);

  useEffect(() => {
    if (!token || me) return;
    let cancelled = false;

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const bootstrapMe = async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const meResp = await api.get('/auth/me');
          if (!cancelled) setMe(meResp.data);
          return;
        } catch (err) {
          if (cancelled) return;
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            setToken(false);
            setMe(null);
            return;
          }
          if (attempt < 3) await delay(650);
        }
      }
    };

    bootstrapMe();
    return () => { cancelled = true; };
  }, [token, me]);

  useEffect(() => {
    if (DEMO_MODE && activeSection === 'relatorios') {
      setActiveSection('dashboard');
    }
  }, [DEMO_MODE, activeSection]);

  useEffect(() => {
    if (!buscaGlobal) return;
    setVooPage(1);
  }, [buscaGlobal]);

  const tr = (pt, en) => (idioma === 'en' ? en : pt);
  const weatherInfo = useMemo(() => {
    const h = clockNow.getHours();
    if (h >= 6 && h < 12) return { label: tr('Céu limpo', 'Clear sky'), temp: 24, icon: 'sun' };
    if (h >= 12 && h < 18) return { label: tr('Parcialmente nublado', 'Partly cloudy'), temp: 28, icon: 'cloud' };
    if (h >= 18 && h < 22) return { label: tr('Vento moderado', 'Breezy'), temp: 22, icon: 'wind' };
    return { label: tr('Noite estável', 'Stable night'), temp: 19, icon: 'moon' };
  }, [clockNow, idioma]);
  const nowLabel = useMemo(
    () => clockNow.toLocaleTimeString(idioma === 'en' ? 'en-US' : 'pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [clockNow, idioma]
  );
  const currentRole = String(me?.perfil || perfil || 'OPERADOR').toUpperCase();
  const isAdmin = currentRole === 'ADMIN';
  const isPassenger = currentRole === 'PASSAGEIRO';
  const canManageFlights = isAdmin;
  const canCreateReports = isAdmin || currentRole === 'OPERADOR';
  const canManageSecurity = isAdmin || currentRole === 'OPERADOR';
  const roleLabel = idioma === 'en'
    ? (ROLE_LABELS[currentRole]?.en || currentRole)
    : (ROLE_LABELS[currentRole]?.pt || currentRole);
	  const addAudit = (actionPt, actionEn, details = '', severity = 'info') => {
	    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      role: currentRole,
      user: me?.email || email || '-',
      action: tr(actionPt, actionEn),
      details,
      severity,
	    };
	    setAuditTrail((prev) => [entry, ...prev].slice(0, 80));
	  };
	  const requireAuthenticatedAction = () => {
	    if (token) return true;
	    setSecurityFeedback(tr('Faca login para registrar consentimentos e solicitacoes LGPD.', 'Sign in to register LGPD consents and requests.'));
	    setModoAuth('login');
	    setLoginOpen(true);
	    return false;
	  };
	  const handleSecurityApiError = (err, fallbackPt, fallbackEn) => {
	    const status = err?.response?.status;
	    if (status === 401 || status === 403) {
	      setToken(false);
	      setMe(null);
	      setModoAuth('login');
	      setLoginOpen(true);
	      setSecurityFeedback(tr('Sua sessao expirou. Faca login novamente para continuar.', 'Your session expired. Sign in again to continue.'));
	      return;
	    }
	    setSecurityFeedback(err?.response?.data?.error || tr(fallbackPt, fallbackEn));
	  };
	  const trStatus = (status) => {
    const s = String(status || '').toLowerCase();
    if (s.includes('atraso')) return tr('Atraso Provável', 'Likely Delay');
    if (s.includes('confirm')) return tr('Confirmado', 'Confirmed');
    if (s.includes('voo')) return tr('Em Voo', 'In Flight');
    if (s.includes('manut')) return tr('Manutenção', 'Maintenance');
    if (s.includes('program')) return tr('Programado', 'Scheduled');
    if (s.includes('processando')) return tr('Processando', 'Processing');
    if (s.includes('agendado')) return tr('Agendado', 'Scheduled');
    if (s.includes('pronto')) return tr('Pronto', 'Ready');
    return status;
  };
  const trProbability = (label) => {
    if (label === 'high') return tr('Alta', 'High');
    if (label === 'medium') return tr('Moderada', 'Moderate');
    if (label === 'low') return tr('Baixa', 'Low');
    return label || '-';
  };
  const riskSignals = useMemo(() => {
    if (!displayedFlight || !selectedDelayChance) return [];

    const signals = [];
    const sourceLabel = liveSourceBadgeLabel(displayedFlight?.source || liveMeta?.source, tr);
    const historyRate = Number(flightHistory?.taxa_atraso || 0);
    const progressPercent = Math.round((Number(displayedFlight?.progress) || 0) * 100);
    const originWeatherLabel = String(flightWeather?.origin?.label || '').toLowerCase();
    const destWeatherLabel = String(flightWeather?.dest?.label || '').toLowerCase();
    const weatherIsUnstable = ['chuva', 'garoa', 'tempestade', 'inst', 'rain', 'storm', 'drizzle', 'wind'].some((term) =>
      originWeatherLabel.includes(term) || destWeatherLabel.includes(term)
    );

    if (displayedFlight?.statusRaw) {
      const statusTone = String(displayedFlight.statusRaw).toLowerCase().includes('atras') ? 'danger' : 'ok';
      signals.push({
        tone: statusTone,
        title: tr('Status operacional', 'Operational status'),
        value: displayedFlight.statusRaw,
        detail: statusTone === 'danger'
          ? tr('O status atual já sugere impacto operacional no voo.', 'The current status already suggests operational impact on this flight.')
          : tr('O status atual ainda indica operação estável.', 'The current status still indicates a stable operation.'),
      });
    }

    signals.push({
      tone: selectedDelayChance.percent >= 70 ? 'danger' : selectedDelayChance.percent >= 40 ? 'warn' : 'ok',
      title: tr('Leitura da previsão', 'Forecast reading'),
      value: `${selectedDelayChance.percent}%`,
      detail: tr(
        `Classificação atual: ${trProbability(selectedDelayChance.label)}.`,
        `Current classification: ${trProbability(selectedDelayChance.label)}.`
      ),
    });

    signals.push({
      tone: progressPercent >= 85 ? 'ok' : progressPercent >= 45 ? 'warn' : 'danger',
      title: tr('Fase do voo', 'Flight phase'),
      value: `${progressPercent}%`,
      detail: progressPercent >= 85
        ? tr('O voo já percorreu quase toda a rota, reduzindo incerteza.', 'The flight has already covered most of the route, reducing uncertainty.')
        : progressPercent >= 45
          ? tr('O voo está em fase intermediária, com risco moderado de ajuste.', 'The flight is mid-route, with moderate room for adjustments.')
          : tr('O voo ainda está em fase inicial, com mais margem para variações.', 'The flight is still in an early phase, with more room for variation.'),
    });

    signals.push({
      tone: weatherIsUnstable ? 'warn' : 'ok',
      title: tr('Clima da rota', 'Route weather'),
      value: weatherIsUnstable ? tr('Instável', 'Unstable') : tr('Estável', 'Stable'),
      detail: weatherIsUnstable
        ? tr('Condições na origem ou no destino podem aumentar a chance de ajuste.', 'Conditions at origin or destination can increase the chance of adjustments.')
        : tr('Origem e destino estão com leitura climática mais favorável.', 'Origin and destination currently show more favorable weather.'),
    });

    if (flightHistory) {
      signals.push({
        tone: historyRate >= 35 ? 'danger' : historyRate >= 18 ? 'warn' : 'ok',
        title: tr('Histórico da rota', 'Route history'),
        value: `${historyRate}%`,
        detail: historyRate >= 35
          ? tr('A rota tem histórico forte de atrasos nos últimos 90 dias.', 'This route has shown a strong delay history over the last 90 days.')
          : historyRate >= 18
            ? tr('Há oscilação recente nessa rota, então vale atenção.', 'There has been recent volatility on this route, so attention is warranted.')
            : tr('O histórico recente da rota é relativamente saudável.', 'The recent history of this route is relatively healthy.'),
      });
    }

    signals.push({
      tone: displayedFlight?.source === 'local' ? 'warn' : 'ok',
      title: tr('Fonte usada', 'Source used'),
      value: sourceLabel,
      detail: displayedFlight?.source === 'local'
        ? tr('Parte dos dados está vindo de fallback local.', 'Part of the data is currently coming from local fallback.')
        : tr('A leitura está sendo apoiada por fonte ao vivo.', 'The reading is currently supported by live-source data.'),
    });

    return signals.slice(0, 5);
  }, [displayedFlight, selectedDelayChance, liveMeta?.source, flightHistory, flightWeather, tr]);
  const parseBRDate = (value) => {
    const [dd, mm, yyyy] = String(value || '').split('/').map(Number);
    if (!dd || !mm || !yyyy) return null;
    return new Date(yyyy, mm - 1, dd, 23, 59, 59, 999);
  };
  const relatorioDataReferencia = useMemo(() => {
    const datas = relatorios.map((r) => parseBRDate(r.data)).filter(Boolean);
    return datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : new Date();
  }, [relatorios]);
  const relatorioTiposDisponiveis = useMemo(
    () => [...new Set(relatorios.map((r) => r.tipo).filter(Boolean))],
    [relatorios]
  );
  const relatorioStatusDisponiveis = useMemo(
    () => [...new Set(relatorios.map((r) => r.status).filter(Boolean))],
    [relatorios]
  );
  const reportsVisible = useMemo(() => {
    let base = [...relatorios];

    if (relatorioPeriodo !== 'todos') {
      const days = relatorioPeriodo === 'hoje' ? 0 : Number(relatorioPeriodo || 0);
      const limite = new Date(relatorioDataReferencia);
      limite.setDate(limite.getDate() - days);
      base = base.filter((r) => {
        const d = parseBRDate(r.data);
        return d ? d.getTime() >= limite.getTime() : true;
      });
    }

    if (relatorioFiltroTipo !== 'todos') {
      base = base.filter((r) => String(r.tipo) === relatorioFiltroTipo);
    }

    if (relatorioFiltroStatus !== 'todos') {
      base = base.filter((r) => String(r.status) === relatorioFiltroStatus);
    }

    if (idioma !== 'en') return base;
    return base.map((r) => ({
      ...r,
      nome: REPORT_NAME_EN[r.nome] || r.nome,
      tipo: REPORT_TYPE_EN[r.tipo] || r.tipo,
      lgpd: r.lgpd === 'Conforme' ? 'Compliant' : r.lgpd,
    }));
  }, [idioma, relatorios, relatorioPeriodo, relatorioFiltroTipo, relatorioFiltroStatus, relatorioDataReferencia]);
  const reportStats = useMemo(() => ({
    total: relatorios.length,
    pronto: relatorios.filter((r) => String(r.status).toLowerCase().includes('pronto')).length,
    processamento: relatorios.filter((r) => {
      const s = String(r.status).toLowerCase();
      return s.includes('processando') || s.includes('agendado');
    }).length,
  }), [relatorios]);

  useEffect(() => {
    localStorage.setItem('theme_mode', tema);
  }, [tema]);

  useEffect(() => {
    localStorage.setItem('language_mode', idioma);
  }, [idioma]);

  useEffect(() => {
    setChatMessages((prev) => {
      if (prev.length !== 1 || prev[0].role !== 'assistant') return prev;
      if (prev[0].content !== DEFAULT_ASSISTANT_PT && prev[0].content !== DEFAULT_ASSISTANT_EN) return prev;
      return [{ ...prev[0], content: idioma === 'en' ? DEFAULT_ASSISTANT_EN : DEFAULT_ASSISTANT_PT }];
    });
  }, [idioma]);

  useEffect(() => {
    localStorage.setItem('density_mode', densidade);
  }, [densidade]);

  useEffect(() => {
    localStorage.setItem('alert_delay_enabled', delayAlertEnabled ? '1' : '0');
  }, [delayAlertEnabled]);

  useEffect(() => {
    localStorage.setItem('alert_delay_threshold', String(delayAlertThreshold));
  }, [delayAlertThreshold]);

  useEffect(() => {
    localStorage.setItem('live_mode', liveEnabled ? '1' : '0');
  }, [liveEnabled]);

  useEffect(() => {
    localStorage.setItem('audit_trail', JSON.stringify(auditTrail));
  }, [auditTrail]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const dayKey = formatDateBr(now);
      if (lastReportsDayKeyRef.current === dayKey) return;
      lastReportsDayKeyRef.current = dayKey;
      setRelatorios((prev) => prev.map((r) => (
        Number.isFinite(r.dateOffsetDays)
          ? { ...r, data: formatDateBr(shiftDays(now, r.dateOffsetDays)) }
          : r
      )));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (vooPage > totalVooPages) setVooPage(totalVooPages);
  }, [vooPage, totalVooPages]);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeSection !== 'dashboard' || privacyMode) return undefined;
    const timer = setInterval(() => {
      setMapFlights((prev) => prev.map(advanceFlightProgress));
    }, MAP_TICK_MS);
    return () => clearInterval(timer);
  }, [activeSection, privacyMode]);

  useEffect(() => {
    if (!delayAlertEnabled || !picoForecast) return;
    if ((picoForecast.percent || 0) < delayAlertThreshold) return;
    const key = `${picoForecast.hora}-${picoForecast.percent}`;
    if (lastDelayAlertKeyRef.current === key) return;
    lastDelayAlertKeyRef.current = key;
    const message = tr(
      `Alerta operacional: pico de risco às ${picoForecast.hora} com ${picoForecast.percent}% de chance de atraso.`,
      `Operational alert: risk peak at ${picoForecast.hora} with ${picoForecast.percent}% delay chance.`
    );
    setDelayAlertMessage(message);
    addAudit('Alerta de risco emitido', 'Risk alert issued', message, 'warn');
    const timer = setTimeout(() => setDelayAlertMessage(''), 7000);
    return () => clearTimeout(timer);
  }, [delayAlertEnabled, delayAlertThreshold, picoForecast]);

  async function carregar2FA() {
    try {
      const resp = await api.get('/auth/2fa');
      setTwoFactorEnabled(!!resp?.data?.enabled);
    } catch (err) {
      setSecurityFeedback(err?.response?.data?.error || tr('Erro ao consultar 2FA.', 'Error loading 2FA.'));
    }
  }

  async function carregarSessoes() {
    try {
      const resp = await api.get('/auth/sessions');
      setSessoes(Array.isArray(resp?.data?.items) ? resp.data.items : []);
    } catch (err) {
      setSecurityFeedback(err?.response?.data?.error || tr('Erro ao carregar sessões.', 'Error loading sessions.'));
    }
  }

  async function alterarSenhaConta() {
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setSecurityFeedback(tr('Preencha todos os campos de senha.', 'Fill in all password fields.'));
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setSecurityFeedback(tr('A nova senha e a confirmação não coincidem.', 'New password and confirmation do not match.'));
      return;
    }
    setSecurityBusy(true);
    try {
      const resp = await api.post('/auth/change-password', {
        currentPassword: senhaAtual,
        newPassword: novaSenha,
      });
      setSecurityFeedback(resp?.data?.message || tr('Senha alterada com sucesso.', 'Password changed successfully.'));
      addAudit('Senha alterada', 'Password changed', me?.email || '-', 'ok');
      setSenha(novaSenha);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
    } catch (err) {
      setSecurityFeedback(err?.response?.data?.error || tr('Erro ao alterar senha.', 'Error changing password.'));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function alternar2FA() {
    setSecurityBusy(true);
    try {
      const next = !twoFactorEnabled;
      const resp = await api.post('/auth/2fa', { enabled: next });
      setTwoFactorEnabled(next);
      setSecurityFeedback(resp?.data?.message || (next ? tr('2FA ativado.', '2FA enabled.') : tr('2FA desativado.', '2FA disabled.')));
      addAudit(next ? '2FA ativado' : '2FA desativado', next ? '2FA enabled' : '2FA disabled', me?.email || '-', next ? 'ok' : 'warn');
    } catch (err) {
      setSecurityFeedback(err?.response?.data?.error || tr('Erro ao atualizar 2FA.', 'Error updating 2FA.'));
    } finally {
      setSecurityBusy(false);
    }
  }

	  async function encerrarSessao(id) {
    setSecurityBusy(true);
    try {
      const resp = await api.post(`/auth/sessions/${id}/revoke`);
      setSecurityFeedback(resp?.data?.message || tr('Sessão encerrada.', 'Session closed.'));
      addAudit('Sessão encerrada', 'Session revoked', `ID ${id}`, 'warn');
      await carregarSessoes();
    } catch (err) {
      setSecurityFeedback(err?.response?.data?.error || tr('Erro ao encerrar sessão.', 'Error closing session.'));
    } finally {
      setSecurityBusy(false);
    }
	  }
	
	  async function carregarConsentimentosLGPD() {
	    if (!token) return;
	    try {
	      const resp = await api.get('/auth/lgpd/consents');
	      const items = Array.isArray(resp?.data?.items) ? resp.data.items : [];
	      const next = {};
	      const dates = {};
	      items.forEach((item) => {
	        const key = String(item?.tipo || '').toUpperCase();
	        if (!key) return;
	        next[key] = Boolean(item.concedido);
	        dates[key] = item.data_hora || null;
	      });
	      setLgpdConsents(next);
	      setLgpdConsentDates(dates);
	    } catch (err) {
	      handleSecurityApiError(err, 'Erro ao carregar consentimentos LGPD.', 'Error loading LGPD consents.');
	    }
	  }

	  async function atualizarConsentimentoLGPD(tipo, concedido) {
	    if (!requireAuthenticatedAction()) return;
	    setSecurityBusy(true);
	    try {
	      const resp = await api.post('/auth/lgpd/consents', { tipo, concedido });
	      setLgpdConsents((prev) => ({ ...prev, [tipo]: concedido }));
	      setLgpdConsentDates((prev) => ({ ...prev, [tipo]: new Date().toISOString() }));
	      setSecurityFeedback(resp?.data?.message || tr('Consentimento LGPD atualizado.', 'LGPD consent updated.'));
	      addAudit(
	        concedido ? 'Consentimento LGPD concedido' : 'Consentimento LGPD revogado',
	        concedido ? 'LGPD consent granted' : 'LGPD consent revoked',
	        tipo,
	        concedido ? 'ok' : 'warn'
	      );
	    } catch (err) {
	      handleSecurityApiError(err, 'Erro ao atualizar consentimento LGPD.', 'Error updating LGPD consent.');
	    } finally {
	      setSecurityBusy(false);
	    }
	  }

	  async function solicitarLGPD() {
	    if (!requireAuthenticatedAction()) return;
	    setSecurityBusy(true);
	    try {
      const resp = await api.post('/auth/lgpd/request', {
        tipo: lgpdTipo,
        detalhes: lgpdDetalhes,
      });
      setSecurityFeedback(resp?.data?.message || tr('Solicitação LGPD registrada.', 'LGPD request submitted.'));
      addAudit('Solicitação LGPD', 'LGPD request', `${lgpdTipo}`, 'info');
      setLgpdDetalhes('');
	    } catch (err) {
	      handleSecurityApiError(err, 'Erro ao registrar solicitação LGPD.', 'Error submitting LGPD request.');
	    } finally {
	      setSecurityBusy(false);
	    }
  }

	  useEffect(() => {
	    if (activeSection !== 'configuracoes' || !token) return;
	    carregar2FA();
	    carregarSessoes();
	    carregarConsentimentosLGPD();
	  }, [activeSection, token]);

  useEffect(() => {
    if (!token) {
      setLiveMeta({ source: 'local', fallback: 'local' });
      setLiveError('');
    }

    let cancelled = false;
    let timer = null;

    const carregarVoosAoVivo = async () => {
      if (!liveEnabled) {
        setLiveMeta({ source: 'local', fallback: 'local' });
        setLiveError('');
        setMapFlights(MAP_FLIGHTS);
        return;
      }
      try {
        const resp = await api.get(`/voos/live?source=opensky&limit=${LIVE_FLIGHTS_LIMIT}`);
        const items = Array.isArray(resp?.data?.items) ? resp.data.items : [];
        const mapped = items
          .map((item) => mapLiveFlightToMapFlight(item, airportCatalog))
          .filter(Boolean);
        const nextMeta = resp?.data?.meta || { source: 'local', fallback: 'local' };
        const mappedHasLiveSource = mapped.some((item) => item?.source && item.source !== 'local');
        const currentHasLiveSource = mapFlightsRef.current.some((item) => item?.source && item.source !== 'local');

        if (cancelled) return;
        if (mapped.length) {
          setMapFlights(mapped);
          setSelectedFlightData(null);
        }
        if (mappedHasLiveSource || !currentHasLiveSource) {
          setLiveMeta(nextMeta);
          setLiveError('');
          return;
        }

        setLiveMeta((prev) => ({
          ...prev,
          cached: nextMeta.cached,
          updatedAt: nextMeta.updatedAt,
          errors: nextMeta.errors,
          fallback: nextMeta.fallback || prev?.fallback || 'local',
        }));
        setLiveError('Dados ao vivo indisponiveis agora; mantendo a ultima atualizacao ao vivo.');
      } catch (err) {
        if (cancelled) return;
        const message = err?.response?.data?.error || err?.message || 'Erro ao carregar voos ao vivo';
        setLiveError(message);
        console.warn('[liveFlights] frontend fallback para dados atuais:', message);
      }
    };

    carregarVoosAoVivo();
    timer = setInterval(carregarVoosAoVivo, LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [token, airportCatalog, liveEnabled]);

  useEffect(() => {
    if (!token) return;
    if (!loginOpen) return;
    setLoginOpen(false);
    setActiveSection('dashboard');
  }, [token, loginOpen]);
  useEffect(() => {
    if (activeSection !== 'dashboard' || privacyMode) return;

    let retryTimer = null;
    let cancelled = false;

      const tryInit = () => {
        if (cancelled) return;
        const container = mapRootRef.current;
      if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
        retryTimer = setTimeout(tryInit, 150);
        return;
      }

      const ctx = leafletRef.current;
      if (ctx.map) {
        requestAnimationFrame(() => ctx.map.invalidateSize());
        return;
      }

      const map = L.map(container, {
        center: [12, -20],
        zoom: 2,
        minZoom: 2,
        maxZoom: 6,
        zoomControl: true,
        worldCopyJump: true,
        attributionControl: true,
        preferCanvas: true,
      });

      const tile = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      }).addTo(map);
      let fallbackApplied = false;
      tile.on('tileerror', () => {
        if (fallbackApplied) return;
        fallbackApplied = true;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
      });
      const forceResize = () => {
        requestAnimationFrame(() => map.invalidateSize(true));
        setTimeout(() => map.invalidateSize(true), 120);
      };
      tile.on('load', forceResize);
      map.whenReady(forceResize);

      ctx.map = map;
      ctx.base = L.circleMarker([-23.4356, -46.4731], {
        radius: 6,
        color: '#0f7b47',
        fillColor: '#22c55e',
        fillOpacity: 0.9,
        weight: 1,
      }).addTo(map);
      ctx.base.bindTooltip('GRU - Aeroporto Base', { direction: 'top', offset: [0, -6] });

      const airportsLayer = L.layerGroup();
      MAP_AIRPORT_POINTS.forEach((airport) => {
        const mk = L.circleMarker([airport.lat, airport.lng], {
          radius: 4,
          color: '#0f7b47',
          fillColor: '#22c55e',
          fillOpacity: 0.9,
          weight: 1,
        });
        const region = airport.state && airport.state !== '-' ? `${airport.state}, ${airport.country}` : airport.country;
        mk.bindTooltip(`${airport.code} - ${airport.city} (${region})`, { direction: 'top', offset: [0, -6] });
        mk.addTo(airportsLayer);
      });
      airportsLayer.addTo(map);
      ctx.airportsLayer = airportsLayer;

      // ensure the map resizes once container is rendered
      forceResize();
    };

    tryInit();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [activeSection, privacyMode, mapResetKey]);

  useEffect(() => {
    const ctx = leafletRef.current;
    if (!ctx?.map) return;
    ctx.markers?.forEach((m) => m.remove());
    ctx.routes?.forEach((r) => r.remove());
    ctx.markers?.clear?.();
    ctx.routes?.clear?.();
    ctx.map.remove();
    ctx.map = null;
    ctx.base = null;
    ctx.airportsLayer = null;
    setMapResetKey((v) => v + 1);
  }, [liveEnabled]);

  useEffect(() => {
    if (activeSection === 'dashboard' && !privacyMode) return;
    const ctx = leafletRef.current;
    if (ctx.map) {
      ctx.map.remove();
      ctx.map = null;
      ctx.markers.clear();
      ctx.routes.clear();
      ctx.base = null;
      ctx.airportsLayer = null;
    }
  }, [activeSection, privacyMode]);

  useEffect(() => {
    if (!mapFullscreen) return;
    const map = leafletRef.current.map;
    if (map) requestAnimationFrame(() => map.invalidateSize());
  }, [mapFullscreen]);

  useEffect(() => {
    const ctx = leafletRef.current;
    const map = ctx.map;
    if (!map || activeSection !== 'dashboard' || privacyMode) return;
    if (ctx.lastIdioma !== idioma) {
      ctx.markers.forEach((m) => m.remove());
      ctx.routes.forEach((r) => r.remove());
      ctx.markers.clear();
      ctx.routes.clear();
      ctx.lastIdioma = idioma;
    }

    const visible = new Set(mapFiltrados.map((f) => f.id));
    mapFiltrados.forEach((f) => {
      const [start, end] = routeLatLngs(f.from, f.to);
      const current = (Number.isFinite(f.lat) && Number.isFinite(f.lng))
        ? [f.lat, f.lng]
        : pointToLatLng(interpolatePoint(f.from, f.to, f.progress));
      const selected = selectedFlightId === f.id;
      const angle = headingDegrees(f.from, f.to);
      const color = f.risco === 'atraso' ? '#ff8f8f' : f.risco === 'atencao' ? '#ffd45f' : '#7bb9ff';

      if (!ctx.routes.has(f.id)) {
        ctx.routes.set(
          f.id,
          L.polyline([start, end], {
            color: '#87b6e8',
            weight: 1.2,
            opacity: 0.65,
            dashArray: '6 8',
          }).addTo(map)
        );
      } else {
        ctx.routes.get(f.id).setLatLngs([start, end]);
      }

      const route = ctx.routes.get(f.id);
      route.setStyle({
        color: selected ? '#d7ebff' : '#87b6e8',
        weight: selected ? 2.2 : 1.2,
        opacity: selected ? 0.95 : 0.65,
      });

      if (!ctx.markers.has(f.id)) {
        const mk = L.marker(current, {
          icon: planeIcon(f.risco, selected, angle),
          keyboard: false,
        });
        mk.addTo(map);
        mk.__iconSig = `${f.risco}|${selected ? '1' : '0'}|${Math.round(angle)}`;
        const el = mk.getElement();
        if (el) {
          el.style.transition = `transform ${MAP_TICK_MS + 40}ms linear`;
        }
        mk.on('click', async () => {
          const gateLabel = tr('Portão', 'Gate');
          const speedLabel = tr('Velocidade', 'Speed');
          const progressLabel = tr('Progresso', 'Progress');
          const loadingRiskLabel = tr('Carregando risco...', 'Loading risk...');
          const delayProbabilityLabel = tr('Probabilidade de atraso', 'Delay probability');
          const sourceLabel = tr('Fonte', 'Source');
          const sourceValue = liveSourceBadgeLabel(f.source || liveMeta?.source, tr);
          const initialHtml = `
            <div style="min-width:200px">
              <strong>${f.id}</strong><br/>
              ${f.cia} · ${f.from.code} → ${f.to.code}<br/>
              <small>${f.aeronave || ''}</small><br/>
              <div>${gateLabel}: ${f.portao || '-'} · ${speedLabel}: ${f.velocidade || '-'}</div>
              <div>${sourceLabel}: ${sourceValue}</div>
              <div style="margin-top:6px">${progressLabel}: ${Math.round(f.progress * 100)}%</div>
              <div class="popup-risco">${loadingRiskLabel}</div>
            </div>`;
          mk.bindPopup(initialHtml).openPopup();
          const focusResult = await focusFlight(f);
          // update popup content with risco when available
          try {
            const popup = mk.getPopup && mk.getPopup();
            const risco = focusResult?.riscoInfo;
            if (popup && risco) {
              const newHtml = `
                <div style="min-width:200px">
                  <strong>${f.id}</strong><br/>
                  ${f.cia} · ${f.from.code} → ${f.to.code}<br/>
                  <small>${f.aeronave || ''}</small><br/>
                  <div>${gateLabel}: ${f.portao || '-'} · ${speedLabel}: ${f.velocidade || '-'}</div>
                  <div>${sourceLabel}: ${sourceValue}</div>
                  <div style="margin-top:6px">${delayProbabilityLabel}: <strong>${risco.percent ?? '-'}%</strong>
                    ${risco.label ? `<span> — ${risco.label}</span>` : ''}
                  </div>
                </div>`;
              popup.setContent(newHtml);
            }
          } catch (e) {
            // ignore popup update errors
          }
        });
        mk.bindTooltip('', { direction: 'top', offset: [0, -12], opacity: 0.92 });
        ctx.markers.set(f.id, mk);
      }

      const marker = ctx.markers.get(f.id);
      marker.setLatLng(current);
      const nextIconSig = `${f.risco}|${selected ? '1' : '0'}|${Math.round(angle)}`;
      if (marker.__iconSig !== nextIconSig) {
        marker.setIcon(planeIcon(f.risco, selected, angle));
        marker.__iconSig = nextIconSig;
      }
      marker.setTooltipContent(`${f.id} (${f.cia}) | ${f.from.code} -> ${f.to.code} | ${Math.round(f.progress * 100)}%`);
      const mel = marker.getElement();
      if (mel) {
        // keep smooth movement via transform transition
        mel.style.transition = `transform ${MAP_TICK_MS + 40}ms linear`;
        mel.style.willChange = 'transform';
        mel.style.color = color;
      }
    });

    [...ctx.markers.keys()].forEach((id) => {
      if (!visible.has(id)) {
        ctx.markers.get(id).remove();
        ctx.markers.delete(id);
      }
    });

    [...ctx.routes.keys()].forEach((id) => {
      if (!visible.has(id)) {
        ctx.routes.get(id).remove();
        ctx.routes.delete(id);
      }
    });
  }, [mapFiltrados, selectedFlightId, activeSection, privacyMode, idioma, liveMeta?.source]);

  

  useEffect(() => () => {
    const ctx = leafletRef.current;
    if (ctx.map) {
      ctx.map.remove();
      ctx.map = null;
      ctx.markers.clear();
      ctx.routes.clear();
      ctx.base = null;
      ctx.airportsLayer = null;
    }
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setErro('');
    try {
      let resp = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          resp = await api.post('/auth/login', { email, senha, rememberMe: !!rememberMe });
          break;
        } catch (loginErr) {
          if (loginErr?.response) throw loginErr;
          if (attempt === 3) throw loginErr;
          await new Promise((resolve) => setTimeout(resolve, 550));
        }
      }
      if (!resp) throw new Error('login_failed');
      if (!resp?.data?.token) throw new Error('missing_token');
      setAuthToken(resp.data.token, !!rememberMe);
      setToken(true);
      const meResp = await api.get('/auth/me');
      setMe(meResp.data);
      addAudit('Login realizado', 'User login', meResp?.data?.email || email, 'ok');
    } catch (err) {
      if (!err?.response) {
        setErro(tr('API offline. Inicie o backend na porta 3000.', 'API offline. Start backend on port 3000.'));
      } else {
        setErro(err?.response?.data?.error || tr('Falha no login', 'Login failed'));
      }
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setErro('');
    try {
      await api.post('/auth/register', { nome, email, senha, perfil, companhia });
      setModoAuth('login');
      setErro(tr('Cadastro realizado. Faça login.', 'Registration completed. Please sign in.'));
      addAudit('Cadastro de usuário', 'User registration', `${email} (${perfil})`, 'info');
    } catch (err) {
      setErro(err?.response?.data?.error || tr('Erro ao registrar usuário', 'Error registering user'));
    }
  }

  async function sair() {
    addAudit('Logout realizado', 'User logout', me?.email || '-', 'info');
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // ignore
    }
    clearAuthToken();
    setToken(false);
    setMe(null);
    setSenha('');
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
  }

  function closeModal() {
    const ctx = leafletRef.current;
    if (selectedFlightId && ctx?.markers?.has && ctx.markers.has(selectedFlightId)) {
      try { ctx.markers.get(selectedFlightId).closePopup(); } catch (e) {}
    }
    setSelectedFlightId(null);
    setSelectedFlightData(null);
  }

  async function fetchFlightDetails(flightId) {
    try {
      const resp = await api.get(`/voos/live/detalhe/${encodeURIComponent(flightId)}`);
      return resp?.data?.item || null;
    } catch (_) {
      return null;
    }
  }

  async function focusFlight(flight) {
    if (!flight) return;
    setSelectedFlightId(flight.id);
    setSelectedFlightData({ ...flight, riscoInfo: null, riscoLoading: true });

    const [risco, detailItem] = await Promise.all([
      fetchRisco(flight.id, 'tradicional'),
      fetchFlightDetails(flight.id),
    ]);

    const mappedDetail = detailItem ? mapLiveFlightToMapFlight(detailItem, airportCatalog) : null;
    let nextData = null;
    setSelectedFlightData((prev) => {
      if (!prev || prev.id !== flight.id) return prev;
      nextData = {
        ...(mappedDetail || flight),
        riscoInfo: risco,
        riscoLoading: false,
      };
      return nextData;
    });
    return nextData || {
      ...(mappedDetail || flight),
      riscoInfo: risco,
      riscoLoading: false,
    };
  }

  async function focusFlightFromList(flightId) {
    const flight = flightLookup.get(flightId);
    if (!flight) return;
    await focusFlight(flight);
  }

  async function fetchRisco(numero_voo, modelo = 'tradicional') {
    try {
      const resp = await api.get(`/ia/risco-atraso/${numero_voo}?modelo=${modelo}`);
	      const data = resp.data || {};
	      // normalize several possible response shapes to { percent, label }
	      if (data.risco && typeof data.risco === 'object' && (data.risco.percent || data.risco.label)) {
	        return {
	          percent: data.risco.percent ?? data.risco.percentual ?? null,
	          label: data.risco.label ?? null,
	          explicacao: data.risco.explicacao ?? null,
	          fatores: Array.isArray(data.risco.fatores) ? data.risco.fatores : [],
	          confianca: data.risco.confianca ?? null,
	          modelo: data.risco.modelo ?? modelo,
	        };
	      }
      if (typeof data.percent === 'number' || typeof data.percentual === 'number') {
        return { percent: data.percent ?? data.percentual, label: data.label ?? null };
      }
      if (typeof data.probability === 'number') {
        // probability as 0..1
        return { percent: Math.round((data.probability || 0) * 100), label: data.label ?? null };
      }
      return null;
    } catch (err) {
      console.error('Error fetching risk:', err);
      return null;
    }
  }

  async function enviarPerguntaIA(e, opts = {}) {
    if (e?.preventDefault) e.preventDefault();
    const pergunta = (opts.pergunta ?? chatInput).trim();
    const page = Number(opts.page ?? 1);
    if (!pergunta || chatSending) return;

    if (!token && !getAuthToken()) {
      setModoAuth('login');
      setLoginOpen(true);
      setChatMessages((prev) => [...prev, {
        role: 'assistant',
        content: tr('Faça login para usar o chat IA.', 'Sign in to use the AI chat.'),
        meta: null,
      }]);
      return;
    }

    if (!opts.keepInput) setChatInput('');
    setChatSending(true);
    if (!opts.silentUserEcho) {
      setChatMessages((prev) => [...prev, { role: 'user', content: pergunta, meta: null }]);
    }

    try {
      const historico = chatMessages.slice(-8);
      const voosContexto = mapFlights.map((v) => ({
        numero_voo: v.id,
        companhia: v.cia,
        horario_previsto: v.atualizado || null,
        status: v.risco === 'atraso' ? 'ATRASADO' : v.risco === 'atencao' ? 'EM_VOO' : 'PREVISTO',
        preco_medio: 0,
        origem_cidade: v.from?.city || '',
        origem_estado: '',
        destino_cidade: v.to?.city || '',
        destino_estado: '',
      }));
      const resp = await api.post('/ia/chat', {
        pergunta,
        historico,
        voosContexto,
        modo: CHAT_MODE_DEFAULT,
        page,
        limit: CHAT_LIMIT_DEFAULT,
        usarLLM: CHAT_USE_LLM_DEFAULT,
      });
      const texto = resp?.data?.resposta || tr('Não consegui responder no momento.', 'I could not answer right now.');
      const meta = {
        topico: resp?.data?.topico || null,
        confianca: resp?.data?.confianca || null,
        sugestoes: Array.isArray(resp?.data?.sugestoes) ? resp.data.sugestoes : [],
        paginacao: resp?.data?.paginacao || null,
        source: resp?.data?.source || null,
        provider: resp?.data?.provider || null,
        model: resp?.data?.model || null,
      };
      setLastChatRequest({ pergunta, page, limit: CHAT_LIMIT_DEFAULT, modo: CHAT_MODE_DEFAULT, meta });
      setChatPage(page);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: texto, meta }]);
    } catch (err) {
      const msg = err?.response?.data?.error || tr('Falha ao consultar a IA.', 'Failed to query AI.');
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `${tr('Erro', 'Error')}: ${msg}`, meta: null }]);
    } finally {
      setChatSending(false);
    }
  }

  function handleSortVoo(field) {
    setVooSort((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field, direction: 'asc' };
    });
    setVooPage(1);
  }

  function exportarVoosCsv() {
    const rows = [
      [tr('Companhia', 'Airline'), tr('Voo', 'Flight'), tr('Destino', 'Destination'), tr('Horário', 'Time'), tr('Portão', 'Gate'), tr('Status', 'Status')],
      ...voosOrdenados.map((v) => [v.cia, v.numero, v.destino, v.horario, v.portao, trStatus(v.status)]),
    ];
    const content = rows.map((r) => r.map((item) => `"${String(item || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${sanitizeFileName(tr('voos_operacao', 'flights_operation'))}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    addAudit('Exportação CSV de voos', 'Flight CSV exported', `${voosOrdenados.length} ${tr('registros', 'records')}`);
  }

  function montarConteudoRelatorio(relatorio) {
    const nomeBase = String(relatorio.nome || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const voosAtraso = mapFlights.filter((f) => f.risco === 'atraso');
    const voosAtencao = mapFlights.filter((f) => f.risco === 'atencao');
    const voosOperando = mapFlights.filter((f) => f.risco === 'operando');
    const topAtrasados = voosAtraso.slice(0, 6);
    const topRecentes = mapFlights.slice(0, 8);
    const totalPortoes = new Set(mapFlights.map((f) => f.portao).filter(Boolean)).size;
    const statusAeronaves = aeronavesVisiveis.map((a) => String(a.status || '').toLowerCase());
    const aeronavesManut = statusAeronaves.filter((s) => s.includes('manut')).length;
    const aeronavesProgramadas = statusAeronaves.filter((s) => s.includes('program')).length;
    const aeronavesAtivas = statusAeronaves.length - aeronavesManut;
    const detalhes = [];
    const pushSection = (title, rows) => {
      detalhes.push({ title, rows });
    };
    const sumarioExecutivo = [
      `${tr('Voos monitorados', 'Monitored flights')}: ${mapFlights.length}`,
      `${tr('Em operação', 'Operating')}: ${voosOperando.length}`,
      `${tr('Em atenção', 'In attention')}: ${voosAtencao.length}`,
      `${tr('Em atraso', 'Delayed')}: ${voosAtraso.length}`,
      `${tr('Pico de risco', 'Risk peak')}: ${picoForecast?.hora || '--:--'} (${picoForecast?.percent || 0}%)`,
    ];

    if (nomeBase.includes('voos') || nomeBase.includes('flight report')) {
      pushSection(
        idioma === 'en' ? 'Report focus: Daily flight movement' : 'Foco do relatório: Movimentação diária de voos',
        [
          `${tr('Total de voos monitorados', 'Total monitored flights')}: ${mapFlights.length}`,
          `${tr('Em operação', 'Operating')}: ${voosOperando.length} | ${tr('Atenção', 'Attention')}: ${voosAtencao.length} | ${tr('Atraso', 'Delay')}: ${voosAtraso.length}`,
          ...topRecentes.slice(0, 5).map((f) => `${f.id} (${f.cia}) ${f.from.code}->${f.to.code} [${trStatus(mapFlightStatus(f.risco))}]`),
        ]
      );
    } else if (nomeBase.includes('atras') || nomeBase.includes('delay analysis')) {
      pushSection(
        idioma === 'en' ? 'Report focus: Delay pattern analysis' : 'Foco do relatório: Análise de padrão de atrasos',
        [
          `${tr('Voos em atraso', 'Flights delayed')}: ${voosAtraso.length}`,
          `${tr('Voos em atenção', 'Flights in attention')}: ${voosAtencao.length}`,
          ...(topAtrasados.length
            ? topAtrasados.map((f) => `${f.id} (${f.cia}) ${f.from.code}->${f.to.code} | ${f.atualizado}`)
            : [tr('Nenhum voo em atraso no momento', 'No delayed flights at the moment')]),
        ]
      );
    } else if (nomeBase.includes('manutencao') || nomeBase.includes('maintenance')) {
      pushSection(
        idioma === 'en' ? 'Report focus: Aircraft maintenance status' : 'Foco do relatório: Situação de manutenção de aeronaves',
        [
          `${tr('Total de aeronaves monitoradas', 'Total monitored aircraft')}: ${aeronavesVisiveis.length}`,
          `${tr('Em manutenção', 'In maintenance')}: ${aeronavesManut}`,
          `${tr('Programadas', 'Scheduled')}: ${aeronavesProgramadas}`,
          `${tr('Ativas', 'Active')}: ${Math.max(0, aeronavesAtivas)}`,
        ]
      );
    } else if (nomeBase.includes('portoes') || nomeBase.includes('gate occupancy')) {
      const topPortoes = [...new Set(mapFlights.map((f) => f.portao).filter(Boolean))].slice(0, 8);
      pushSection(
        idioma === 'en' ? 'Report focus: Gate occupancy and rotation' : 'Foco do relatório: Ocupação e rotação de portões',
        [
          `${tr('Total de portões em uso', 'Total gates in use')}: ${totalPortoes}`,
          ...topPortoes.map((p) => `${tr('Portão', 'Gate')} ${p}`),
        ]
      );
    } else if (nomeBase.includes('performance')) {
      pushSection(
        idioma === 'en' ? 'Report focus: Monthly operational performance' : 'Foco do relatório: Performance operacional mensal',
        [
          `${tr('Voos ativos', 'Active flights')}: ${mapFlights.length}`,
          `${tr('Taxa de atraso estimada', 'Estimated delay rate')}: ${Math.round((voosAtraso.length / Math.max(1, mapFlights.length)) * 100)}%`,
          `${tr('Taxa de atenção estimada', 'Estimated attention rate')}: ${Math.round((voosAtencao.length / Math.max(1, mapFlights.length)) * 100)}%`,
        ]
      );
    } else if (nomeBase.includes('previsao') || nomeBase.includes('forecast')) {
      pushSection(
        idioma === 'en' ? 'Report focus: Delay forecast for next week' : 'Foco do relatório: Previsão de atrasos para a próxima semana',
        forecastProbabilidade.map((p) => `${p.hora} -> ${p.percent}% (${trProbability(p.label)})`)
      );
    }

    return { sumarioExecutivo, detalhes };
  }

  function abrirPreviewRelatorio(relatorio) {
    const conteudo = montarConteudoRelatorio(relatorio);
    setReportPreview({ relatorio, ...conteudo });
    addAudit('Pré-visualização de relatório', 'Report preview opened', relatorio.nome, 'info');
  }

  function baixarRelatorioPdf(relatorio) {
    const agora = new Date().toLocaleString(idioma === 'en' ? 'en-US' : 'pt-BR');
    const { sumarioExecutivo, detalhes } = montarConteudoRelatorio(relatorio);

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 34;
    let y = margin + 20;

    const ensureSpace = (h = 40) => {
      if (y + h < pageH - margin) return;
      doc.addPage();
      doc.setFillColor(6, 18, 45);
      doc.rect(0, 0, pageW, pageH, 'F');
      y = margin;
    };

    const drawSectionTitle = (title) => {
      ensureSpace(36);
      doc.setDrawColor(47, 128, 237);
      doc.setLineWidth(1.1);
      doc.line(margin, y, pageW - margin, y);
      y += 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(145, 190, 255);
      doc.text(title, margin, y);
      y += 12;
    };

    const drawBullet = (text) => {
      ensureSpace(26);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.6);
      doc.setTextColor(224, 236, 255);
      const wrapped = doc.splitTextToSize(String(text), pageW - (margin * 2) - 18);
      doc.circle(margin + 4, y - 3, 1.6, 'F');
      doc.text(wrapped, margin + 12, y);
      y += (wrapped.length * 14) + 2;
    };

    doc.setFillColor(6, 18, 45);
    doc.rect(0, 0, pageW, pageH, 'F');
    doc.setFillColor(10, 31, 72);
    doc.roundedRect(margin, margin, pageW - (margin * 2), 74, 12, 12, 'F');
    doc.setDrawColor(57, 154, 255);
    doc.setLineWidth(1);
    doc.roundedRect(margin, margin, pageW - (margin * 2), 74, 12, 12, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(230, 241, 255);
    doc.text(idioma === 'en' ? 'SkyTrak AirTraffic Control - Operational Report' : 'SkyTrak AirTraffic Control - Relatório Operacional', margin + 16, margin + 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(153, 198, 255);
    doc.text(idioma === 'en' ? 'Airport operations, delays and compliance intelligence' : 'Inteligência de operação aeroportuária, atrasos e conformidade', margin + 16, margin + 48);
    doc.text(`${tr('Gerado em', 'Generated at')}: ${agora}`, margin + 16, margin + 64);

    const cards = [
      { label: tr('Voos monitorados', 'Monitored flights'), value: String(mapFlights.length) },
      { label: tr('Em operação', 'Operating'), value: String(voosOperando.length) },
      { label: tr('Em atenção', 'In attention'), value: String(voosAtencao.length) },
      { label: tr('Em atraso', 'Delayed'), value: String(voosAtraso.length) },
      { label: tr('Pico de risco', 'Risk peak'), value: `${picoForecast?.hora || '--:--'} (${picoForecast?.percent || 0}%)` },
    ];
    const cardGap = 10;
    const cardW = ((pageW - (margin * 2)) - (cardGap * 2)) / 3;
    let cardY = margin + 88;
    cards.forEach((card, idx) => {
      const row = Math.floor(idx / 3);
      const col = idx % 3;
      const x = margin + (col * (cardW + cardGap));
      const yCard = cardY + (row * 56);
      doc.setFillColor(13, 36, 84);
      doc.roundedRect(x, yCard, cardW, 46, 8, 8, 'F');
      doc.setDrawColor(36, 109, 214);
      doc.roundedRect(x, yCard, cardW, 46, 8, 8, 'S');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(129, 176, 240);
      doc.text(card.label, x + 9, yCard + 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(234, 243, 255);
      doc.text(card.value, x + 9, yCard + 34);
    });

    y = cardY + 124;
    drawSectionTitle(tr('Metadados do relatório', 'Report metadata'));
    drawBullet(`${tr('Nome', 'Name')}: ${relatorio.nome}`);
    drawBullet(`${tr('Tipo', 'Type')}: ${idioma === 'en' ? (REPORT_TYPE_EN[relatorio.tipo] || relatorio.tipo) : relatorio.tipo}`);
    drawBullet(`${tr('Data', 'Date')}: ${relatorio.data}`);
    drawBullet(`${tr('Tamanho', 'Size')}: ${relatorio.tamanho}`);
    drawBullet(`${tr('Status', 'Status')}: ${trStatus(relatorio.status)}`);
    drawBullet(`LGPD: ${relatorio.lgpd}`);

    drawSectionTitle(idioma === 'en' ? 'Executive summary' : 'Resumo executivo');
    sumarioExecutivo.forEach((linha) => drawBullet(linha));

    detalhes.forEach((secao) => {
      drawSectionTitle(secao.title);
      secao.rows.forEach((linha) => drawBullet(linha));
    });

    const base = sanitizeFileName(relatorio.nome || (idioma === 'en' ? 'report' : 'relatorio'));
    doc.save(`${base || 'report'}.pdf`);
    addAudit('Relatório baixado em PDF', 'Report downloaded as PDF', relatorio.nome, 'info');
  }

  function criarNovoRelatorio() {
    if (!canCreateReports) {
      setSecurityFeedback(tr('Seu perfil não tem permissão para criar relatórios.', 'Your profile is not allowed to create reports.'));
      return;
    }
    const now = new Date();
    const dataBr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const hhmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const atrasoPct = Math.round((mapResumo.atraso / Math.max(1, voosBase.length)) * 100);
    const nome = `${tr('Relatório Operacional', 'Operational Report')} ${dataBr} ${hhmm}`;
    const novo = {
      nome,
      tipo: 'Operacional',
      data: dataBr,
      tamanho: '-',
      status: 'Processando',
      lgpd: 'Conforme',
    };
    setRelatorios((prev) => [novo, ...prev]);
    addAudit('Relatório criado', 'Report created', nome, 'info');
    setTimeout(() => {
      setRelatorios((prev) => prev.map((r, idx) => (
        idx === 0 && r.nome === nome
          ? { ...r, status: 'Pronto', tamanho: `${(1 + (atrasoPct % 20) / 10).toFixed(1)} MB` }
          : r
      )));
    }, 1300);
  }

  function criarPontoAeroporto(code, horario) {
    const c = String(code || '').toUpperCase().trim();
    const info = airportCatalog.get(c);
    if (info) {
      return {
        code: c,
        city: info.city,
        time: horario,
        x: 50,
        y: 50,
        lat: info.lat,
        lng: info.lng,
      };
    }
    const coord = AIRPORT_COORDS[c];
    if (coord) {
      return {
        code: c,
        city: c,
        time: horario,
        x: 50,
        y: 50,
        lat: coord.lat,
        lng: coord.lng,
      };
    }
    return null;
  }

  function adicionarVoo(e) {
    e.preventDefault();
    if (!canManageFlights) {
      setVooFeedback(tr('Apenas ADMIN pode adicionar voos.', 'Only ADMIN can add flights.'));
      return;
    }

    const numero = String(novoVoo.numero || '').toUpperCase().trim();
    if (!numero) {
      setVooFeedback(tr('Informe o número do voo.', 'Provide the flight number.'));
      return;
    }
    if (mapFlights.some((f) => String(f.id).toUpperCase() === numero)) {
      setVooFeedback(tr('Já existe um voo com este número.', 'A flight with this number already exists.'));
      return;
    }

    const portaoNovo = String(novoVoo.portao || '').toUpperCase().trim();
    const horarioNovo = String(novoVoo.horarioPartida || '').trim();
    if (portaoNovo && horarioNovo) {
      const conflito = mapFlights.some((f) => {
        const portaoAtual = String(f.portao || '').toUpperCase().trim();
        const horarioAtual = String(f.from?.time || f.horario || '').trim();
        return portaoAtual && horarioAtual && portaoAtual === portaoNovo && horarioAtual === horarioNovo;
      });
      if (conflito) {
        setVooFeedback(tr('Já existe um voo no mesmo horário e portão.', 'There is already a flight at the same time and gate.'));
        return;
      }
    }

    const from = criarPontoAeroporto(novoVoo.origem, novoVoo.horarioPartida);
    const to = criarPontoAeroporto(novoVoo.destino, novoVoo.horarioChegada);
    if (!from || !to) {
      setVooFeedback(tr('Origem ou destino inválido. Use código IATA válido.', 'Invalid origin or destination. Use a valid IATA code.'));
      return;
    }

    const fromInfo = airportCatalog.get(from.code);
    const toInfo = airportCatalog.get(to.code);
    const fromCountry = fromInfo?.country || '-';
    const toCountry = toInfo?.country || '-';
    const regiao = fromCountry === 'Brasil' && toCountry === 'Brasil' ? 'Nacional' : `${fromCountry}/${toCountry}`;
    const nowUtc = `${String(new Date().getUTCHours()).padStart(2, '0')}:${String(new Date().getUTCMinutes()).padStart(2, '0')} UTC`;

    const novo = {
      id: numero,
      cia: String(novoVoo.cia || '').trim() || 'Airline',
      from,
      to,
      altitude: '34.000 ft',
      velocidade: '780 km/h',
      aeronave: String(novoVoo.aeronave || '').trim() || 'Airbus A320',
      portao: String(novoVoo.portao || '').toUpperCase().trim() || '-',
      progress: 0.03,
      speed: 0.012,
      risco: novoVoo.risco || 'operando',
      regiao,
      atualizado: nowUtc,
    };

    setMapFlights((prev) => [novo, ...prev]);
    setVooFeedback(tr('Voo adicionado com sucesso.', 'Flight added successfully.'));
    addAudit('Voo adicionado', 'Flight added', `${novo.id} ${novo.from.code}->${novo.to.code}`, 'ok');
    setNovoVoo({
      cia: novoVoo.cia || 'LATAM',
      numero: '',
      origem: 'GRU',
      destino: 'BSB',
      horarioPartida: '18:10',
      horarioChegada: '19:30',
      portao: 'A01',
      aeronave: novoVoo.aeronave || 'Airbus A320',
      risco: 'operando',
    });
  }

  return (
    <div className={`layout ${tema === 'claro' ? 'theme-light' : ''} ${densidade === 'compacta' ? 'density-compact' : ''}`}>
      {renderCookieBanner()}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <button className={`nav-btn ${activeSection === 'dashboard' ? 'active' : ''}`} onClick={() => goSection('dashboard')}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 10h18v6H3z" stroke="#9fbef8" strokeWidth="1.2" fill="#0d2a4a"/></svg>{tr('Dashboard', 'Dashboard')}
        </button>
        <button className={`nav-btn ${activeSection === 'voos' ? 'active' : ''}`} onClick={() => goSection('voos')}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3 7h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" stroke="#9fbef8" strokeWidth="0.8"/></svg>{tr('Voos', 'Flights')}
        </button>
        <button className={`nav-btn ${activeSection === 'aeronaves' ? 'active' : ''}`} onClick={() => goSection('aeronaves')}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3" stroke="#9fbef8" strokeWidth="0.9"/><path d="M4 20c4-4 8-4 16 0" stroke="#9fbef8" strokeWidth="0.9"/></svg>{tr('Aeronaves', 'Aircraft')}
        </button>
        {!DEMO_MODE && (
          <button className={`nav-btn ${activeSection === 'relatorios' ? 'active' : ''}`} onClick={() => goSection('relatorios')}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="2" stroke="#9fbef8" strokeWidth="0.9"/></svg>{tr('Relatórios', 'Reports')}
          </button>
        )}
        <button className={`nav-btn ${activeSection === 'configuracoes' ? 'active' : ''}`} onClick={() => goSection('configuracoes')}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" stroke="#9fbef8" strokeWidth="0.9"/><path d="M19.4 15a1.5 1.5 0 0 0 0-1.8l1.3-1a.6.6 0 0 0 0-1l-1.3-1a1.5 1.5 0 0 0-1.8 0l-1-.6a.6.6 0 0 0-.6 0l-1 .6a1.5 1.5 0 0 0-1.8 0l-1.3-1a.6.6 0 0 0-1 0l-1.3 1a1.5 1.5 0 0 0 0 1.8l-1 .6a.6.6 0 0 0 0 .6l1 .6a1.5 1.5 0 0 0 0 1.8l-1.3 1a.6.6 0 0 0 0 1l1.3 1a1.5 1.5 0 0 0 1.8 0l1 .6a.6.6 0 0 0 .6 0l1-.6a1.5 1.5 0 0 0 1.8 0l1.3 1a.6.6 0 0 0 1 0l1.3-1a1.5 1.5 0 0 0 0-1.8l1-.6a.6.6 0 0 0 0-.6z" stroke="#9fbef8" strokeWidth="0.6"/></svg>{tr('Configurações', 'Settings')}
        </button>
      </aside>
      {menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label={tr('Fechar menu', 'Close menu')} />}

      <div className="main">
        <header className="header">
          <div className="header-left">
            <button className={`menu-toggle ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen((v) => !v)} aria-label={tr('Abrir menu', 'Open menu')}>
              <span />
              <span />
              <span />
            </button>
            <img
              className="app-logo"
              src="/skytrak-logo-transparent.png"
              alt="SkyTrak AirTraffic Control"
              onError={(e) => {
                const cur = e.currentTarget;
                if (!cur.src.includes('skytrak-logo.png')) cur.src = '/skytrak-logo.png';
              }}
            />
          </div>
          <label className="global-search-wrap" aria-label="Busca global">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
              <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              className="global-search"
              placeholder={tr('Buscar voos, aeronaves, portões...', 'Search flights, aircraft, gates...')}
              value={buscaGlobal}
              onChange={(e) => setBuscaGlobal(e.target.value)}
            />
          </label>
          <div className="header-actions">
            <div className="meta-pill weather-pill" title={weatherInfo.label}>
              {weatherInfo.icon === 'sun' && <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              {weatherInfo.icon === 'cloud' && <svg viewBox="0 0 24 24" fill="none"><path d="M7 18h10a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.7 1A3.5 3.5 0 0 0 7 18Z" stroke="currentColor" strokeWidth="1.6" /></svg>}
              {weatherInfo.icon === 'wind' && <svg viewBox="0 0 24 24" fill="none"><path d="M3 9h10a2.5 2.5 0 1 0-2.5-2.5M3 14h14a2.5 2.5 0 1 1-2.5 2.5M3 19h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
              {weatherInfo.icon === 'moon' && <svg viewBox="0 0 24 24" fill="none"><path d="M15 3a8 8 0 1 0 6 12.5A7 7 0 1 1 15 3Z" stroke="currentColor" strokeWidth="1.6" /></svg>}
              <span>{weatherInfo.temp}°C · {weatherInfo.label}</span>
            </div>
            <div className="meta-pill time-pill">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <span>{nowLabel}</span>
            </div>
            <>
              <button className={`ai-toggle ${aiOpen ? 'on' : ''}`} onClick={() => setAiOpen((v) => !v)} aria-label="Abrir IA">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="6" y="5" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M9 10h.01M15 10h.01M8.5 18h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M12 5V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              <span className="who">{me?.nome || 'Operador'} ({roleLabel})</span>
              <button className={`privacy-toggle ${privacyMode ? 'on' : ''}`} onClick={() => setPrivacyMode((v) => !v)}>
                {tr('Modo Privacidade', 'Privacy Mode')} {privacyMode ? 'ON' : 'OFF'}
              </button>
              {token ? (
                <button className="btn ghost" onClick={sair}>{tr('Sair', 'Logout')}</button>
              ) : (
                <button className="btn ghost icon-btn" onClick={() => setLoginOpen(true)} aria-label={tr('Entrar', 'Sign In')} title={tr('Entrar', 'Sign In')}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 12h9M10 7l5 5-5 5M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </>
          </div>
        </header>
        <div className="sr-only" aria-live="polite">
          {delayAlertMessage || vooFeedback || securityFeedback}
        </div>
        {delayAlertMessage ? (
          <div className="risk-alert-banner" role="status" aria-live="assertive">
            <strong>{tr('Alerta', 'Alert')}:</strong> {delayAlertMessage}
          </div>
        ) : null}
        {aiOpen && (
          <aside className="ai-drawer">
            <div className="ai-drawer-head">
              <h3>{tr('Assistente IA', 'AI Assistant')}</h3>
              <button className="btn ghost small" onClick={() => setAiOpen(false)}>{tr('Fechar', 'Close')}</button>
            </div>
            <div className="chat-body">
              {chatMessages.map((m, idx) => (
                <p key={`drawer-${idx}`}>
                  <strong>{m.role === 'assistant' ? 'IA' : tr('Você', 'You')}:</strong> {m.content}
                  {m.role === 'assistant' && m.meta?.confianca ? <span className="chat-meta"> · {tr('Confiança', 'Confidence')}: {m.meta.confianca}</span> : null}
                  {m.role === 'assistant' && m.meta?.source ? <span className="chat-meta"> · {tr('Fonte', 'Source')}: {m.meta.source === 'llm' ? `${m.meta.provider || 'LLM'}${m.meta.model ? ` (${m.meta.model})` : ''}` : tr('fallback local', 'local fallback')}</span> : null}
                </p>
              ))}
            </div>
            <form className="chat-form" onSubmit={enviarPerguntaIA}>
              <input
                placeholder={tr('Pergunte sobre o site ou voos...', 'Ask about the website or flights...')}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatSending}
              />
              <button className="btn primary small" type="submit" disabled={chatSending || !chatInput.trim()}>
                {chatSending ? tr('Enviando...', 'Sending...') : tr('Enviar', 'Send')}
              </button>
            </form>
          </aside>
        )}
        {renderAuthModal()}

        {activeSection === 'dashboard' && (
          <section className={`section ${displayedFlight ? 'section-with-flight-panel' : ''}`}>
            <h2>{tr('Dashboard Operacional', 'Operational Dashboard')}</h2>
            <p className="section-sub">{tr('Visão em tempo real da operação aeroportuária', 'Real-time view of airport operations')}</p>
            <div className="kpi-row">
              <div className="kpi"><span className="kpi-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M2.2 12.8 10.5 11 19 2.5c.8-.8 2-.8 2.8 0 .8.8.8 2 0 2.8L13.3 14l-1.8 8.3-2.3-2.3-3.3.7.7-3.3-2.4-2.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>{tr('Voos Ativos', 'Active Flights')}</span><strong>{mask(String(mapFlights.length), privacyMode)}</strong></div>
              <div className="kpi"><span className="kpi-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M3 15h18M6 11l3 4M18 11l-3 4M12 4v11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>{tr('Pousos Hoje', 'Landings Today')}</span><strong>{mask(String(mapFlights.filter(f => ['GRU','CGH','SDU'].includes(f.to.code)).length), privacyMode)}</strong></div>
              <div className="kpi warn"><span className="kpi-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3 2.5 20h19L12 3Z" stroke="currentColor" strokeWidth="1.6" /><path d="M12 9v4M12 16h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span><span>{tr('Atrasos', 'Delays')}</span><strong>{mask(String(mapResumo.atraso), privacyMode)}</strong></div>
              <div className="kpi"><span className="kpi-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3 5 6v5c0 5 3.5 8 7 10 3.5-2 7-5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.6" /><path d="M9.5 12.2 11.2 14l3.3-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>{tr('Incidentes', 'Incidents')}</span><strong>{mask('0', privacyMode)}</strong></div>
            </div>

            <div className={`panel map-world ${mapFullscreen ? 'fullscreen' : ''}`}>
              <div className="map-head">
                <div>
                  <h3>{tr('Mapa de rotas ao vivo', 'Live route map')}</h3>
                  <span>{mapFiltrados.length} {tr('voos visíveis', 'visible flights')}</span>
                  {liveError ? <small className="live-error">{liveError}</small> : null}
                </div>
                <button className="btn ghost small" onClick={() => setMapFullscreen((v) => !v)}>
                  {mapFullscreen ? tr('Minimizar', 'Minimize') : tr('Maximizar', 'Maximize')}
                </button>
              </div>

              {privacyMode ? (
                <div className="map-privacy-lock">{tr('Modo privacidade ativo: mapa ocultado por segurança.', 'Privacy mode active: map hidden for security.')}</div>
              ) : (
                <div className="map-stage">
                  <div className="map-toolbar">
                    <div className="map-toolbar-left">
                      <span className="map-badge">Air Traffic Control</span>
                      <button
                        type="button"
                        className={`live-toggle ${liveEnabled ? 'on' : 'off'}`}
                        onClick={() => setLiveEnabled((v) => !v)}
                        title={liveEnabled ? tr('Dados ao vivo: ligados', 'Live data: on') : tr('Dados ao vivo: desligados', 'Live data: off')}
                      >
                        {liveEnabled ? tr('Ao vivo', 'Live') : tr('Local', 'Local')}
                      </button>
                      <span className={`map-source-badge ${String(liveMeta?.source || 'local')}`}>
                        {liveSourceBadgeLabel(liveMeta?.source, tr)}
                      </span>
                      <div className="zoom-controls">
                        <button type="button" className="zoom-btn" onClick={() => leafletRef.current.map?.zoomIn()}>+</button>
                        <button type="button" className="zoom-btn" onClick={() => leafletRef.current.map?.zoomOut()}>−</button>
                      </div>
                    </div>
                    <div className="map-search-wrap">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                      <input
                        value={mapBusca}
                        onChange={(e) => setMapBusca(e.target.value)}
                        placeholder={tr('Pesquisar voo, companhia ou aeroporto', 'Search flight, airline or airport')}
                      />
                    </div>
                    <div className="map-count-card">
                      <strong>{mapFiltrados.length}</strong>
                      <span>{tr('voos ativos', 'active flights')}</span>
                    </div>
                  </div>

                  <div className="status-filters">
                    <button className={`status-chip ${mapStatus === 'todos' ? 'active' : ''}`} onClick={() => setMapStatus('todos')}>{tr('Todos', 'All')}</button>
                    <button className={`status-chip operando ${mapStatus === 'operando' ? 'active' : ''}`} onClick={() => setMapStatus('operando')}>{tr('Operando', 'Operating')} {mapResumo.operando}</button>
                    <button className={`status-chip atencao ${mapStatus === 'atencao' ? 'active' : ''}`} onClick={() => setMapStatus('atencao')}>{tr('Atenção', 'Attention')} {mapResumo.atencao}</button>
                    <button className={`status-chip atraso ${mapStatus === 'atraso' ? 'active' : ''}`} onClick={() => setMapStatus('atraso')}>{tr('Atraso', 'Delay')} {mapResumo.atraso}</button>
                  </div>
                  <div className="scope-filters">
                    <button className={`scope-chip ${mapEscopo === 'todos' ? 'active' : ''}`} onClick={() => setMapEscopo('todos')}>{tr('Todos os voos', 'All flights')}</button>
                    <button className={`scope-chip ${mapEscopo === 'nacional' ? 'active' : ''}`} onClick={() => setMapEscopo('nacional')}>{tr('Nacionais', 'Domestic')}</button>
                    <button className={`scope-chip ${mapEscopo === 'internacional' ? 'active' : ''}`} onClick={() => setMapEscopo('internacional')}>{tr('Internacionais', 'International')}</button>
                  </div>

                  <div ref={mapRootRef} className="leaflet-map" />

                  <div className="map-legend-row">
                    <span><i className="legend-dot active" /> {tr('Operando', 'Operating')}</span>
                    <span><i className="legend-dot attention" /> {tr('Atenção', 'Attention')}</span>
                    <span><i className="legend-dot danger" /> {tr('Atraso', 'Delay')}</span>
                    <span><i className="legend-dot base" /> {tr('Aeroporto Base', 'Base Airport')}</span>
                  </div>
                </div>
              )}
            </div>

	              <div className={`panel ${displayedFlight ? 'panel-focus-flight' : ''}`}>
	                <div className="panel-head">
	                <h3>{probabilityPanelCopy.title}</h3>
	                <span className={`chip ${picoForecast?.tone || 'warn'}`}>{probabilityPanelCopy.chip}</span>
	                </div>
	              <p className="chart-subtitle">{probabilityPanelCopy.subtitle}</p>
                {!displayedFlight ? (
                  <p className="chart-helper">{tr('Selecione um voo no mapa ou na tabela para ver a probabilidade individual.', 'Select a flight on the map or in the table to see its individual probability.')}</p>
                ) : null}
	              <div className="prob-chart">
                <div className="prob-axis">
                  <span>80</span>
                  <span>60</span>
                  <span>40</span>
                  <span>20</span>
                  <span>0</span>
                </div>
                <div className="prob-plot">
                  <div className="grid-lines" />
                  {forecastProbabilidade.map((item) => (
                    <div
                      className="prob-col"
                      key={item.hora}
                      onMouseEnter={() => setProbHover(item)}
                      onMouseLeave={() => setProbHover(null)}
                    >
                      <i className={`bar ${item.tone}`} style={{ height: `${item.percent}%` }} />
                      <label>{item.hora}</label>
                    </div>
                  ))}
                  {probHover ? (
                    <div className="prob-tooltip">
                      <strong>{probHover.hora}</strong>
                      <span>{tr('Probabilidade', 'Probability')}: {probHover.percent}%</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid-dashboard">
              <div className="panel">
                <h3>{tr('Voos em Operação', 'Flights in Operation')}</h3>
                <div className="table-tools">
                  <label>
                    {tr('Itens por página', 'Items per page')}
                    <select value={vooPageSize} onChange={(e) => { setVooPageSize(Number(e.target.value)); setVooPage(1); }}>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={30}>30</option>
                    </select>
                  </label>
                  <button className="btn ghost small" onClick={exportarVoosCsv}>{tr('Exportar CSV', 'Export CSV')}</button>
                </div>
                <table className="table">
                  <caption className="sr-only">{tr('Tabela operacional de voos', 'Operational flights table')}</caption>
                  <thead><tr>
                    <th aria-label={tr('Ícone', 'Icon')}></th>
                    <th scope="col" aria-sort={vooSort.field === 'cia' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('cia')}>{tr('Companhia', 'Airline')}</button></th>
                    <th scope="col" aria-sort={vooSort.field === 'numero' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('numero')}>{tr('Voo', 'Flight')}</button></th>
                    <th scope="col" aria-sort={vooSort.field === 'destino' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('destino')}>{tr('Destino', 'Destination')}</button></th>
                    <th scope="col" aria-sort={vooSort.field === 'horario' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('horario')}>{tr('Horário', 'Time')}</button></th>
                    <th scope="col" aria-sort={vooSort.field === 'portao' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('portao')}>{tr('Portão', 'Gate')}</button></th>
                    <th scope="col" aria-sort={vooSort.field === 'status' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('status')}>{tr('Status', 'Status')}</button></th>
	                  </tr></thead>
	                  <tbody>
	                    {voosPaginaAtual.map((v) => (
	                      <tr
                          key={v.numero}
                          className={`table-flight-row ${selectedFlightId === v.numero ? 'selected' : ''}`}
                          onClick={() => focusFlightFromList(v.numero)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              focusFlightFromList(v.numero);
                            }
                          }}
                        >
	                        <td>
	                          <span className="row-icon-badge flight">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M2.2 12.8 10.5 11 19 2.5c.8-.8 2-.8 2.8 0 .8.8.8 2 0 2.8L13.3 14l-1.8 8.3-2.3-2.3-3.3.7.7-3.3-2.4-2.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </td>
                        <td>{mask(v.cia, privacyMode)}</td>
                        <td>{mask(v.numero, privacyMode)}</td>
                        <td>{mask(v.destino, privacyMode)}</td>
                        <td>{v.horario}</td>
                        <td>{mask(v.portao, privacyMode)}</td>
                        <td><span className={`chip ${statusClass(v.status)}`}>{trStatus(v.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
              </table>
              <div className="table-pagination">
                <button className="btn ghost small" onClick={() => setVooPage((p) => Math.max(1, p - 1))} disabled={vooPage <= 1}>{tr('Anterior', 'Previous')}</button>
                <span>{tr('Página', 'Page')} {Math.min(vooPage, totalVooPages)} / {totalVooPages}</span>
                <button className="btn ghost small" onClick={() => setVooPage((p) => Math.min(totalVooPages, p + 1))} disabled={vooPage >= totalVooPages}>{tr('Próxima', 'Next')}</button>
              </div>
            </div>
            <aside className="panel chat">
                <h3>{tr('Chat IA Generativa', 'Generative AI Chat')}</h3>
            <div className="chat-body">
              {chatMessages.map((m, idx) => (
                <p key={`panel-${idx}`}>
                  <strong>{m.role === 'assistant' ? 'IA' : tr('Você', 'You')}:</strong> {m.content}
                  {m.role === 'assistant' && m.meta?.confianca ? <span className="chat-meta"> · {tr('Confiança', 'Confidence')}: {m.meta.confianca}</span> : null}
                  {m.role === 'assistant' && m.meta?.source ? <span className="chat-meta"> · {tr('Fonte', 'Source')}: {m.meta.source === 'llm' ? `${m.meta.provider || 'LLM'}${m.meta.model ? ` (${m.meta.model})` : ''}` : tr('fallback local', 'local fallback')}</span> : null}
                </p>
              ))}
            </div>
            <form className="chat-form" onSubmit={enviarPerguntaIA}>
              <input
                placeholder={tr('Pergunte sobre o site ou voos...', 'Ask about the website or flights...')}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatSending}
                  />
                  <button className="btn primary small" type="submit" disabled={chatSending || !chatInput.trim()}>
                    {chatSending ? tr('Enviando...', 'Sending...') : tr('Enviar', 'Send')}
                  </button>
                </form>
              </aside>
            </div>
          </section>
        )}

        {activeSection === 'voos' && (
          <section className="section">
            <div className="voos-header">
              <div>
                <h2>{tr('Gestão de Voos', 'Flight Management')}</h2>
                <p>{tr('Visualização completa de todos os voos', 'Complete view of all flights')}</p>
              </div>
              <span className={`chip ${isAdmin ? 'ok' : 'info'}`}>
                {canManageFlights ? tr('Perfil ADMIN: edição liberada', 'ADMIN profile: edit enabled') : tr('Modo observação', 'Observation mode')}
              </span>
            </div>
            {canManageFlights ? (
              <div className="panel admin-flight-card">
                <h3>{tr('Adicionar Novo Voo', 'Add New Flight')}</h3>
                <form className="flight-form-grid" onSubmit={adicionarVoo}>
                  <input value={novoVoo.cia} onChange={(e) => setNovoVoo((v) => ({ ...v, cia: e.target.value }))} placeholder={tr('Companhia', 'Airline')} />
                  <input value={novoVoo.numero} onChange={(e) => setNovoVoo((v) => ({ ...v, numero: e.target.value.toUpperCase() }))} placeholder={tr('Voo (ex: LA1234)', 'Flight (ex: LA1234)')} />
                  <input value={novoVoo.origem} onChange={(e) => setNovoVoo((v) => ({ ...v, origem: e.target.value.toUpperCase() }))} placeholder={tr('Origem IATA (ex: GRU)', 'Origin IATA (ex: GRU)')} />
                  <input value={novoVoo.destino} onChange={(e) => setNovoVoo((v) => ({ ...v, destino: e.target.value.toUpperCase() }))} placeholder={tr('Destino IATA (ex: BSB)', 'Destination IATA (ex: BSB)')} />
                  <input value={novoVoo.horarioPartida} onChange={(e) => setNovoVoo((v) => ({ ...v, horarioPartida: e.target.value }))} placeholder={tr('Partida (HH:mm)', 'Departure (HH:mm)')} />
                  <input value={novoVoo.horarioChegada} onChange={(e) => setNovoVoo((v) => ({ ...v, horarioChegada: e.target.value }))} placeholder={tr('Chegada (HH:mm)', 'Arrival (HH:mm)')} />
                  <input value={novoVoo.portao} onChange={(e) => setNovoVoo((v) => ({ ...v, portao: e.target.value.toUpperCase() }))} placeholder={tr('Portão', 'Gate')} />
                  <input value={novoVoo.aeronave} onChange={(e) => setNovoVoo((v) => ({ ...v, aeronave: e.target.value }))} placeholder={tr('Aeronave', 'Aircraft')} />
                  <select value={novoVoo.risco} onChange={(e) => setNovoVoo((v) => ({ ...v, risco: e.target.value }))}>
                    <option value="operando">{tr('Operando', 'Operating')}</option>
                    <option value="atencao">{tr('Atenção', 'Attention')}</option>
                    <option value="atraso">{tr('Atraso', 'Delay')}</option>
                  </select>
                  <button className="btn primary" type="submit">{tr('Adicionar voo', 'Add flight')}</button>
                </form>
                {vooFeedback ? <p className="role-note">{vooFeedback}</p> : null}
              </div>
            ) : (
              <div className="panel readonly-note">
                <p>{isPassenger ? tr('Perfil passageiro: visualização liberada, sem permissão de cadastro.', 'Passenger profile: view-only access, no create permission.') : tr('Somente administradores podem cadastrar novos voos.', 'Only administrators can create new flights.')}</p>
              </div>
            )}
            <div className="panel">
              <div className="table-tools">
                <label>
                  {tr('Itens por página', 'Items per page')}
                  <select value={vooPageSize} onChange={(e) => { setVooPageSize(Number(e.target.value)); setVooPage(1); }}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                  </select>
                </label>
                <button className="btn ghost small" onClick={exportarVoosCsv}>{tr('Exportar CSV', 'Export CSV')}</button>
              </div>
              <table className="table">
                <caption className="sr-only">{tr('Tabela de gestão de voos', 'Flight management table')}</caption>
                <thead><tr>
                  <th aria-label={tr('Ícone', 'Icon')}></th>
                  <th scope="col" aria-sort={vooSort.field === 'cia' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('cia')}>{tr('Companhia', 'Airline')}</button></th>
                  <th scope="col" aria-sort={vooSort.field === 'numero' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('numero')}>{tr('Voo', 'Flight')}</button></th>
                  <th scope="col" aria-sort={vooSort.field === 'destino' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('destino')}>{tr('Destino', 'Destination')}</button></th>
                  <th scope="col" aria-sort={vooSort.field === 'horario' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('horario')}>{tr('Horário', 'Time')}</button></th>
                  <th scope="col" aria-sort={vooSort.field === 'portao' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('portao')}>{tr('Portão', 'Gate')}</button></th>
                  <th scope="col" aria-sort={vooSort.field === 'status' ? (vooSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="th-btn" onClick={() => handleSortVoo('status')}>{tr('Status', 'Status')}</button></th>
                </tr></thead>
                <tbody>
                  {voosPaginaAtual.map((v) => (
                    <tr key={v.numero}>
                      <td>
                        <span className="row-icon-badge flight">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M2.2 12.8 10.5 11 19 2.5c.8-.8 2-.8 2.8 0 .8.8.8 2 0 2.8L13.3 14l-1.8 8.3-2.3-2.3-3.3.7.7-3.3-2.4-2.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </td>
                      <td>{mask(v.cia, privacyMode)}</td>
                      <td>{mask(v.numero, privacyMode)}</td>
                      <td>{mask(v.destino, privacyMode)}</td>
                      <td>{v.horario}</td>
                      <td>{mask(v.portao, privacyMode)}</td>
                      <td><span className={`chip ${statusClass(v.status)}`}>{trStatus(v.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-pagination">
                <button className="btn ghost small" onClick={() => setVooPage((p) => Math.max(1, p - 1))} disabled={vooPage <= 1}>{tr('Anterior', 'Previous')}</button>
                <span>{tr('Página', 'Page')} {Math.min(vooPage, totalVooPages)} / {totalVooPages}</span>
                <button className="btn ghost small" onClick={() => setVooPage((p) => Math.min(totalVooPages, p + 1))} disabled={vooPage >= totalVooPages}>{tr('Próxima', 'Next')}</button>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'aeronaves' && (
          <section className="section">
            <div className="aeronaves-header">
              <div>
                <h2>{tr('Gestão de Aeronaves', 'Aircraft Management')}</h2>
                <p>{tr('Monitoramento de frota em tempo real', 'Real-time fleet monitoring')}</p>
              </div>
              <div className="aeronaves-total">
                <span>{tr('Total de Aeronaves', 'Total Aircraft')}</span>
                <strong>{aeronavesVisiveis.length}</strong>
              </div>
            </div>
            <div className="cards-grid aeronaves-grid">
              {aeronavesVisiveis.map((a) => {
                const statusMeta = aircraftStatusMeta(a.status);
                return (
                  <article className="aircraft-card aeronave-card" key={a.id}>
                    <div className="aeronave-top">
                      <div className="aeronave-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2.2 12.8 10.5 11 19 2.5c.8-.8 2-.8 2.8 0 .8.8.8 2 0 2.8L13.3 14l-1.8 8.3-2.3-2.3-3.3.7.7-3.3-2.4-2.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div>
                        <h3>{mask(a.id, privacyMode)}</h3>
                        <p className="aeronave-modelo">{a.modelo}</p>
                      </div>
                    </div>
                    <div className="aeronave-body">
                      <span className="aeronave-label">{tr('COMPANHIA', 'AIRLINE')}</span>
                      <p className="aeronave-value">{mask(a.cia, privacyMode)}</p>
                      <span className="aeronave-label">{tr('STATUS', 'STATUS')}</span>
                      <span className={`aeronave-status ${statusMeta.tone}`}>{trStatus(statusMeta.label)}</span>
                      <span className="aeronave-label">{tr('LOCALIZAÇÃO', 'LOCATION')}</span>
                      <p className="aeronave-value">{mask(a.localizacao, privacyMode)}</p>
                      {a.proximo && a.proximo !== '-' && (
                        <>
                          <span className="aeronave-label">{tr('PRÓXIMO VOO', 'NEXT FLIGHT')}</span>
                          <p className="aeronave-value codigo">{mask(a.proximo, privacyMode)}</p>
                        </>
                      )}
                      <span className="aeronave-label">{tr('ÚLTIMA MANUTENÇÃO', 'LAST MAINTENANCE')}</span>
                      <p className="aeronave-value">{a.manutencao}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!DEMO_MODE && activeSection === 'relatorios' && (
          <section className="section">
            <h2>{tr('Relatórios', 'Reports')}</h2>
            <div className="panel lgpd-banner">
              <strong>{tr('Conformidade LGPD Ativa', 'Active LGPD Compliance')}</strong>
              <p>{tr('Todos os relatórios seguem anonimização de dados pessoais, trilha de auditoria e retenção controlada.', 'All reports follow personal data anonymization, audit trail and controlled retention.')}</p>
            </div>
            <div className="panel">
              <div className="report-summary-strip">
                <div className="report-kpi"><span>{tr('Total', 'Total')}</span><strong>{reportStats.total}</strong></div>
                <div className="report-kpi"><span>{tr('Prontos', 'Ready')}</span><strong>{reportStats.pronto}</strong></div>
                <div className="report-kpi"><span>{tr('Em processamento', 'In processing')}</span><strong>{reportStats.processamento}</strong></div>
              </div>
              <div className="row-tools">
                <select value={relatorioPeriodo} onChange={(e) => setRelatorioPeriodo(e.target.value)}>
                  <option value="hoje">{tr('Hoje', 'Today')}</option>
                  <option value="7">7 {tr('dias', 'days')}</option>
                  <option value="30">30 {tr('dias', 'days')}</option>
                  <option value="todos">{tr('Todo período', 'All period')}</option>
                </select>
                <button className={`btn ghost ${relatorioFiltrosAbertos ? 'active' : ''}`} onClick={() => setRelatorioFiltrosAbertos((v) => !v)}>{tr('Filtros', 'Filters')}</button>
                <button className="btn primary" onClick={criarNovoRelatorio} disabled={!canCreateReports}>{tr('Novo Relatório', 'New Report')}</button>
              </div>
              {relatorioFiltrosAbertos && (
                <div className="report-filter-panel">
                  <label>
                    {tr('Tipo', 'Type')}
                    <select value={relatorioFiltroTipo} onChange={(e) => setRelatorioFiltroTipo(e.target.value)}>
                      <option value="todos">{tr('Todos', 'All')}</option>
                      {relatorioTiposDisponiveis.map((t) => <option key={t} value={t}>{idioma === 'en' ? (REPORT_TYPE_EN[t] || t) : t}</option>)}
                    </select>
                  </label>
                  <label>
                    {tr('Status', 'Status')}
                    <select value={relatorioFiltroStatus} onChange={(e) => setRelatorioFiltroStatus(e.target.value)}>
                      <option value="todos">{tr('Todos', 'All')}</option>
                      {relatorioStatusDisponiveis.map((s) => <option key={s} value={s}>{trStatus(s)}</option>)}
                    </select>
                  </label>
                  <button className="btn ghost small" onClick={() => { setRelatorioFiltroTipo('todos'); setRelatorioFiltroStatus('todos'); }}>{tr('Limpar filtros', 'Clear filters')}</button>
                </div>
              )}
              <table className="table">
                <thead><tr><th aria-label={tr('Ícone', 'Icon')}></th><th>{tr('Nome', 'Name')}</th><th>{tr('Tipo', 'Type')}</th><th>{tr('Data', 'Date')}</th><th>{tr('Tamanho', 'Size')}</th><th>{tr('Status', 'Status')}</th><th>LGPD</th><th>{tr('Ações', 'Actions')}</th></tr></thead>
                <tbody>
                  {reportsVisible.map((r, idx) => (
                    <tr key={`${r.nome}-${r.data}-${idx}`}>
                      <td>
                        <span className={`row-icon-badge report ${String(r.tipo).toLowerCase().includes('técn') ? 'tech' : String(r.tipo).toLowerCase().includes('pred') ? 'pred' : 'ops'}`}>
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M7 3h7l5 5v13H7z" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M14 3v5h5M10 12h6M10 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </span>
                      </td>
                      <td>{mask(r.nome, privacyMode)}</td>
                      <td>{idioma === 'en' ? (REPORT_TYPE_EN[r.tipo] || r.tipo) : r.tipo}</td>
                      <td>{r.data}</td>
                      <td>{r.tamanho}</td>
                      <td><span className={`chip ${statusClass(r.status)}`}>{trStatus(r.status)}</span></td>
                      <td><span className="chip ok">{r.lgpd}</span></td>
                      <td className="report-actions">
                        <button className="btn ghost small" onClick={() => abrirPreviewRelatorio(r)}>{tr('Prévia', 'Preview')}</button>
                        <button className="btn small" onClick={() => baixarRelatorioPdf(r)}>{tr('Baixar', 'Download')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeSection === 'configuracoes' && (
          <section className="section">
            <h2>{tr('Configurações', 'Settings')}</h2>
            <p className="section-sub">{tr('Personalize suas preferências do sistema', 'Customize your system preferences')}</p>
            <div className="settings-grid">
              <div className="panel">
                <h3 className="card-title-icon"><span className="card-icon blue"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" /><path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>{tr('Perfil do Usuário', 'User Profile')}</h3>
                <label>{tr('Nome', 'Name')}<input value={mask('Operador Sistema', privacyMode)} readOnly /></label>
                <label>{tr('Email', 'Email')}<input value={mask('operador@aeroporto.com', privacyMode)} readOnly /></label>
                <label>{tr('Cargo', 'Role')}<select><option>{tr('Operador Sênior', 'Senior Operator')}</option></select></label>
              </div>
              <div className="panel">
                <h3 className="card-title-icon"><span className="card-icon amber"><svg viewBox="0 0 24 24" fill="none"><path d="M12 4a4 4 0 0 0-4 4v1.8c0 .9-.3 1.7-.8 2.4L6 14h12l-1.2-1.8a4 4 0 0 1-.8-2.4V8a4 4 0 0 0-4-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 17a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>{tr('Notificações', 'Notifications')}</h3>
                <label><input type="checkbox" checked={delayAlertEnabled} onChange={(e) => setDelayAlertEnabled(e.target.checked)} /> {tr('Atrasos de Voos', 'Flight Delays')}</label>
                <label><input type="checkbox" checked={notifCancelamentos} onChange={(e) => setNotifCancelamentos(e.target.checked)} /> {tr('Cancelamentos', 'Cancellations')}</label>
                <label><input type="checkbox" checked={notifManutencao} onChange={(e) => setNotifManutencao(e.target.checked)} /> {tr('Manutenção', 'Maintenance')}</label>
                <label><input type="checkbox" checked={notifSistema} onChange={(e) => setNotifSistema(e.target.checked)} /> {tr('Sistema', 'System')}</label>
                <label>
                  {tr('Limiar de alerta de atraso', 'Delay alert threshold')}
                  <input
                    type="range"
                    min="20"
                    max="95"
                    step="5"
                    value={delayAlertThreshold}
                    onChange={(e) => setDelayAlertThreshold(Number(e.target.value))}
                    aria-label={tr('Limiar de alerta de atraso', 'Delay alert threshold')}
                  />
                  <small>{delayAlertThreshold}%</small>
                </label>
              </div>
              <div className="panel">
                <h3 className="card-title-icon"><span className="card-icon green"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3 5 6v5c0 5 3.5 8 7 10 3.5-2 7-5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.6" /><path d="M9.5 12.2 11.2 14l3.3-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>{tr('Privacidade e Segurança', 'Privacy and Security')}</h3>
                <label><input type="checkbox" checked={privacyMode} onChange={() => setPrivacyMode((v) => !v)} /> {tr('Modo Privacidade Automático', 'Automatic Privacy Mode')}</label>
                <label><input type="checkbox" defaultChecked /> {tr('Registro de Acessos', 'Access Logs')}</label>
                <label>{tr('Retenção de Dados', 'Data Retention')}<select><option>90 {tr('dias', 'days')}</option><option>180 {tr('dias', 'days')}</option><option>365 {tr('dias', 'days')}</option></select></label>
                <div className="role-permissions">
                  <strong>{tr('Permissões por perfil', 'Role permissions')}</strong>
                  <p>{tr('ADMIN: gerencia voos, relatórios, segurança e auditoria.', 'ADMIN: manages flights, reports, security and audit.')}</p>
                  <p>{tr('OPERADOR: cria relatórios e monitora operações.', 'OPERATOR: creates reports and monitors operations.')}</p>
                  <p>{tr('PASSAGEIRO/CIA: acesso somente leitura.', 'PASSENGER/AIRLINE: read-only access.')}</p>
                </div>
              </div>
              <div className="panel">
                <h3 className="card-title-icon"><span className="card-icon violet"><svg viewBox="0 0 24 24" fill="none"><path d="M15 3a8 8 0 1 0 6 12.5A7 7 0 1 1 15 3Z" stroke="currentColor" strokeWidth="1.6" /></svg></span>{tr('Aparência', 'Appearance')}</h3>
                <label>
                  {tr('Tema', 'Theme')}
                  <select value={tema} onChange={(e) => setTema(e.target.value)}>
                    <option value="escuro">{tr('Escuro', 'Dark')}</option>
                    <option value="claro">{tr('Claro', 'Light')}</option>
                  </select>
                </label>
                <label>{tr('Idioma', 'Language')}
                  <select value={idioma} onChange={(e) => setIdioma(e.target.value)}>
                    <option value="pt-BR">{tr('Português (Brasil)', 'Portuguese (Brazil)')}</option>
                    <option value="en">{tr('Inglês', 'English')}</option>
                  </select>
                </label>
                <label>{tr('Densidade', 'Density')}
                  <select value={densidade} onChange={(e) => setDensidade(e.target.value)}>
                    <option value="confortavel">{tr('Confortável', 'Comfortable')}</option>
                    <option value="compacta">{tr('Compacta', 'Compact')}</option>
                  </select>
                </label>
              </div>
              <div className="panel full">
                <h3>{tr('Segurança da Conta', 'Account Security')}</h3>
                <div className="security-actions">
                  <button className="btn ghost" onClick={() => { setSecurityView('senha'); setSecurityFeedback(''); }}>{tr('Alterar Senha', 'Change Password')}</button>
                  <button className="btn ghost" onClick={() => { setSecurityView('2fa'); setSecurityFeedback(''); carregar2FA(); }} disabled={!canManageSecurity}>{tr('Autenticação em Dois Fatores', 'Two-Factor Authentication')}</button>
                  <button className="btn ghost" onClick={() => { setSecurityView('sessoes'); setSecurityFeedback(''); carregarSessoes(); }} disabled={!canManageSecurity}>{tr('Sessões Ativas', 'Active Sessions')}</button>
                  <button className="btn ghost" onClick={() => { setSecurityView('lgpd'); setSecurityFeedback(''); }}>{tr('Solicitar Dados Pessoais (LGPD Art. 18)', 'Request Personal Data (LGPD Art. 18)')}</button>
                  <button className="btn ghost" onClick={() => { setSecurityView('auditoria'); setSecurityFeedback(''); }}>{tr('Trilha de Auditoria', 'Audit Trail')}</button>
                </div>
                <div className="security-box">
                  {securityView === 'senha' && (
                    <>
                      <h4>{tr('Alterar senha', 'Change password')}</h4>
                      <p>{tr('Atualize sua senha de acesso com segurança.', 'Update your access password securely.')}</p>
                      <label>{tr('Senha atual', 'Current password')}<input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} /></label>
                      <label>{tr('Nova senha', 'New password')}<input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} /></label>
                      <label>{tr('Confirmar nova senha', 'Confirm new password')}<input type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} /></label>
                      <button className="btn primary small" onClick={alterarSenhaConta} disabled={securityBusy}>{tr('Salvar nova senha', 'Save new password')}</button>
                    </>
                  )}
                  {securityView === '2fa' && (
                    <>
                      <h4>{tr('Autenticação em dois fatores', 'Two-factor authentication')}</h4>
                      <p>{tr('Ative uma camada extra de proteção para login.', 'Enable an extra protection layer for login.')}</p>
                      <p>{tr('Status atual', 'Current status')}: <strong>{twoFactorEnabled ? tr('Ativado', 'Enabled') : tr('Desativado', 'Disabled')}</strong></p>
                      <button className="btn primary small" onClick={alternar2FA} disabled={securityBusy}>
                        {twoFactorEnabled ? tr('Desativar 2FA', 'Disable 2FA') : tr('Ativar 2FA', 'Enable 2FA')}
                      </button>
                    </>
                  )}
                  {securityView === 'sessoes' && (
                    <>
                      <h4>{tr('Sessões ativas', 'Active sessions')}</h4>
                      <p>{tr('Visualize e encerre sessões conectadas à sua conta.', 'View and close sessions connected to your account.')}</p>
                      <div className="sessions-list">
                        {sessoes.length === 0 && <p>{tr('Nenhuma sessão registrada.', 'No session found.')}</p>}
                        {sessoes.map((s) => (
                          <div className="session-item" key={s.id}>
                            <div>
                              <strong>{s.ativa ? tr('Ativa', 'Active') : tr('Encerrada', 'Closed')}</strong>
                              <p>{s.user_agent || tr('Dispositivo não identificado', 'Unidentified device')}</p>
                              <small>{s.ip || '-'} · {s.criado_em}</small>
                            </div>
                            {s.ativa ? (
                              <button className="btn ghost small" onClick={() => encerrarSessao(s.id)} disabled={securityBusy}>
                                {tr('Encerrar', 'Close')}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
	                  {securityView === 'lgpd' && (
	                    <>
	                      <h4>{tr('Central LGPD', 'LGPD Center')}</h4>
	                      <p>{tr('Gerencie consentimentos, finalidade de uso dos dados e solicitações previstas no Art. 18 da LGPD.', 'Manage consents, data usage purpose and requests under LGPD Article 18.')}</p>
	                      {!token ? (
	                        <div className="lgpd-login-notice">
	                          <strong>{tr('Login necessario', 'Sign in required')}</strong>
	                          <p>{tr('Entre na sua conta para salvar consentimentos e registrar solicitacoes no banco SPEC.', 'Sign in to save consents and register requests in the SPEC database.')}</p>
	                          <button className="btn primary small" onClick={() => { setModoAuth('login'); setLoginOpen(true); }}>
	                            {tr('Entrar agora', 'Sign in now')}
	                          </button>
	                        </div>
	                      ) : null}
	                      <div className="lgpd-purpose-grid">
	                        {LGPD_PURPOSES.map((purpose) => {
	                          const active = !!lgpdConsents[purpose.key];
	                          const lastDate = lgpdConsentDates[purpose.key]
	                            ? new Date(lgpdConsentDates[purpose.key]).toLocaleString(idioma === 'en' ? 'en-US' : 'pt-BR')
	                            : tr('Sem registro', 'No record');
	                          return (
	                            <article className={`lgpd-purpose ${active ? 'active' : ''}`} key={purpose.key}>
	                              <div>
	                                <strong>{idioma === 'en' ? purpose.titleEn : purpose.titlePt}</strong>
	                                <p>{idioma === 'en' ? purpose.descEn : purpose.descPt}</p>
	                                <small>{tr('Ultima atualizacao', 'Last update')}: {lastDate}</small>
	                              </div>
	                              <button
	                                className={`btn small ${active ? 'ghost' : 'primary'}`}
	                                onClick={() => atualizarConsentimentoLGPD(purpose.key, !active)}
	                                disabled={securityBusy || !token}
	                              >
	                                {active ? tr('Revogar', 'Revoke') : tr('Conceder', 'Grant')}
	                              </button>
	                            </article>
	                          );
	                        })}
	                      </div>
	                      <div className="lgpd-request-box">
	                        <h5>{tr('Solicitação de direitos do titular', 'Data subject request')}</h5>
	                        <p>{tr('Registre pedido de exportação ou exclusão para demonstrar o fluxo LGPD no banco SPEC.', 'Register export or deletion requests to demonstrate the LGPD flow in the SPEC database.')}</p>
	                        <label>
	                          {tr('Tipo da solicitação', 'Request type')}
	                          <select value={lgpdTipo} onChange={(e) => setLgpdTipo(e.target.value)}>
	                            <option value="EXPORTACAO">{tr('Exportação de dados', 'Data export')}</option>
	                            <option value="EXCLUSAO">{tr('Exclusão de dados', 'Data deletion')}</option>
	                          </select>
	                        </label>
	                        <label>
	                          {tr('Detalhes (opcional)', 'Details (optional)')}
	                          <input value={lgpdDetalhes} onChange={(e) => setLgpdDetalhes(e.target.value)} placeholder={tr('Informe contexto ou observações', 'Provide context or notes')} />
	                        </label>
	                        <button className="btn primary small" onClick={solicitarLGPD} disabled={securityBusy || !token}>{tr('Enviar solicitação', 'Submit request')}</button>
	                      </div>
	                    </>
	                  )}
                  {securityView === 'auditoria' && (
                    <>
                      <h4>{tr('Trilha de auditoria', 'Audit trail')}</h4>
                      <p>{tr('Ações críticas recentes do sistema.', 'Recent critical actions in the system.')}</p>
                      <div className="sessions-list">
                        {auditTrail.length === 0 && <p>{tr('Nenhum evento registrado.', 'No event logged.')}</p>}
                        {auditTrail.map((ev) => (
                          <div className="session-item" key={ev.id}>
                            <div>
                              <strong>{ev.action}</strong>
                              <p>{ev.details || '-'}</p>
                              <small>{new Date(ev.at).toLocaleString(idioma === 'en' ? 'en-US' : 'pt-BR')} · {ev.user} · {ev.role}</small>
                            </div>
                            <span className={`chip ${ev.severity === 'warn' ? 'warn' : ev.severity === 'ok' ? 'ok' : 'info'}`}>{ev.severity}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {securityFeedback ? <p className="security-feedback">{securityFeedback}</p> : null}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {reportPreview && (
        <div className="flight-modal-backdrop" onClick={() => setReportPreview(null)}>
          <div className="flight-modal report-preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setReportPreview(null)} aria-label={tr('Fechar', 'Close')}>✕</button>
            <div className="flight-header">
              <h3>{reportPreview.relatorio.nome}</h3>
              <p>{reportPreview.relatorio.tipo} · {reportPreview.relatorio.data}</p>
            </div>
            <div className="report-preview-body">
              <h4>{tr('Resumo executivo', 'Executive summary')}</h4>
              <ul>
                {reportPreview.sumarioExecutivo.map((item, idx) => <li key={`sum-${idx}`}>{item}</li>)}
              </ul>
              {reportPreview.detalhes.map((secao, idx) => (
                <div key={`det-${idx}`} className="report-preview-section">
                  <h4>{secao.title}</h4>
                  <ul>
                    {secao.rows.map((item, rowIdx) => <li key={`row-${idx}-${rowIdx}`}>{item}</li>)}
                  </ul>
                </div>
              ))}
              <div className="report-preview-actions">
                <button className="btn ghost" onClick={() => setReportPreview(null)}>{tr('Fechar', 'Close')}</button>
                <button className="btn primary" onClick={() => { baixarRelatorioPdf(reportPreview.relatorio); setReportPreview(null); }}>{tr('Baixar PDF', 'Download PDF')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {displayedFlight && !privacyMode && (
        <div className="flight-modal-backdrop" onClick={closeModal}>
            <div className="flight-modal" onClick={(e) => e.stopPropagation()}>
              <button className="close-modal" onClick={closeModal} aria-label={tr('Fechar', 'Close')}>✕</button>
            <div className="flight-header">
              <h3>{displayedFlight.id}</h3>
              <p>{displayedFlight.cia}</p>
            </div>

            <div className="route-visual">
              <div>
                <strong>{displayedFlight.from.code}</strong>
                <span>{displayedFlight.from.city}</span>
              </div>
              <div className="progress-block">
                  <div className="progress-top">
                    <div className="progress-center">
                      <div className="plane-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2 12 L22 6 L18 12 L22 18 L2 12 Z" fill="#98c3ff" />
                        </svg>
                      </div>
                      <div className="progress-line">
                        <i style={{ width: `${Math.round(displayedFlight.progress * 100)}%` }} />
                      </div>
                      <div className="central-time">
                        <div className="central-time-block">
                          <span className="central-time-label">{tr('Partida', 'Departure')}</span>
                          <div className="time-row">
                            <strong>{displayedFlight.from.time}</strong>
                            {displayedFlight.from.timeEstimated ? <span className="estimate-badge">{tr('Estimado', 'Estimated')}</span> : null}
                          </div>
                        </div>
                        <div className="central-time-arrow">→</div>
                        <div className="central-time-block">
                          <span className="central-time-label">{tr('Chegada', 'Arrival')}</span>
                          <div className="time-row">
                            <strong>{displayedFlight.to.time}</strong>
                            {displayedFlight.to.timeEstimated ? <span className="estimate-badge">{tr('Estimado', 'Estimated')}</span> : null}
                          </div>
                        </div>
                      </div>
	                      {displayedFlight?.riscoLoading ? (
	                        <div className="probability"><span className="spinner" /> {tr('Carregando...', 'Loading...')}</div>
	                      ) : (
	                        <div className="probability">
                              <div className="probability-summary">
                                <span className="probability-kicker">{tr('Chance de atraso', 'Delay chance')}</span>
                                <div className="probability-main">
                                  <strong>{selectedDelayChance?.percent ?? 0}%</strong>
                                  {selectedDelayChance ? <span className={`prob-label ${selectedDelayChance.tone}`}>{trProbability(selectedDelayChance.label)}</span> : null}
                                  {displayedFlight?.riscoInfo?.label ? <span className="prob-label neutral">{displayedFlight.riscoInfo.label}</span> : null}
                                </div>
                              </div>
	                          {displayedFlight?.riscoInfo?.explicacao ? (
	                            <div className="risk-explain">{displayedFlight.riscoInfo.explicacao}</div>
	                          ) : null}
		                          {riskSignals.length ? (
		                            <div className="risk-signals">
		                              {riskSignals.map((signal) => (
	                                <article key={`${displayedFlight.id}-${signal.title}`} className={`risk-signal ${signal.tone}`}>
	                                  <div className="risk-signal-head">
	                                    <span className="risk-signal-title">{signal.title}</span>
	                                    <strong>{signal.value}</strong>
                                      </div>
	                                  <p>{signal.detail}</p>
	                                </article>
		                              ))}
		                            </div>
		                          ) : null}
	                              {Array.isArray(displayedFlight?.riscoInfo?.fatores) && displayedFlight.riscoInfo.fatores.length ? (
	                                <div className="ai-factors">
	                                  <strong>{tr('Fatores da IA preditiva', 'Predictive AI factors')}</strong>
	                                  {displayedFlight.riscoInfo.fatores.slice(0, 5).map((fator) => (
	                                    <span key={`${fator.nome}-${fator.peso}`}>
	                                      {fator.nome}: {fator.evidencia}
	                                    </span>
	                                  ))}
	                                </div>
	                              ) : null}
	                        </div>
	                      )}
                    </div>
                  </div>
                    <small className="progress-percent">{Math.round(displayedFlight.progress * 100)}% {tr('completo', 'complete')}</small>
              </div>
              <div>
                  <strong>{displayedFlight.to.code}</strong>
                  <span>{displayedFlight.to.city}</span>
              </div>
            </div>

            <div className="flight-grid">
                  <article className="stat-card">
                    <span className="stat-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 12l20-7-4 14-6-3-6 3-4-7z" stroke="#9fbef8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span>{tr('Aeronave', 'Aircraft')}</span>
                    <strong>{displayedFlight.aeronave}</strong>
                  </article>

                  <article className="stat-card">
                    <span className="stat-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="5" width="18" height="14" rx="2" stroke="#9fbef8" strokeWidth="1.2"/>
                        <path d="M8 12h8" stroke="#9fbef8" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>{tr('Portão', 'Gate')}</span>
                    <strong>{displayedFlight.portao}</strong>
                    {displayedFlight?.source !== 'local' ? <em className="live-badge">{tr('Ao vivo', 'Live')}</em> : null}
                  </article>
                  <article className="stat-card">
                    <span className="stat-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6h16v12H4z" stroke="#9fbef8" strokeWidth="1.2" />
                        <path d="M7 10h10M7 14h6" stroke="#9fbef8" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>{tr('Terminal', 'Terminal')}</span>
                    <strong>{displayedFlight.terminal || '-'}</strong>
                    {displayedFlight?.source !== 'local' ? <em className="live-badge">{tr('Ao vivo', 'Live')}</em> : null}
                  </article>
                  <article className="stat-card">
                    <span className="stat-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 12h12" stroke="#9fbef8" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M10 8l6 4-6 4" stroke="#9fbef8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span>{tr('Velocidade', 'Speed')}</span>
                    <strong>{displayedFlight.velocidade}</strong>
                  </article>
                  <article className="stat-card">
                    <span className="stat-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 3v18" stroke="#9fbef8" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M8 7h8M8 12h8M8 17h8" stroke="#9fbef8" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>{tr('Altitude', 'Altitude')}</span>
                    <strong>{displayedFlight.altitude}</strong>
                  </article>
            </div>

            <div className="flight-meta">
              <div className="flight-meta-row">
                <span>{tr('Status', 'Status')}</span>
                <strong>{displayedFlight.statusRaw || mapFlightStatus(displayedFlight.risco)}</strong>
              </div>
              <div className="flight-meta-row">
                <span>{tr('Região', 'Region')}</span>
                <strong>{displayedFlight.regiao || '-'}</strong>
              </div>
              <div className="flight-meta-row">
                <span>{tr('Rumo', 'Heading')}</span>
                <strong>{formatHeading(displayedFlight.heading)}</strong>
              </div>
              <div className="flight-meta-row">
                <span>{tr('Posição', 'Position')}</span>
                <strong>{formatCoord(displayedFlight.lat, true)} | {formatCoord(displayedFlight.lng, false)}</strong>
              </div>
              <div className="flight-meta-row">
                <span>{tr('Distância', 'Distance')}</span>
                <strong>{formatDistanceKm(displayedDistanceKm)}</strong>
              </div>
              <div className="flight-meta-row">
                <span>{tr('Atualizado', 'Updated')}</span>
                <strong>{displayedFlight.atualizado || '--:-- UTC'}</strong>
              </div>
            </div>

            <div className="flight-extras">
              <div className="flight-extras-card">
                <h4>{tr('Clima na origem', 'Origin weather')} {displayedFlight?.source !== 'local' ? <span className="live-badge inline">{tr('Ao vivo', 'Live')}</span> : null}</h4>
                {flightWeather.origin ? (
                  <>
                    <p><strong>{flightWeather.origin.name}</strong> · {flightWeather.origin.label}</p>
                    <p>{flightWeather.origin.temp} · {flightWeather.origin.wind}</p>
                  </>
                ) : (
                  <p>{tr('Indisponível', 'Unavailable')}</p>
                )}
              </div>
              <div className="flight-extras-card">
                <h4>{tr('Clima no destino', 'Destination weather')} {displayedFlight?.source !== 'local' ? <span className="live-badge inline">{tr('Ao vivo', 'Live')}</span> : null}</h4>
                {flightWeather.dest ? (
                  <>
                    <p><strong>{flightWeather.dest.name}</strong> · {flightWeather.dest.label}</p>
                    <p>{flightWeather.dest.temp} · {flightWeather.dest.wind}</p>
                  </>
                ) : (
                  <p>{tr('Indisponível', 'Unavailable')}</p>
                )}
              </div>
              <div className="flight-extras-card">
                <h4>{tr('Histórico 90 dias', '90-day history')}</h4>
                {flightHistory ? (
                  <>
                    <p>{tr('Total', 'Total')}: <strong>{flightHistory.total}</strong></p>
                    <p>{tr('Atrasos', 'Delays')}: <strong>{flightHistory.atrasados}</strong> · {tr('Taxa', 'Rate')}: <strong>{flightHistory.taxa_atraso}%</strong></p>
                    <p>{tr('Cancelamentos', 'Cancellations')}: <strong>{flightHistory.cancelados}</strong> · {tr('Taxa', 'Rate')}: <strong>{flightHistory.taxa_cancelamento}%</strong></p>
                  </>
                ) : (
                  <p>{tr('Indisponível', 'Unavailable')}</p>
                )}
              </div>
            </div>

              <div className="flight-status-live">
                <span className="status-dot" /> {tr('Voo Ativo - Em Rota', 'Active Flight - En Route')}
                <span className="chip info">{tr('Fonte', 'Source')}: {liveSourceBadgeLabel(displayedFlight?.source || liveMeta?.source, tr)}</span>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
