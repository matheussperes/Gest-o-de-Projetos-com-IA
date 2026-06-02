/* ═══════════════════════════════════════════════════════════
   api/copiloto.js — Vercel Serverless Function
   Proxy seguro entre o frontend e a Anthropic API.
   A ANTHROPIC_API_KEY fica em variável de ambiente do Vercel,
   nunca exposta no browser.
   ═══════════════════════════════════════════════════════════ */

export default async function handler(req, res) {
  /* ─── CORS ─── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  /* ─── Validar API Key ─── */
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      erro: 'ANTHROPIC_API_KEY não configurada nas variáveis de ambiente do Vercel.',
    });
  }

  /* ─── Extrair payload ─── */
  const { projetos, contextoUsuario, dataHoje } = req.body || {};

  if (!projetos || !Array.isArray(projetos)) {
    return res.status(400).json({ erro: 'Payload inválido: projetos ausentes.' });
  }

  /* ─── Montar system prompt ─── */
  const systemPrompt = `Você é o Copiloto de Priorização de Matheus, um assistente especializado em ajudá-lo a focar no que realmente importa agora.

PERFIL DE MATHEUS:
- Empreendedor solo (solopreneur) em Campinas/SP
- Diagnóstico: TDAH combinado grave — memória de trabalho não confiável, precisa de direcionamento externo claro
- Negócios: Móveis planejados (projetos de clientes) + projetos digitais paralelos (SaaS, EcoSobra)
- Principal dor: paralisia de decisão, dificuldade de priorizar quando há múltiplas frentes abertas

SEU PAPEL:
- Analisar os projetos e tarefas de Matheus
- Identificar os 3 próximos passos mais importantes com base em: prazo, prioridade declarada, impacto no negócio e energia necessária
- Detectar conflitos de prazo (projetos com entrega nos próximos 7 dias com pendências críticas)
- Ser direto, prático e sem rodeios — Matheus precisa saber EXATAMENTE o que fazer, não uma análise filosófica

REGRAS DE PRIORIZAÇÃO:
1. Projetos urgentes com prazo próximo e compras/tarefas críticas abertas = prioridade máxima
2. Urgente > Importante > Pode esperar (mas prazos curtos sobrepõem prioridade declarada)
3. Se o contexto indicar pouca energia, sugira tarefas de menor carga cognitiva
4. Se o contexto indicar tempo limitado (ex: 1-2h), sugira tarefas rápidas e concretas
5. Nunca sugira tarefas vagas — seja específico sobre QUAL subtarefa ou ação dentro da tarefa

FORMATO DE RESPOSTA — responda SOMENTE com JSON válido, sem texto antes ou depois:
{
  "acoes": [
    {
      "titulo": "Nome claro da ação específica a fazer",
      "projeto": "Nome do projeto",
      "motivo": "Por que isso é a prioridade agora (1-2 frases diretas)",
      "tempo": "Estimativa de tempo (ex: 30 min, 2 horas)"
    }
  ],
  "conflitos": [
    {
      "projeto": "Nome do projeto",
      "descricao": "O que está crítico e em quanto tempo (ex: entrega em 3 dias, 2 compras pendentes)"
    }
  ],
  "observacao": "Uma observação opcional curta (máx 1 frase) se houver algo importante além das 3 ações"
}

REGRAS DO JSON:
- "acoes" deve ter exatamente 3 itens, ordenados do mais ao menos urgente
- "conflitos" pode ser array vazio [] se não houver conflitos
- "observacao" pode ser string vazia "" ou null se não houver observação relevante
- Todos os textos em português brasileiro
- Seja direto e específico — sem floreios, sem introduções, sem markdown dentro do JSON`;

  /* ─── Montar user message ─── */
  const contextoProjetos = JSON.stringify(projetos, null, 2);
  const contextoExtra = contextoUsuario
    ? `\n\nCONTEXTO ADICIONAL DE MATHEUS: "${contextoUsuario}"`
    : '';

  const userMessage = `Data de hoje: ${dataHoje}

PROJETOS E TAREFAS ATUAIS:
${contextoProjetos}${contextoExtra}

Analise e me diga: quais são as 3 ações mais importantes que devo fazer agora?`;

  /* ─── Chamar Anthropic API ─── */
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(502).json({
        erro: `Erro na API do Claude (${response.status}). Verifique a API key e tente novamente.`,
      });
    }

    const anthropicData = await response.json();

    /* ─── Extrair texto da resposta ─── */
    const textoResposta = anthropicData?.content
      ?.filter(block => block.type === 'text')
      ?.map(block => block.text)
      ?.join('') || '';

    if (!textoResposta) {
      return res.status(502).json({ erro: 'Resposta vazia do Claude. Tente novamente.' });
    }

    /* ─── Parse JSON ─── */
    let parsedData;
    try {
      // Remove possíveis backticks de markdown que o modelo pode incluir
      const cleaned = textoResposta
        .replace(/```json\n?/gi, '')
        .replace(/```\n?/gi, '')
        .trim();
      parsedData = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, '\nResposta:', textoResposta);
      return res.status(502).json({
        erro: 'Não foi possível interpretar a resposta do Claude. Tente novamente.',
      });
    }

    /* ─── Validar estrutura mínima ─── */
    if (!parsedData.acoes || !Array.isArray(parsedData.acoes)) {
      return res.status(502).json({ erro: 'Estrutura de resposta inválida. Tente novamente.' });
    }

    /* ─── Retornar ao frontend ─── */
    return res.status(200).json({
      acoes:      parsedData.acoes      || [],
      conflitos:  parsedData.conflitos  || [],
      observacao: parsedData.observacao || null,
    });

  } catch (err) {
    console.error('Copiloto handler error:', err);
    return res.status(500).json({
      erro: 'Erro interno ao processar a requisição. Tente novamente.',
    });
  }
}
