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

const buildDemoSpec = (spec) => {
  const clone = JSON.parse(JSON.stringify(spec || {}));
  const allowedPaths = ['/voos/live'];
  const filteredPaths = Object.fromEntries(
    Object.entries(clone.paths || {}).filter(([path]) => allowedPaths.includes(path))
  );
  Object.values(filteredPaths).forEach((pathItem) => {
    if (!pathItem) return;
    Object.values(pathItem).forEach((op) => {
      if (op && typeof op === 'object' && op.security) delete op.security;
    });
  });
  return {
    ...clone,
    info: {
      ...clone.info,
      title: `${clone.info?.title || 'API'} (Demo)`,
      description: 'Endpoints exibidos apenas para demonstracao do dashboard.',
    },
    tags: (clone.tags || []).filter((t) => t?.name === 'Voos'),
    paths: filteredPaths,
    components: {
      ...(clone.components || {}),
      securitySchemes: undefined,
    },
  };
};

const apiSpec = isDemo ? buildDemoSpec(openApiSpec) : openApiSpec;

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
if (!isDemo) {
  app.use('/auth', authRoutes); // <-- novo
  app.use('/ia', iaRoutes);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API rodando na porta ${port}`);
});
