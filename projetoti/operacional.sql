CREATE DATABASE IF NOT EXISTS sistema_voos;
USE sistema_voos;

-- Aeroportos
CREATE TABLE IF NOT EXISTS aeroporto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  cidade VARCHAR(80) NOT NULL,
  estado CHAR(2) NOT NULL,
  iata CHAR(3) NULL,
  icao CHAR(4) NULL,
  UNIQUE KEY uq_aeroporto_iata (iata),
  UNIQUE KEY uq_aeroporto_icao (icao)
);

-- Garantir colunas IATA/ICAO em bancos existentes
SET @schema = DATABASE();
SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.columns
   WHERE table_schema=@schema AND table_name='aeroporto' AND column_name='iata') = 0,
  'ALTER TABLE aeroporto ADD COLUMN iata CHAR(3) NULL',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.columns
   WHERE table_schema=@schema AND table_name='aeroporto' AND column_name='icao') = 0,
  'ALTER TABLE aeroporto ADD COLUMN icao CHAR(4) NULL',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema=@schema AND table_name='aeroporto' AND index_name='uq_aeroporto_iata') = 0,
  'CREATE UNIQUE INDEX uq_aeroporto_iata ON aeroporto(iata)',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema=@schema AND table_name='aeroporto' AND index_name='uq_aeroporto_icao') = 0,
  'CREATE UNIQUE INDEX uq_aeroporto_icao ON aeroporto(icao)',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Voos
CREATE TABLE IF NOT EXISTS voo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero_voo VARCHAR(10) NOT NULL UNIQUE,
  companhia VARCHAR(100) NOT NULL,
  origem_id INT NOT NULL,
  destino_id INT NOT NULL,
  horario_previsto DATETIME NOT NULL,
  status ENUM('PREVISTO','EM_VOO','ATRASADO','CANCELADO','CONCLUIDO') DEFAULT 'PREVISTO',
  preco_medio DECIMAL(10,2) DEFAULT 0,
  FOREIGN KEY (origem_id) REFERENCES aeroporto(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (destino_id) REFERENCES aeroporto(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Tarifas
CREATE TABLE IF NOT EXISTS tarifa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  voo_id INT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  quantidade INT NOT NULL,
  FOREIGN KEY (voo_id) REFERENCES voo(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indices recomendados (idempotente via information_schema)
SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema=@schema AND table_name='voo' AND index_name='idx_voo_status') = 0,
  'CREATE INDEX idx_voo_status ON voo(status)',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema=@schema AND table_name='voo' AND index_name='idx_voo_horario_previsto') = 0,
  'CREATE INDEX idx_voo_horario_previsto ON voo(horario_previsto)',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema=@schema AND table_name='voo' AND index_name='idx_voo_origem') = 0,
  'CREATE INDEX idx_voo_origem ON voo(origem_id)',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema=@schema AND table_name='voo' AND index_name='idx_voo_destino') = 0,
  'CREATE INDEX idx_voo_destino ON voo(destino_id)',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE aeroporto SET iata='GRU', icao='SBGR'
WHERE cidade='São Paulo' AND estado='SP' AND (iata IS NULL OR iata='');
UPDATE aeroporto SET iata='GIG', icao='SBGL'
WHERE cidade='Rio de Janeiro' AND estado='RJ' AND (iata IS NULL OR iata='');

INSERT IGNORE INTO aeroporto (nome, cidade, estado, iata, icao) VALUES
('Aeroporto de São Paulo', 'São Paulo', 'SP', 'GRU', 'SBGR'),
('Aeroporto do Rio', 'Rio de Janeiro', 'RJ', 'GIG', 'SBGL');

INSERT INTO voo (numero_voo, companhia, origem_id, destino_id, horario_previsto, status, preco_medio) VALUES
('LA1234', 'LATAM', 1, 2, '2026-02-08 10:00:00', 'PREVISTO', 500.00),
('AZ5678', 'Azul', 2, 1, '2026-02-08 15:30:00', 'EM_VOO', 450.00)
ON DUPLICATE KEY UPDATE
  companhia=VALUES(companhia),
  origem_id=VALUES(origem_id),
  destino_id=VALUES(destino_id),
  horario_previsto=VALUES(horario_previsto),
  status=VALUES(status),
  preco_medio=VALUES(preco_medio);
