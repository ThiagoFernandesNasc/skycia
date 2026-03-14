const jwt = require('jsonwebtoken');
const dbSpec = require('../routes/dbSpec'); // pool do sistema_voos_spec

const JWT_SECRET = process.env.JWT_SECRET || 'segredo_super_secreto';

let sessionTableReady = false;
async function ensureSessionTable() {
  if (sessionTableReady) return;
  await dbSpec.query(
    `CREATE TABLE IF NOT EXISTS sessao_usuario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      jti VARCHAR(80) NOT NULL,
      user_agent VARCHAR(255) NULL,
      ip VARCHAR(80) NULL,
      ativa TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      revogada_em DATETIME NULL,
      FOREIGN KEY (usuario_id) REFERENCES usuario(id)
    )`
  );
  sessionTableReady = true;
}

async function autenticar(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader) {
    const [tipo, bearerToken] = authHeader.split(' ');
    if (tipo !== 'Bearer' || !bearerToken) {
      return res.status(401).json({ error: 'Formato de token inválido' });
    }
    token = bearerToken;
  }

  if (!token) {
    token = req.cookies?.auth_token || null;
  }

  if (!token) {
    return res.status(401).json({ error: 'Token não enviado' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = { id: payload.id, perfil: payload.perfil, jti: payload.jti };

    if (payload?.jti) {
      try {
        await ensureSessionTable();
        const [rows] = await dbSpec.query(
          'SELECT ativa FROM sessao_usuario WHERE usuario_id = ? AND jti = ? ORDER BY criado_em DESC LIMIT 1',
          [payload.id, payload.jti]
        );
        if (!rows.length || !rows[0].ativa) {
          return res.status(401).json({ error: 'Sessão revogada ou inexistente' });
        }
      } catch (err) {
        console.error('Falha ao validar sessão:', err);
      }
    }

    // registra log de acesso LGPD
    try {
      await dbSpec.query(
        `INSERT INTO log_acesso_dado (usuario_id, acao, entidade, detalhes)
         VALUES (?, ?, ?, ?)`,
        [payload.id, 'LISTAR_VOOS', 'VOO', JSON.stringify({ path: req.path })]
      );
    } catch (logErr) {
      console.error('Falha ao registrar log LGPD:', logErr);
    }

    return next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = { autenticar };

