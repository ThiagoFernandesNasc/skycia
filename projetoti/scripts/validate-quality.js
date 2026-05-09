const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { calcularRiscoAtraso } = require('../src/services/ia.service');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8').toLowerCase();
}

function assertContains(source, terms, label) {
  for (const term of terms) {
    assert(
      source.includes(term.toLowerCase()),
      `${label}: termo obrigatório ausente: ${term}`
    );
  }
}

function validateSchema() {
  const operacional = read('operacional.sql');
  const spec = read('spec.sql');

  assertContains(
    operacional,
    ['create table if not exists aeroporto', 'create table if not exists voo', 'voo_live_estado', 'voo_live_snapshot'],
    'SOR/SOT operacional'
  );
  assertContains(
    spec,
    ['create table if not exists usuario', 'consentimento', 'log_acesso_dado', 'sessao_usuario', 'solicitacao_lgpd'],
    'SPEC/LGPD'
  );
}

function validateIaMetric() {
  const now = Date.now();
  const fixtures = [
    {
      expected: 'CRITICO',
      voo: {
        numero_voo: 'QA1001',
        status: 'CANCELADO',
        horario_partida: new Date(now + 120 * 60000).toISOString(),
        altitude_pes: 0,
        velocidade_kmh: 0,
        origem: 'GRU',
        destino: 'GIG',
        portao_partida: null,
        fonte: 'local',
      },
    },
    {
      expected: 'MEDIO',
      voo: {
        numero_voo: 'QA1002',
        status: 'ATRASADO',
        horario_partida: new Date(now + 240 * 60000).toISOString(),
        altitude_pes: 32000,
        velocidade_kmh: 780,
        origem: 'GRU',
        destino: 'REC',
        portao_partida: 'A10',
        fonte: 'all',
      },
    },
    {
      expected: 'BAIXO',
      voo: {
        numero_voo: 'QA1003',
        status: 'CONCLUIDO',
        horario_partida: new Date(now - 180 * 60000).toISOString(),
        altitude_pes: 30000,
        velocidade_kmh: 720,
        origem: 'GIG',
        destino: 'GRU',
        portao_partida: 'B02',
        fonte: 'all',
      },
    },
  ];

  let hits = 0;
  for (const item of fixtures) {
    const result = calcularRiscoAtraso(item.voo, 'tradicional');
    if (result.label === item.expected) hits += 1;
    console.log(`${item.voo.numero_voo}: esperado=${item.expected} obtido=${result.label} score=${result.percent}%`);
  }

  const accuracy = hits / fixtures.length;
  console.log(`Acuracia fixture IA tradicional: ${(accuracy * 100).toFixed(1)}% (${hits}/${fixtures.length})`);
  assert(accuracy >= 0.66, 'Acurácia mínima da fixture de IA tradicional não atingida');
}

validateSchema();
validateIaMetric();
console.log('Validação de qualidade concluída com sucesso.');
