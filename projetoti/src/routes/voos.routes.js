const express = require('express');
const router = express.Router();
const db = require('../db');
const { autenticar } = require('../middlewares/auth.middleware');
const { getLiveFlights } = require('../services/liveFlights.service');

// Rota pública para dados ao vivo (sem login)
router.get('/live', async (req, res) => {
  try {
    const { limit, source, status } = req.query;
    const payload = await getLiveFlights({ limit, source, status });
    res.json(payload);
  } catch (err) {
    console.error('[liveFlights] erro ao consultar /voos/live:', err);
    res.status(500).json({ error: 'Erro ao consultar voos ao vivo' });
  }
});

// Autenticação para o restante das rotas
router.use(autenticar);

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT numero_voo, companhia, horario_previsto, status, preco_medio
      FROM voo
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar voos' });
  }
});

// GET /voos/historico?companhia=...&origem=...&destino=...&dias=90
router.get('/historico', async (req, res) => {
  const companhia = String(req.query?.companhia || '').trim();
  const origem = String(req.query?.origem || '').trim();
  const destino = String(req.query?.destino || '').trim();
  const dias = Math.min(365, Math.max(7, Number(req.query?.dias || 90)));

  try {
    const conditions = ['v.horario_previsto >= (NOW() - INTERVAL ? DAY)'];
    const params = [dias];

    if (companhia) {
      conditions.push('v.companhia = ?');
      params.push(companhia);
    }
    if (origem) {
      conditions.push('ao.cidade = ?');
      params.push(origem);
    }
    if (destino) {
      conditions.push('ad.cidade = ?');
      params.push(destino);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(v.status = 'ATRASADO') AS atrasados,
        SUM(v.status = 'CANCELADO') AS cancelados,
        SUM(v.status = 'CONCLUIDO') AS concluidos,
        SUM(v.status = 'EM_VOO') AS em_voo,
        SUM(v.status = 'PREVISTO') AS previstos
      FROM voo v
      JOIN aeroporto ao ON ao.id = v.origem_id
      JOIN aeroporto ad ON ad.id = v.destino_id
      ${where}
      `,
      params
    );

    const row = rows?.[0] || {};
    const total = Number(row.total || 0);
    const atrasados = Number(row.atrasados || 0);
    const cancelados = Number(row.cancelados || 0);
    const result = {
      total,
      atrasados,
      cancelados,
      concluidos: Number(row.concluidos || 0),
      em_voo: Number(row.em_voo || 0),
      previstos: Number(row.previstos || 0),
      taxa_atraso: total ? Math.round((atrasados / total) * 100) : 0,
      taxa_cancelamento: total ? Math.round((cancelados / total) * 100) : 0,
      dias,
      companhia: companhia || null,
      origem: origem || null,
      destino: destino || null
    };

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao calcular historico' });
  }
});

module.exports = router;

