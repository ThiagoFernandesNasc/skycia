USE sistema_voos;

-- 0. View para apresentacao: remove NULL da visualizacao sem alterar os dados reais
CREATE OR REPLACE VIEW vw_voos_live_apresentacao AS
SELECT
  flight_key,
  COALESCE(numero_voo, 'Nao informado') AS numero_voo,
  COALESCE(callsign, 'Nao informado') AS callsign,
  COALESCE(companhia, 'Nao informado') AS companhia,
  COALESCE(aeronave, 'Nao informado') AS aeronave,
  COALESCE(origem, 'Nao informado') AS origem,
  COALESCE(destino, 'Nao informado') AS destino,
  COALESCE(CAST(latitude AS CHAR), 'Nao informado') AS latitude,
  COALESCE(CAST(longitude AS CHAR), 'Nao informado') AS longitude,
  COALESCE(CAST(altitude_pes AS CHAR), 'Nao informado') AS altitude_pes,
  COALESCE(CAST(velocidade_kmh AS CHAR), 'Nao informado') AS velocidade_kmh,
  COALESCE(CAST(rumo_graus AS CHAR), 'Nao informado') AS rumo_graus,
  COALESCE(status, 'Nao informado') AS status,
  COALESCE(CAST(horario_partida AS CHAR), 'Nao informado') AS horario_partida,
  COALESCE(CAST(horario_chegada AS CHAR), 'Nao informado') AS horario_chegada,
  COALESCE(portao_partida, 'Nao informado') AS portao_partida,
  COALESCE(portao_chegada, 'Nao informado') AS portao_chegada,
  COALESCE(terminal_partida, 'Nao informado') AS terminal_partida,
  COALESCE(terminal_chegada, 'Nao informado') AS terminal_chegada,
  COALESCE(fonte, 'Nao informado') AS fonte,
  COALESCE(fallback_fonte, 'Nao informado') AS fallback_fonte,
  COALESCE(CAST(atualizado_api_em AS CHAR), 'Nao informado') AS atualizado_api_em,
  persistido_em
FROM voo_live_estado;

-- 1. Voos operacionais com origem e destino
SELECT
  v.id,
  v.numero_voo,
  v.companhia,
  ao.nome AS aeroporto_origem,
  ao.cidade AS cidade_origem,
  ao.estado AS estado_origem,
  ao.iata AS iata_origem,
  ad.nome AS aeroporto_destino,
  ad.cidade AS cidade_destino,
  ad.estado AS estado_destino,
  ad.iata AS iata_destino,
  v.horario_previsto,
  v.status,
  v.preco_medio
FROM voo v
JOIN aeroporto ao ON ao.id = v.origem_id
JOIN aeroporto ad ON ad.id = v.destino_id
ORDER BY v.horario_previsto DESC;

-- 2. Estado atual dos voos ao vivo persistidos
SELECT
  flight_key,
  numero_voo,
  callsign,
  companhia,
  aeronave,
  origem,
  destino,
  latitude,
  longitude,
  altitude_pes,
  velocidade_kmh,
  rumo_graus,
  status,
  horario_partida,
  horario_chegada,
  portao_partida,
  portao_chegada,
  terminal_partida,
  terminal_chegada,
  fonte,
  fallback_fonte,
  atualizado_api_em,
  persistido_em
FROM voo_live_estado
ORDER BY COALESCE(atualizado_api_em, persistido_em) DESC;

-- 2.1. Estado atual para apresentacao, sem exibir NULL
SELECT
  flight_key,
  numero_voo,
  callsign,
  companhia,
  aeronave,
  origem,
  destino,
  latitude,
  longitude,
  altitude_pes,
  velocidade_kmh,
  rumo_graus,
  status,
  horario_partida,
  horario_chegada,
  portao_partida,
  portao_chegada,
  terminal_partida,
  terminal_chegada,
  fonte,
  fallback_fonte,
  atualizado_api_em,
  persistido_em
FROM vw_voos_live_apresentacao
ORDER BY persistido_em DESC;

-- 3. Estado atual de um voo especifico
SELECT
  flight_key,
  numero_voo,
  callsign,
  companhia,
  aeronave,
  origem,
  destino,
  latitude,
  longitude,
  altitude_pes,
  velocidade_kmh,
  rumo_graus,
  status,
  horario_partida,
  horario_chegada,
  portao_partida,
  portao_chegada,
  terminal_partida,
  terminal_chegada,
  fonte,
  fallback_fonte,
  atualizado_api_em,
  persistido_em
FROM voo_live_estado
WHERE flight_key = 'AZ5678' OR numero_voo = 'AZ5678'
ORDER BY COALESCE(atualizado_api_em, persistido_em) DESC;

-- 3.1. Estado atual de um voo especifico para apresentacao, sem exibir NULL
SELECT
  *
FROM vw_voos_live_apresentacao
WHERE flight_key = 'AZ5678' OR numero_voo = 'AZ5678' OR callsign = 'AZ5678'
ORDER BY persistido_em DESC;

-- 4. Historico (snapshots) de um voo especifico
SELECT
  flight_key,
  numero_voo,
  companhia,
  origem,
  destino,
  latitude,
  longitude,
  altitude_pes,
  velocidade_kmh,
  rumo_graus,
  status,
  portao_partida,
  terminal_partida,
  fonte,
  fallback_fonte,
  atualizado_api_em,
  capturado_em
FROM voo_live_snapshot
WHERE flight_key = 'AZ5678' OR numero_voo = 'AZ5678'
ORDER BY capturado_em DESC;

-- 5. Ultimos snapshots capturados no banco
SELECT
  id,
  flight_key,
  numero_voo,
  companhia,
  status,
  altitude_pes,
  velocidade_kmh,
  fonte,
  fallback_fonte,
  capturado_em
FROM voo_live_snapshot
ORDER BY capturado_em DESC
LIMIT 100;

-- 6. Resumo por status dos voos ao vivo persistidos
SELECT
  status,
  COUNT(*) AS total
FROM voo_live_estado
GROUP BY status
ORDER BY total DESC, status;

-- 7. Resumo por fonte dos dados ao vivo
SELECT
  fonte,
  fallback_fonte,
  COUNT(*) AS total
FROM voo_live_estado
GROUP BY fonte, fallback_fonte
ORDER BY total DESC, fonte;

-- 8. Voos ao vivo com maior altitude no momento
SELECT
  flight_key,
  numero_voo,
  companhia,
  origem,
  destino,
  altitude_pes,
  velocidade_kmh,
  status,
  atualizado_api_em
FROM voo_live_estado
ORDER BY altitude_pes DESC, velocidade_kmh DESC
LIMIT 20;

-- 9. Voos ao vivo com maior velocidade no momento
SELECT
  flight_key,
  numero_voo,
  companhia,
  origem,
  destino,
  velocidade_kmh,
  altitude_pes,
  status,
  atualizado_api_em
FROM voo_live_estado
ORDER BY velocidade_kmh DESC, altitude_pes DESC
LIMIT 20;

-- 10. Operacional + estado ao vivo lado a lado
SELECT
  v.numero_voo,
  v.companhia AS companhia_operacional,
  v.status AS status_operacional,
  v.horario_previsto,
  ao.iata AS iata_origem_operacional,
  ad.iata AS iata_destino_operacional,
  l.status AS status_live,
  l.origem AS origem_live,
  l.destino AS destino_live,
  l.portao_partida,
  l.terminal_partida,
  l.altitude_pes,
  l.velocidade_kmh,
  l.rumo_graus,
  l.fonte,
  l.atualizado_api_em
FROM voo v
JOIN aeroporto ao ON ao.id = v.origem_id
JOIN aeroporto ad ON ad.id = v.destino_id
LEFT JOIN voo_live_estado l
  ON l.flight_key = UPPER(REPLACE(v.numero_voo, ' ', ''))
  OR l.numero_voo = v.numero_voo
ORDER BY v.horario_previsto DESC;

USE sistema_voos_spec;

-- Garantir coluna usada nos SELECTs em bancos SPEC antigos
SET @schema = DATABASE();
SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.columns
   WHERE table_schema=@schema AND table_name='usuario' AND column_name='companhia') = 0,
  'ALTER TABLE usuario ADD COLUMN companhia VARCHAR(120) NULL AFTER perfil',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 11. Usuarios cadastrados
SELECT
  id,
  nome,
  email,
  perfil,
  companhia,
  criado_em
FROM usuario
ORDER BY criado_em DESC;

-- 12. Consentimentos LGPD por usuario
SELECT
  u.id,
  u.nome,
  u.email,
  c.tipo,
  c.concedido,
  c.data_hora
FROM consentimento c
JOIN usuario u ON u.id = c.usuario_id
ORDER BY c.data_hora DESC;

-- 13. Solicitacoes LGPD abertas
SELECT
  s.id,
  u.nome,
  u.email,
  s.tipo,
  s.status,
  s.detalhes,
  s.criado_em
FROM solicitacao_lgpd s
JOIN usuario u ON u.id = s.usuario_id
WHERE s.status = 'ABERTA'
ORDER BY s.criado_em DESC;

-- 14. Trilhas de auditoria / acesso a dados
SELECT
  l.id,
  u.nome,
  u.email,
  l.acao,
  l.entidade,
  l.detalhes,
  l.data_hora
FROM log_acesso_dado l
JOIN usuario u ON u.id = l.usuario_id
ORDER BY l.data_hora DESC
LIMIT 100;

-- 15. Sessoes ativas por usuario
SELECT
  s.id,
  u.nome,
  u.email,
  s.jti,
  s.user_agent,
  s.ip,
  s.ativa,
  s.criado_em,
  s.revogada_em
FROM sessao_usuario s
JOIN usuario u ON u.id = s.usuario_id
WHERE s.ativa = 1
ORDER BY s.criado_em DESC;
