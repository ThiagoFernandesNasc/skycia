process.env.DOTENV_CONFIG_QUIET = 'true';
require('dotenv').config({ quiet: true });

const { gerarRespostaLLM } = require('../src/services/llm.service');

async function main() {
  const provider = process.env.LLM_PROVIDER;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  if (!provider || !['gemini', 'google'].includes(String(provider).toLowerCase())) {
    throw new Error('Configure LLM_PROVIDER=gemini no arquivo .env');
  }

  if (!hasKey) {
    throw new Error('Configure GEMINI_API_KEY no arquivo .env');
  }

  const result = await gerarRespostaLLM({
    pergunta: 'Responda em uma frase: o chat Gemini do SkyTrak esta conectado?',
    historico: [],
    modo: 'executivo',
    usuario: { nome: 'Demo' },
    voos: [
      {
        numero_voo: 'LA1234',
        companhia: 'LATAM',
        horario_previsto: new Date().toISOString(),
        status: 'PREVISTO',
        preco_medio: 500,
        origem_cidade: 'Sao Paulo',
        origem_estado: 'SP',
        destino_cidade: 'Rio de Janeiro',
        destino_estado: 'RJ',
      },
    ],
  });

  console.log(`Gemini conectado com sucesso (${result.model || model}).`);
  console.log(result.resposta);
}

main().catch((err) => {
  console.error(`Falha ao testar Gemini: ${err.message}`);
  process.exitCode = 1;
});
