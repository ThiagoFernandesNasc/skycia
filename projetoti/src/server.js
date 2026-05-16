const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const voosRoutes = require('./routes/voos.routes');
const authRoutes = require('./routes/auth.routes'); // <-- novo
const iaRoutes = require('./routes/ia.routes');
const { openApiSpec } = require('./docs/openapi');
const { initDatabases } = require('../scripts/init-db');

let swaggerUi = null;
try {
  swaggerUi = require('swagger-ui-express');
} catch (err) {
  swaggerUi = null;
}

const app = express();
const isDemo = process.env.DEMO_MODE === 'true';
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());
function buildApiSpec(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const origin = `${protocol}://${host}`;
  const baseSpec = isDemo
    ? {
        ...openApiSpec,
        info: {
          ...openApiSpec.info,
          title: `${openApiSpec.info?.title || 'API'} (Demo completa)`,
          description: 'Modo demonstracao com backend completo ativo. IA generativa/LLM fica desativada para estabilidade da apresentacao.',
        },
      }
    : openApiSpec;

  return {
    ...baseSpec,
    servers: [
      {
        url: origin,
        description: 'Servidor atual',
      },
    ],
  };
}

app.get('/docs.json', (req, res) => {
  res.json(buildApiSpec(req));
});

if (swaggerUi) {
  app.use('/docs', swaggerUi.serve, (req, res, next) => {
    swaggerUi.setup(buildApiSpec(req), { explorer: true })(req, res, next);
  });
} else {
  app.get('/docs', (_req, res) => {
    res
      .status(503)
      .json({ error: 'Swagger UI indisponivel. Instale a dependencia swagger-ui-express.' });
  });
}

app.use('/voos', voosRoutes);
app.use('/auth', authRoutes);
app.use('/ia', iaRoutes);

const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));
app.get(/^(?!\/(?:voos|auth|ia|docs|docs\.json)(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API rodando na porta ${port}`);
});

initDatabases()
  .then(() => {
    console.log('Banco inicializado/verificado no boot.');
  })
  .catch((err) => {
    console.error(`Banco indisponivel no boot; API continua online: ${err.code || err.name || 'ERROR'} ${err.message || err}`);
  });
