const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const voosRoutes = require('./routes/voos.routes');
const authRoutes = require('./routes/auth.routes'); // <-- novo
const iaRoutes = require('./routes/ia.routes');
const { openApiSpec } = require('./docs/openapi');

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
const apiSpec = isDemo
  ? {
      ...openApiSpec,
      info: {
        ...openApiSpec.info,
        title: `${openApiSpec.info?.title || 'API'} (Demo completa)`,
        description: 'Modo demonstracao com backend completo ativo. IA generativa/LLM fica desativada para estabilidade da apresentacao.',
      },
    }
  : openApiSpec;

app.get('/docs.json', (_req, res) => {
  res.json(apiSpec);
});

if (swaggerUi) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(apiSpec, { explorer: true }));
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API rodando na porta ${port}`);
});
