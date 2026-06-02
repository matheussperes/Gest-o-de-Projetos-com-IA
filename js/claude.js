/* ═══════════════════════════════════════════════════════════
   claude.js — Integração do Copiloto IA no frontend
   Chama a Vercel Function /api/copiloto como proxy seguro.
   A ANTHROPIC_API_KEY nunca fica exposta no frontend.
   ═══════════════════════════════════════════════════════════ */

/* ─── Estado do Copiloto ─── */
const copiloState = {
  carregando: false,
  ultimaResposta: null,
};

/* ═══════════════════════════════════════
   FUNÇÃO PRINCIPAL — Acionar Copiloto
═══════════════════════════════════════ */

async function acionarCopiloto() {
  if (copiloState.carregando) return;

  const btn       = document.getElementById('btnAskCopiloto');
  const resultado = document.getElementById('copiloResult');
  const vazio     = document.getElementById('copiloEmpty');
  const contexto  = document.getElementById('copiloContexto')?.value?.trim() || '';

  /* ─── Loading state ─── */
  copiloState.carregando = true;
  btn.disabled = true;
  btn.innerHTML = `
    <span style="display:flex;align-items:center;gap:8px">
      <span class="spinner spinner-sm spinner-white"></span>
      Analisando projetos...
    </span>`;

  vazio.style.display     = 'none';
  resultado.style.display = 'none';
  resultado.innerHTML     = renderizarSkeletonCopiloto();
  resultado.style.display = 'block';

  try {
    /* ─── Coletar contexto completo do Supabase ─── */
    const projetos = await getContextoCompleto();

    if (!projetos || projetos.length === 0) {
      renderizarErroCopiloto('Nenhum projeto encontrado. Crie ao menos um projeto com tarefas para usar o copiloto.');
      return;
    }

    /* ─── Montar payload ─── */
    const payload = {
      projetos: formatarContextoParaClaude(projetos),
      contextoUsuario: contexto,
      dataHoje: new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }),
    };

    /* ─── Chamar Vercel Function ─── */
    const response = await fetch('/api/copiloto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.erro || `Erro ${response.status} na API`);
    }

    const data = await response.json();

    if (!data.acoes || !Array.isArray(data.acoes)) {
      throw new Error('Resposta inválida do copiloto. Tente novamente.');
    }

    /* ─── Renderizar resultado ─── */
    copiloState.ultimaResposta = data;
    renderizarRespostaCopiloto(data);

  } catch (err) {
    renderizarErroCopiloto(err.message || 'Não foi possível conectar ao copiloto. Verifique sua conexão.');
  } finally {
    /* ─── Restaurar botão ─── */
    copiloState.carregando = false;
    btn.disabled = false;
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
      O que faço agora?`;
  }
}

/* ═══════════════════════════════════════
   FORMATADORES — Contexto para Claude
═══════════════════════════════════════ */

function formatarContextoParaClaude(projetos) {
  return projetos.map(p => {
    const tarefasPendentes = (p.tarefas || []).filter(t => t.status !== 'concluida');
    const tarefasConcluidas = (p.tarefas || []).filter(t => t.status === 'concluida');
    const comprasPendentes = (p.compras_extras || []).filter(c => c.status !== 'comprado');
    const totalSubtarefas = (p.tarefas || []).reduce((acc, t) => acc + (t.subtarefas || []).length, 0);
    const subtarefasConcluidas = (p.tarefas || []).reduce((acc, t) =>
      acc + (t.subtarefas || []).filter(s => s.concluida).length, 0);

    return {
      id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      prioridade: p.prioridade,
      status: p.status,
      prazo: p.data_fim || null,
      diasParaPrazo: p.data_fim
        ? Math.ceil((new Date(p.data_fim) - new Date()) / (1000 * 60 * 60 * 24))
        : null,
      progresso: totalSubtarefas > 0
        ? Math.round((subtarefasConcluidas / totalSubtarefas) * 100)
        : 0,
      tarefasPendentes: tarefasPendentes.map(t => ({
        titulo: t.titulo,
        prioridade: t.prioridade,
        status: t.status,
        duracao_estimada: t.duracao_estimada || null,
        data_limite: t.data_limite || null,
        subtarefasTotal: (t.subtarefas || []).length,
        subtarefasConcluidas: (t.subtarefas || []).filter(s => s.concluida).length,
      })),
      tarefasConcluidas: tarefasConcluidas.length,
      comprasPendentes: comprasPendentes.map(c => c.descricao || c.item || 'Item sem nome'),
    };
  });
}

/* ═══════════════════════════════════════
   RENDERIZADORES
═══════════════════════════════════════ */

function renderizarRespostaCopiloto(data) {
  const resultado = document.getElementById('copiloResult');
  const vazio     = document.getElementById('copiloEmpty');

  vazio.style.display = 'none';

  /* ─── Alertas de conflito ─── */
  let htmlAlertas = '';
  if (data.conflitos && data.conflitos.length > 0) {
    const conflitosHtml = data.conflitos.map(c => `
      <div class="copiloto-conflito-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--warning)"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
        <span><strong>${escHTMLCopiloto(c.projeto)}</strong> — ${escHTMLCopiloto(c.descricao)}</span>
      </div>`).join('');

    htmlAlertas = `
      <div class="copiloto-alerta-box">
        <div class="copiloto-alerta-titulo">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
          Alertas de prazo
        </div>
        ${conflitosHtml}
      </div>`;
  }

  /* ─── Ações ranqueadas ─── */
  const acoesPriori = ['🥇', '🥈', '🥉'];
  const htmlAcoes = (data.acoes || []).slice(0, 3).map((acao, i) => `
    <div class="copiloto-acao-card" style="animation-delay:${i * 80}ms">
      <div class="copiloto-acao-num">${i + 1}</div>
      <div class="copiloto-acao-body">
        ${acao.projeto ? `<div class="copiloto-acao-projeto">${escHTMLCopiloto(acao.projeto)}</div>` : ''}
        <div class="copiloto-acao-titulo">${escHTMLCopiloto(acao.titulo)}</div>
        <div class="copiloto-acao-motivo">${escHTMLCopiloto(acao.motivo)}</div>
        ${acao.tempo ? `<div class="copiloto-acao-tempo">⏱ ${escHTMLCopiloto(acao.tempo)}</div>` : ''}
      </div>
    </div>`).join('');

  /* ─── Observação final ─── */
  const htmlObs = data.observacao ? `
    <div class="copiloto-obs">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      ${escHTMLCopiloto(data.observacao)}
    </div>` : '';

  resultado.style.display = 'block';
  resultado.innerHTML = `
    <div class="copiloto-resultado fade-in">
      <div class="copiloto-resultado-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary)"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
        <span>Análise concluída · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      ${htmlAlertas}
      <div class="copiloto-acoes-lista stagger-children">
        ${htmlAcoes}
      </div>
      ${htmlObs}
    </div>`;
}

function renderizarSkeletonCopiloto() {
  return `
    <div style="padding:8px 0">
      <div class="skeleton" style="height:18px;width:60%;margin-bottom:20px"></div>
      ${[1,2,3].map(() => `
        <div style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start">
          <div class="skeleton" style="width:26px;height:26px;border-radius:50%;flex-shrink:0"></div>
          <div style="flex:1">
            <div class="skeleton" style="height:11px;width:40%;margin-bottom:6px"></div>
            <div class="skeleton" style="height:14px;width:85%;margin-bottom:5px"></div>
            <div class="skeleton" style="height:11px;width:70%"></div>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderizarErroCopiloto(mensagem) {
  const resultado = document.getElementById('copiloResult');
  const vazio     = document.getElementById('copiloEmpty');

  vazio.style.display = 'none';
  resultado.style.display = 'block';
  resultado.innerHTML = `
    <div style="text-align:center;padding:32px 16px">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--danger-light);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
      </div>
      <p style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px">Não foi possível consultar o copiloto</p>
      <p style="font-size:12px;color:var(--text-tertiary);line-height:1.6;max-width:240px;margin:0 auto">${escHTMLCopiloto(mensagem)}</p>
    </div>`;
}

/* ═══════════════════════════════════════
   HELPER LOCAL
═══════════════════════════════════════ */

function escHTMLCopiloto(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
