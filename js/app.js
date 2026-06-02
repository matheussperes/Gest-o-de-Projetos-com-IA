/* ═══════════════════════════════════════════════════════════
   app.js — Lógica principal do Painel de Operação Pessoal
   ═══════════════════════════════════════════════════════════ */

/* ─── Estado Global ─── */
const state = {
  projetos: [],
  projetoAtual: null,
  tarefaAtualId: null,
  filtroAtual: 'todos',
  editandoProjetoId: null,
  editandoTarefaId: null,
};

/* ═══════════════════════════════════════
   INICIALIZAÇÃO
═══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  setarDataEsaudacao();
  await carregarTudo();
});

async function carregarTudo() {
  try {
    state.projetos = await getProjetos();
    renderizarKPIs();
    renderizarHoje();
    renderizarProjetos();
  } catch (e) {
    mostrarToast('Erro ao conectar com o banco de dados. Verifique as credenciais.', 'error');
  }
}

function setarDataEsaudacao() {
  const agora = new Date();
  const hora = agora.getHours();
  const greeting = hora < 12 ? 'Bom dia! 👋' : hora < 18 ? 'Boa tarde! 👋' : 'Boa noite! 👋';
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dataStr = agora.toLocaleDateString('pt-BR', opts);
  const el = document.getElementById('hojeGreeting');
  const elD = document.getElementById('hojeDate');
  if (el) el.textContent = greeting;
  if (elD) elD.textContent = dataStr.charAt(0).toUpperCase() + dataStr.slice(1);
}

/* ═══════════════════════════════════════
   NAVEGAÇÃO
═══════════════════════════════════════ */

function navegarPara(view, btn) {
  // Esconde todas as views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');

  // Atualiza nav sidebar
  document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Atualiza bottom nav também
  document.querySelectorAll(`.bottom-nav-item[data-view="${view}"]`).forEach(b => b.classList.add('active'));
  document.querySelectorAll(`.nav-item[data-view="${view}"]`).forEach(b => b.classList.add('active'));

  // Header
  const titulos = { hoje: 'Hoje', projetos: 'Projetos' };
  const subtitulos = { hoje: 'Suas próximas ações', projetos: 'Todos os seus projetos' };
  document.getElementById('headerTitle').textContent = titulos[view] || '';
  document.getElementById('headerSubtitle').textContent = subtitulos[view] || '';

  fecharSidebar();
}

function abrirProjetoDetalhe(projeto) {
  state.projetoAtual = projeto;

  // Esconde outras views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-projeto-detalhe').classList.add('active');

  // Header
  document.getElementById('headerTitle').textContent = projeto.nome;
  document.getElementById('headerSubtitle').textContent = projeto.cliente ? `Cliente: ${projeto.cliente}` : '';

  // Renderiza header do projeto
  renderizarProjetoDetalheHeader(projeto);

  // Reseta tabs
  mostrarProjetoTab('tarefas', document.querySelector('.projeto-tab-btn'));

  // Carrega dados
  carregarTarefasDoProjeto(projeto.id);
  carregarComprasDoProjeto(projeto.id);
}

function voltarParaProjetos() {
  state.projetoAtual = null;
  navegarPara('projetos', document.querySelector('.nav-item[data-view="projetos"]'));
}

function mostrarProjetoTab(tab, btn) {
  document.querySelectorAll('.projeto-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.projeto-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  if (btn) btn.classList.add('active');
}

/* ═══════════════════════════════════════
   HOJE — PRÓXIMAS AÇÕES
═══════════════════════════════════════ */

function renderizarKPIs() {
  const projAtivos = state.projetos.filter(p => p.status === 'ativo').length;
  const tarefasPend = state.projetos.reduce((acc, p) => {
    const t = (p.tarefas || []).filter(t => t.status !== 'concluida');
    return acc + t.length;
  }, 0);
  const urgentes = state.projetos.reduce((acc, p) => {
    if (p.prioridade === 'urgente' && p.status === 'ativo') return acc + 1;
    return acc;
  }, 0);
  const comprasPend = state.projetos.reduce((acc, p) => {
    const c = (p.compras_extras || []).filter(c => c.status !== 'comprado');
    return acc + c.length;
  }, 0);

  document.getElementById('kpiProjetos').textContent = projAtivos;
  document.getElementById('kpiTarefas').textContent = tarefasPend;
  document.getElementById('kpiUrgentes').textContent = urgentes;
  document.getElementById('kpiCompras').textContent = comprasPend;

  // Badge sidebar
  const badge = document.getElementById('badgeProjetos');
  if (projAtivos > 0) { badge.textContent = projAtivos; badge.style.display = ''; }
  else badge.style.display = 'none';

  // Tornar cards clicáveis
  const kpiGrid = document.getElementById('hojeKpis');
  if (kpiGrid) {
    const cards = kpiGrid.querySelectorAll('.kpi-card');
    if (cards[0]) { cards[0].style.cursor = 'pointer'; cards[0].onclick = () => abrirModalKPI('projetos'); }
    if (cards[1]) { cards[1].style.cursor = 'pointer'; cards[1].onclick = () => abrirModalKPI('tarefas'); }
    if (cards[2]) { cards[2].style.cursor = 'pointer'; cards[2].onclick = () => abrirModalKPI('urgentes'); }
    if (cards[3]) { cards[3].style.cursor = 'pointer'; cards[3].onclick = () => abrirModalKPI('compras'); }
  }
}

function abrirModalKPI(tipo) {
  let titulo = '';
  let itens = [];

  if (tipo === 'projetos') {
    titulo = 'Projetos Ativos';
    const projs = state.projetos.filter(p => p.status === 'ativo');
    itens = projs.map(p => ({
      titulo: p.nome,
      sub: `${labelPrioridade(p.prioridade)} · ${(p.tarefas||[]).filter(t=>t.status!=='concluida').length} tarefa(s) pendente(s)`,
      badge: p.prioridade,
      onclick: `fecharModal('modalKPI'); irParaProjeto('${p.id}')`,
    }));
  } else if (tipo === 'tarefas') {
    titulo = 'Tarefas Pendentes';
    state.projetos.forEach(p => {
      if (p.status !== 'ativo') return;
      (p.tarefas || []).filter(t => t.status !== 'concluida').forEach(t => {
        itens.push({
          titulo: t.titulo,
          sub: p.nome,
          badge: t.prioridade,
          onclick: `fecharModal('modalKPI'); irParaTarefa('${p.id}','${t.id}')`,
        });
      });
    });
    itens.sort((a, b) => {
      const m = { urgente: 3, importante: 2, espera: 1 };
      return (m[b.badge]||1) - (m[a.badge]||1);
    });
  } else if (tipo === 'urgentes') {
    titulo = 'Projetos Urgentes';
    const projs = state.projetos.filter(p => p.prioridade === 'urgente' && p.status === 'ativo');
    itens = projs.map(p => ({
      titulo: p.nome,
      sub: p.data_fim ? `Prazo: ${formatarData(p.data_fim)}` : 'Sem prazo definido',
      badge: 'urgente',
      onclick: `fecharModal('modalKPI'); irParaProjeto('${p.id}')`,
    }));
  } else if (tipo === 'compras') {
    titulo = 'Compras Pendentes';
    state.projetos.forEach(p => {
      (p.compras_extras || []).filter(c => c.status !== 'comprado').forEach(c => {
        itens.push({
          titulo: c.descricao || 'Item sem nome',
          sub: `Projeto: ${p.nome}`,
          badge: null,
          onclick: `fecharModal('modalKPI'); irParaProjeto('${p.id}')`,
        });
      });
    });
  }

  const prioClass = { urgente: 'badge-urgente', importante: 'badge-importante', espera: 'badge-espera' };
  const conteudo = itens.length === 0
    ? `<p style="font-size:var(--text-sm);color:var(--text-tertiary);text-align:center;padding:24px 0">Nenhum item no momento.</p>`
    : itens.map(item => `
      <div class="kpi-modal-item" onclick="${item.onclick}" style="cursor:pointer;padding:12px;border-radius:var(--radius-md);display:flex;align-items:center;gap:10px;border:1px solid var(--border);margin-bottom:8px;transition:background var(--transition)">
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHTML(item.titulo)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${escHTML(item.sub)}</div>
        </div>
        ${item.badge ? `<span class="badge ${prioClass[item.badge]||'badge-gray'}">${labelPrioridade(item.badge)}</span>` : ''}
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>`).join('');

  document.getElementById('modalKPITitulo').textContent = `${titulo} (${itens.length})`;
  document.getElementById('modalKPIConteudo').innerHTML = conteudo;
  abrirModal('modalKPI');
}

function irParaProjeto(projetoId) {
  const projeto = state.projetos.find(p => p.id === projetoId);
  if (!projeto) return;
  navegarPara('projetos', document.querySelector('.nav-item[data-view="projetos"]'));
  setTimeout(() => abrirProjetoDetalhe(projeto), 50);
}

function renderizarHoje() {
  const loading = document.getElementById('hojeLoading');
  const lista = document.getElementById('hojeLista');
  const vazio = document.getElementById('hojeVazio');
  const count = document.getElementById('hojeCount');
  const alertas = document.getElementById('hojeAlertas');

  loading.style.display = 'none';

  // Detectar conflitos de prazo
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const em7dias = new Date(hoje);
  em7dias.setDate(hoje.getDate() + 7);

  let alertasHtml = '';
  state.projetos.forEach(p => {
    if (!p.data_fim || p.status !== 'ativo') return;
    const prazo = new Date(p.data_fim);
    prazo.setHours(0, 0, 0, 0);
    if (prazo <= em7dias) {
      const comprasPend = (p.compras_extras || []).filter(c => c.status !== 'comprado');
      const tarefasPend = (p.tarefas || []).filter(t => t.status !== 'concluida');
      const diasRestantes = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));
      const isAtrasado = diasRestantes < 0;
      const classeAlerta = isAtrasado ? 'conflict-alert' : 'conflict-alert warning-alert';
      let problemas = [];
      if (comprasPend.length > 0) problemas.push(`${comprasPend.length} compra(s) pendente(s)`);
      if (tarefasPend.length > 0) problemas.push(`${tarefasPend.length} tarefa(s) em aberto`);
      if (problemas.length > 0) {
        const label = isAtrasado ? '🔴 Prazo vencido' : '⚠️ Prazo próximo';
        alertasHtml += `
          <div class="${classeAlerta}" style="cursor:pointer" onclick="abrirProjetoDetalhe(state.projetos.find(p => p.id === '${p.id}'))">
            <div class="conflict-alert-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg></div>
            <div>
              <div class="conflict-alert-title">${label}: ${p.nome}</div>
              <div class="conflict-alert-desc">${isAtrasado ? 'Venceu há ' + Math.abs(diasRestantes) + ' dia(s)' : 'Vence em ' + diasRestantes + ' dia(s)'} · ${problemas.join(' · ')} · Clique para ver o projeto</div>
            </div>
          </div>`;
      }
    }
  });
  alertas.innerHTML = alertasHtml;

  // Coletar tarefas para "hoje"
  // Score: urgente=3 * projPrioridade + prazo invertido
  const prioMap = { urgente: 3, importante: 2, espera: 1 };
  let todasTarefas = [];

  state.projetos.forEach(p => {
    if (p.status !== 'ativo') return;
    const tarefas = p.tarefas || [];
    tarefas.forEach(t => {
      if (t.status === 'concluida') return;
      const score = (prioMap[p.prioridade] || 1) * 10 + (prioMap[t.prioridade] || 1);
      todasTarefas.push({ ...t, projetoNome: p.nome, projetoId: p.id, score });
    });
  });

  // Ordena por score decrescente
  todasTarefas.sort((a, b) => b.score - a.score);
  const top = todasTarefas.slice(0, 7);

  count.textContent = top.length;

  if (top.length === 0) {
    lista.innerHTML = '';
    vazio.style.display = '';
    return;
  }

  vazio.style.display = 'none';

  lista.innerHTML = top.map(t => `
    <div class="hoje-card" onclick="irParaTarefa('${t.projetoId}', '${t.id}')">
      <div class="hoje-card-priority priority-${t.prioridade || 'importante'}"></div>
      <div class="hoje-card-content">
        <div class="hoje-card-tarefa">${escHTML(t.titulo)}</div>
        <div class="hoje-card-projeto">${escHTML(t.projetoNome)}</div>
        <div class="hoje-card-meta">
          <span class="badge badge-${t.prioridade || 'importante'}">${labelPrioridade(t.prioridade)}</span>
          <span class="badge badge-gray">${labelStatus(t.status)}</span>
        </div>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </div>
  `).join('');
}

function irParaTarefa(projetoId, tarefaId) {
  const projeto = state.projetos.find(p => p.id === projetoId);
  if (!projeto) return;
  state.tarefaAtualId = tarefaId;
  abrirProjetoDetalhe(projeto);
}

/* ═══════════════════════════════════════
   PROJETOS — LISTA
═══════════════════════════════════════ */

function renderizarProjetos(filtro = state.filtroAtual) {
  const loading = document.getElementById('projetosLoading');
  const grid = document.getElementById('projetosGrid');
  const vazio = document.getElementById('projetosVazio');

  loading.style.display = 'none';

  let lista = state.projetos;
  if (filtro === 'pausado') {
    lista = state.projetos.filter(p => p.status === 'pausado');
  } else if (filtro === 'arquivado') {
    lista = state.projetosArquivados || [];
  } else if (filtro !== 'todos') {
    lista = state.projetos.filter(p => p.tipo === filtro);
  }

  if (lista.length === 0) {
    grid.innerHTML = '';
    vazio.style.display = '';
    return;
  }

  vazio.style.display = 'none';
  grid.innerHTML = lista.map(p => renderizarProjetoCard(p)).join('');
}

function renderizarProjetoCard(p) {
  const tarefas = p.tarefas || [];
  const total = tarefas.length;
  const concluidas = tarefas.filter(t => t.status === 'concluida').length;
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
  const comprasPend = (p.compras_extras || []).filter(c => c.status !== 'comprado').length;

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prazo = p.data_fim ? new Date(p.data_fim) : null;
  const diasRestantes = prazo ? Math.ceil((prazo - hoje) / (1000*60*60*24)) : null;
  const prazoUrgente = diasRestantes !== null && diasRestantes <= 7;

  const tipoIcone = {
    planejado: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    saas: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="8" x="5" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/></svg>`,
    pessoal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  };

  // Tenta inferir tipo pelo conteúdo
  const nomeL = (p.nome || '').toLowerCase();
  let tipo = 'outro';
  if (nomeL.includes('planejado') || nomeL.includes('móvel') || nomeL.includes('movel') || p.cliente) tipo = 'planejado';
  else if (nomeL.includes('saas') || nomeL.includes('app') || nomeL.includes('sistema')) tipo = 'saas';
  else if (nomeL.includes('pessoal') || nomeL.includes('casamento') || nomeL.includes('mudança')) tipo = 'pessoal';

  const corProgressBar = pct >= 80 ? '' : pct >= 40 ? 'amber' : 'red';
  const prioClass = { urgente: 'badge-urgente', importante: 'badge-importante', espera: 'badge-espera' };

  return `
  <div class="projeto-card" onclick="abrirProjetoDetalhe(state.projetos.find(p => p.id === '${p.id}'))">
    <div class="projeto-card-header">
      <div class="projeto-card-icon projeto-icon-${tipo}">${tipoIcone[tipo] || tipoIcone.saas}</div>
      <div class="projeto-card-info">
        <div class="projeto-card-name">${escHTML(p.nome)}</div>
        <div class="projeto-card-meta">
          <span class="badge ${prioClass[p.prioridade] || 'badge-gray'}">${labelPrioridade(p.prioridade)}</span>
          <span class="badge badge-${p.status}">${labelStatus(p.status)}</span>
          ${comprasPend > 0 ? `<span class="alert-dot" title="${comprasPend} compra(s) pendente(s)"></span>` : ''}
        </div>
      </div>
      <div class="projeto-card-actions">
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();abrirModalEditarProjeto('${p.id}')" title="Editar">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        ${p.status === 'arquivado' ? `
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();restaurarProjeto('${p.id}','${escAttr(p.nome)}')" title="Restaurar">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();confirmarExcluirProjeto('${p.id}','${escAttr(p.nome)}')" title="Excluir permanentemente">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--red-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>` : `
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();confirmarArquivar('${p.id}', '${escAttr(p.nome)}')" title="Arquivar">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>
        </button>
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();confirmarExcluirProjeto('${p.id}','${escAttr(p.nome)}')" title="Excluir permanentemente">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--red-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>`}
      </div>
    </div>
    <div class="projeto-card-body">
      ${prazo ? `
      <div class="projeto-card-prazo ${prazoUrgente ? 'urgente' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        ${prazoUrgente && diasRestantes < 0 ? 'Venceu' : prazoUrgente ? `${diasRestantes}d restantes` : formatarData(p.data_fim)}
        ${p.cliente ? ` · ${escHTML(p.cliente)}` : ''}
      </div>` : p.cliente ? `<div class="projeto-card-prazo"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${escHTML(p.cliente)}</div>` : ''}
      <div class="progress-meta">
        <span class="progress-meta-label">${concluidas}/${total} tarefas</span>
        <span class="progress-meta-value">${pct}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${corProgressBar}" style="width:${pct}%"></div>
      </div>
    </div>
  </div>`;
}

function filtrarProjetos(filtro, btn) {
  state.filtroAtual = filtro;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderizarProjetos(filtro);
}

/* ═══════════════════════════════════════
   PROJETO DETALHE
═══════════════════════════════════════ */

function renderizarProjetoDetalheHeader(p) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prazo = p.data_fim ? new Date(p.data_fim) : null;
  const diasRestantes = prazo ? Math.ceil((prazo - hoje) / (1000*60*60*24)) : null;

  const nomeL = (p.nome || '').toLowerCase();
  let tipo = 'outro';
  if (nomeL.includes('planejado') || nomeL.includes('móvel') || nomeL.includes('movel') || p.cliente) tipo = 'planejado';
  else if (nomeL.includes('saas') || nomeL.includes('app')) tipo = 'saas';
  else if (nomeL.includes('pessoal') || nomeL.includes('casamento')) tipo = 'pessoal';

  const icones = {
    planejado: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    saas: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="8" x="5" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/></svg>`,
    pessoal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    outro: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  };

  document.getElementById('projetoDetailHeader').innerHTML = `
    <div class="projeto-detail-icon projeto-icon-${tipo}">${icones[tipo]}</div>
    <div class="projeto-detail-info">
      <div class="projeto-detail-name">${escHTML(p.nome)}</div>
      <div class="projeto-detail-meta">
        <span class="badge badge-${p.prioridade || 'espera'}">${labelPrioridade(p.prioridade)}</span>
        <span class="badge badge-${p.status}">${labelStatus(p.status)}</span>
        ${p.cliente ? `<span class="badge badge-gray">👤 ${escHTML(p.cliente)}</span>` : ''}
        ${prazo ? `<span class="badge ${diasRestantes !== null && diasRestantes <= 7 ? 'badge-red' : 'badge-gray'}">📅 ${formatarData(p.data_fim)}</span>` : ''}
        ${p.valor ? `<span class="badge badge-green">R$ ${Number(p.valor).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>` : ''}
      </div>
      ${p.descricao ? `<div class="projeto-detail-desc">${escHTML(p.descricao)}</div>` : ''}
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0">
      <button class="btn btn-secondary btn-sm" onclick="abrirModalEditarProjeto('${p.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        Editar
      </button>
    </div>`;
}

/* ═══════════════════════════════════════
   TAREFAS
═══════════════════════════════════════ */

async function carregarTarefasDoProjeto(projetoId) {
  const loading = document.getElementById('tarefasLoading');
  const lista = document.getElementById('tarefasList');
  const vazio = document.getElementById('tarefasVazio');

  loading.style.display = '';
  lista.innerHTML = '';
  vazio.style.display = 'none';

  try {
    const tarefas = await getTarefasPorProjeto(projetoId);
    loading.style.display = 'none';

    const titulo = document.getElementById('tarefasTitulo');
    titulo.textContent = `Tarefas (${tarefas.length})`;

    if (tarefas.length === 0) {
      vazio.style.display = '';
      return;
    }

    lista.innerHTML = tarefas.map(t => renderizarTarefaItem(t)).join('');

    // Se veio de "hoje", abre a tarefa específica automaticamente
    if (state.tarefaAtualId) {
      const el = document.getElementById('tarefa-' + state.tarefaAtualId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const header = el.querySelector('.tarefa-header');
        if (header) header.click();
      }
      state.tarefaAtualId = null;
    }
  } catch(e) {
    loading.style.display = 'none';
    mostrarToast('Erro ao carregar tarefas', 'error');
  }
}

function renderizarTarefaItem(t) {
  const subtarefas = t.subtarefas || [];
  const total = subtarefas.length;
  const concluidas = subtarefas.filter(s => s.concluida).length;
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
  const isDone = t.status === 'concluida';

  return `
  <div class="tarefa-item" id="tarefa-${t.id}">
    <div class="tarefa-header" onclick="toggleTarefaExpand('${t.id}')">
      <div class="tarefa-chevron" id="chevron-${t.id}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div class="tarefa-nome${isDone ? ' done' : ''}">${escHTML(t.titulo)}</div>
        ${total > 0 ? `<div style="display:flex;align-items:center;gap:8px;margin-top:6px">
          <div class="progress-bar" style="flex:1;max-width:120px"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary)">${concluidas}/${total}</span>
        </div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span class="badge badge-${t.prioridade || 'importante'}" style="cursor:pointer" title="Clique para mudar prioridade" onclick="event.stopPropagation();ciclaPrioridade('${t.id}','${t.prioridade || 'importante'}')">${labelPrioridade(t.prioridade)}</span>
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();abrirModalEditarTarefa('${t.id}')" title="Editar tarefa">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();concluirOuReabrirTarefa('${t.id}','${t.status}')" title="${isDone ? 'Reabrir' : 'Concluir'}">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${isDone ? 'var(--green-500)' : 'var(--text-tertiary)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </button>
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();abrirModalSubtarefa('${t.id}')" title="Adicionar subtarefa">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </button>
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();confirmarExcluirTarefa('${t.id}')" title="Excluir">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
    <div class="tarefa-body" id="body-${t.id}">
      ${t.descricao ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:12px;line-height:1.6">${escHTML(t.descricao)}</p>` : ''}
      <div class="subtarefa-list" id="subtarefas-${t.id}">
        ${subtarefas.map(s => renderizarSubtarefaItem(s, t.id)).join('')}
      </div>
      ${subtarefas.length === 0 ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);padding:8px 0">Nenhuma subtarefa. Clique em + para adicionar o passo a passo.</p>` : ''}
    </div>
  </div>`;
}

function renderizarSubtarefaItem(s, tarefaId) {
  return `
  <div class="subtarefa-item" id="subtarefa-${s.id}" onclick="toggleSubtarefaUI('${s.id}', ${s.concluida}, '${tarefaId}')">
    <div class="checkbox${s.concluida ? ' checked' : ''}">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <span class="checkbox-label${s.concluida ? ' done' : ''}">${escHTML(s.titulo)}</span>
    <button class="btn btn-icon btn-ghost btn-sm" onclick="event.stopPropagation();confirmarExcluirSubtarefa('${s.id}','${tarefaId}')" style="opacity:0.5;margin-left:auto" title="Remover">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
  </div>`;
}

function toggleTarefaExpand(id) {
  const body = document.getElementById('body-' + id);
  const chevron = document.getElementById('chevron-' + id);
  if (body) body.classList.toggle('open');
  if (chevron) chevron.classList.toggle('open');
}

async function toggleSubtarefaUI(subtarefaId, concluida, tarefaId) {
  const el = document.getElementById('subtarefa-' + subtarefaId);
  if (!el) return;
  const novaConcluida = !concluida;
  const check = el.querySelector('.checkbox');
  const label = el.querySelector('.checkbox-label');
  if (check) novaConcluida ? check.classList.add('checked') : check.classList.remove('checked');
  if (label) novaConcluida ? label.classList.add('done') : label.classList.remove('done');
  el.onclick = () => toggleSubtarefaUI(subtarefaId, novaConcluida, tarefaId);

  try {
    await toggleSubtarefa(subtarefaId, novaConcluida);
    atualizarProgressoDaTarefa(tarefaId);
  } catch(e) {
    // Reverter UI
    if (check) concluida ? check.classList.add('checked') : check.classList.remove('checked');
    if (label) concluida ? label.classList.add('done') : label.classList.remove('done');
    mostrarToast('Erro ao atualizar subtarefa', 'error');
  }
}

function atualizarProgressoDaTarefa(tarefaId) {
  const body = document.getElementById('body-' + tarefaId);
  if (!body) return;
  const checks = body.querySelectorAll('.checkbox');
  const total = checks.length;
  const done = body.querySelectorAll('.checkbox.checked').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const tarefa = document.getElementById('tarefa-' + tarefaId);
  if (!tarefa) return;
  const bar = tarefa.querySelector('.progress-fill');
  const count = tarefa.querySelector('.tarefa-header span[style*="text-tertiary"]');
  if (bar) bar.style.width = pct + '%';

  // Atualiza KPIs
  carregarTudo();
}

async function concluirOuReabrirTarefa(tarefaId, statusAtual) {
  const novoStatus = statusAtual === 'concluida' ? 'pendente' : 'concluida';
  try {
    await atualizarTarefa(tarefaId, { status: novoStatus });
    mostrarToast(novoStatus === 'concluida' ? 'Tarefa concluída! ✓' : 'Tarefa reaberta', 'success');
    await carregarTudo();
    if (state.projetoAtual) carregarTarefasDoProjeto(state.projetoAtual.id);
  } catch(e) {
    mostrarToast('Erro ao atualizar tarefa', 'error');
  }
}

/* ═══════════════════════════════════════
   COMPRAS EXTRAS
═══════════════════════════════════════ */

async function carregarComprasDoProjeto(projetoId) {
  const loading = document.getElementById('comprasLoading');
  const lista = document.getElementById('comprasList');
  const vazio = document.getElementById('comprasVazio');
  const badge = document.getElementById('comprasPendenteBadge');

  loading.style.display = '';
  lista.innerHTML = '';

  try {
    const compras = await getComprasPorProjeto(projetoId);
    loading.style.display = 'none';

    const pendentes = compras.filter(c => c.status !== 'comprado').length;
    if (badge) { badge.style.display = pendentes > 0 ? '' : 'none'; }

    if (compras.length === 0) { vazio.style.display = ''; return; }
    vazio.style.display = 'none';

    lista.innerHTML = compras.map(c => `
      <div class="compra-item" id="compra-${c.id}">
        <div class="checkbox${c.status === 'comprado' ? ' checked' : ''}" onclick="toggleCompraUI('${c.id}','${c.status}','${projetoId}')">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style="flex:1;min-width:0;cursor:pointer" onclick="abrirModalEditarCompra('${c.id}','${projetoId}')">
          <div class="compra-nome${c.status === 'comprado' ? ' done' : ''}">${escHTML(c.descricao || c.fornecedor || 'Item')}</div>
          ${c.fornecedor ? `<div style="font-size:var(--text-xs);color:var(--text-tertiary)">${escHTML(c.fornecedor)}</div>` : ''}
        </div>
        ${c.valor ? `<span style="font-size:var(--text-xs);font-weight:500;color:var(--green-600);white-space:nowrap">R$ ${Number(c.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>` : ''}
        <button class="btn btn-icon btn-ghost btn-sm" onclick="abrirModalEditarCompra('${c.id}','${projetoId}')" title="Editar" style="opacity:0.6">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="btn btn-icon btn-ghost btn-sm" onclick="confirmarExcluirCompra('${c.id}','${projetoId}')" title="Remover" style="opacity:0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>`).join('');
  } catch(e) {
    loading.style.display = 'none';
    mostrarToast('Erro ao carregar compras', 'error');
  }
}

async function toggleCompraUI(compraId, statusAtual, projetoId) {
  try {
    await toggleCompra(compraId, statusAtual);
    carregarComprasDoProjeto(projetoId);
    carregarTudo();
  } catch(e) {
    mostrarToast('Erro ao atualizar item', 'error');
  }
}

let _editandoCompraId = null;
let _editandoCompraProjetoId = null;

async function abrirModalEditarCompra(compraId, projetoId) {
  _editandoCompraId = compraId;
  _editandoCompraProjetoId = projetoId;

  // Busca dados atuais da compra
  const { data, error } = await db.from('compras_extras').select('*').eq('id', compraId).single();
  if (error || !data) { mostrarToast('Erro ao carregar item', 'error'); return; }

  document.getElementById('editCompraNome').value = data.descricao || '';
  document.getElementById('editCompraFornecedor').value = data.fornecedor || '';
  document.getElementById('editCompraValor').value = data.valor || '';
  abrirModal('modalEditarCompra');
  setTimeout(() => document.getElementById('editCompraNome').focus(), 100);
}

async function salvarEdicaoCompra() {
  const desc = document.getElementById('editCompraNome').value.trim();
  if (!desc) { mostrarToast('Descreva o item', 'error'); return; }

  const btn = document.getElementById('btnSalvarEdicaoCompra');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    await db.from('compras_extras').update({
      descricao: desc,
      fornecedor: document.getElementById('editCompraFornecedor').value.trim() || null,
      valor: parseFloat(document.getElementById('editCompraValor').value) || null,
    }).eq('id', _editandoCompraId);

    mostrarToast('Item atualizado!', 'success');
    fecharModal('modalEditarCompra');
    carregarComprasDoProjeto(_editandoCompraProjetoId);
    await carregarTudo();
  } catch(e) {
    mostrarToast('Erro ao salvar item', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

/* ═══════════════════════════════════════
   MODAIS — PROJETO
═══════════════════════════════════════ */

function abrirModalProjeto() {
  state.editandoProjetoId = null;
  document.getElementById('modalProjetoTitulo').textContent = 'Novo Projeto';
  document.getElementById('btnSalvarProjeto').textContent = 'Criar Projeto';
  limparFormProjeto();
  abrirModal('modalProjeto');
}

function abrirModalEditarProjeto(projetoId) {
  const p = state.projetos.find(p => p.id === projetoId);
  if (!p) return;
  state.editandoProjetoId = projetoId;
  document.getElementById('modalProjetoTitulo').textContent = 'Editar Projeto';
  document.getElementById('btnSalvarProjeto').textContent = 'Salvar Alterações';
  document.getElementById('projetoNome').value = p.nome || '';
  document.getElementById('projetoTipo').value = p.tipo || '';
  document.getElementById('projetoPrioridade').value = p.prioridade || 'espera';
  document.getElementById('projetoStatus').value = p.status || 'ativo';
  document.getElementById('projetoCliente').value = p.cliente || '';
  document.getElementById('projetoValor').value = p.valor || '';
  document.getElementById('projetoDescricao').value = p.descricao || '';
  document.getElementById('projetoDataInicio').value = p.data_inicio || '';
  document.getElementById('projetoDataFim').value = p.data_fim || '';
  document.getElementById('templateSection').style.display = 'none';
  abrirModal('modalProjeto');
}

function limparFormProjeto() {
  ['projetoNome','projetoCliente','projetoValor','projetoDescricao','projetoDataInicio','projetoDataFim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('projetoTipo').value = '';
  document.getElementById('projetoPrioridade').value = 'espera';
  document.getElementById('projetoHorizonte').value = 'curto';
  document.getElementById('projetoStatus').value = 'ativo';
  document.getElementById('templateSection').style.display = 'none';
}

function onTipoChange() {
  const tipo = document.getElementById('projetoTipo').value;
  const section = document.getElementById('templateSection');
  section.style.display = tipo === 'planejado' ? '' : 'none';
}

async function salvarProjeto() {
  const nome = document.getElementById('projetoNome').value.trim();
  if (!nome) { mostrarToast('Nome do projeto é obrigatório', 'error'); return; }

  const btn = document.getElementById('btnSalvarProjeto');
  btn.disabled = true; btn.textContent = 'Salvando...';

  const tipoVal = document.getElementById('projetoTipo').value;
  const payload = {
    nome,
    tipo: tipoVal || 'pessoal',
    horizonte: document.getElementById('projetoHorizonte').value || 'curto',
    prioridade: document.getElementById('projetoPrioridade').value,
    status: document.getElementById('projetoStatus').value,
    cliente: document.getElementById('projetoCliente').value.trim() || null,
    valor: parseFloat(document.getElementById('projetoValor').value) || null,
    descricao: document.getElementById('projetoDescricao').value.trim() || null,
    data_inicio: document.getElementById('projetoDataInicio').value || null,
    data_fim: document.getElementById('projetoDataFim').value || null,
  };

  try {
    if (state.editandoProjetoId) {
      await atualizarProjeto(state.editandoProjetoId, payload);
      mostrarToast('Projeto atualizado!', 'success');
    } else {
      const novo = await criarProjeto(payload);
      mostrarToast('Projeto criado!', 'success');

      // Aplicar template se planejado
      const tipo = document.getElementById('projetoTipo').value;
      const aplicar = document.getElementById('aplicarTemplate').checked;
      if (tipo === 'planejado' && aplicar) {
        await criarTemplateEtapasPlanejado(novo.id);
      }
    }

    fecharModal('modalProjeto');
    state.projetos = await getProjetos();
    renderizarKPIs();
    renderizarHoje();
    renderizarProjetos();

    if (state.projetoAtual && state.editandoProjetoId === state.projetoAtual.id) {
      const atualizado = state.projetos.find(p => p.id === state.projetoAtual.id);
      if (atualizado) {
        state.projetoAtual = atualizado;
        renderizarProjetoDetalheHeader(atualizado);
      }
    }
  } catch(e) {
    mostrarToast('Erro ao salvar projeto: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = state.editandoProjetoId ? 'Salvar Alterações' : 'Criar Projeto';
  }
}

async function criarTemplateEtapasPlanejado(projetoId) {
  // Tenta usar o template salvo no banco primeiro
  const templateSalvo = await getTemplatePlanejado();
  let etapas;

  if (templateSalvo && templateSalvo.conteudo && templateSalvo.conteudo.length > 0) {
    etapas = templateSalvo.conteudo;
  } else {
    // Fallback: etapas padrão hardcoded
    etapas = [
      { titulo: 'Briefing com o cliente', descricao: 'Coletar medidas do ambiente, estilo desejado, referências e necessidades.', prioridade: 'urgente' },
      { titulo: 'Projeto no SketchUp', descricao: 'Criar visualização 3D conforme briefing e alinhá-la com o cliente.', prioridade: 'urgente' },
      { titulo: 'Orçamento e proposta', descricao: 'Calcular custo de material, mão de obra e definir margem. Enviar proposta.', prioridade: 'urgente' },
      { titulo: 'Contrato assinado', descricao: 'Formalizar o acordo, receber 50% do valor combinado.', prioridade: 'urgente' },
      { titulo: 'Pedido de material', descricao: 'Enviar plano de corte ao parceiro e fechar pedido com fornecedor.', prioridade: 'importante' },
      { titulo: 'Compras extras', descricao: 'Adquirir puxadores, vidros, espelhos e demais itens fora do fornecedor padrão.', prioridade: 'importante' },
      { titulo: 'Pré-montagem na marcenaria', descricao: 'Acompanhar montagem, conferir medidas e acabamento.', prioridade: 'importante' },
      { titulo: 'Entrega e instalação', descricao: 'Organizar frete, agendar instalação com parceiro e confirmar com o cliente.', prioridade: 'urgente' },
      { titulo: 'Pagamento final e encerramento', descricao: 'Receber os 50% restantes e documentar o projeto concluído.', prioridade: 'importante' },
    ];
  }

  const payload = etapas.map(e => ({ titulo: e.titulo, descricao: e.descricao || '', prioridade: e.prioridade || 'importante', projeto_id: projetoId, status: 'pendente', ordem: e.ordem || 0 }));
  await db.from('tarefas').insert(payload);
}

/* ═══════════════════════════════════════
   GERENCIADOR DE TEMPLATE — Planejados
═══════════════════════════════════════ */

async function abrirGerenciadorTemplate() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-template').classList.add('active');
  document.getElementById('headerTitle').textContent = 'Template: Móvel Planejado';
  document.getElementById('headerSubtitle').textContent = 'Etapas aplicadas em todo novo projeto planejado';
  fecharSidebar();
  await carregarEtapasTemplate();
}

async function carregarEtapasTemplate() {
  const lista = document.getElementById('templateEtapasList');
  const loading = document.getElementById('templateLoading');
  loading.style.display = '';
  lista.innerHTML = '';

  const templateSalvo = await getTemplatePlanejado();
  let etapas = [];

  if (templateSalvo && templateSalvo.conteudo && templateSalvo.conteudo.length > 0) {
    etapas = templateSalvo.conteudo;
  } else {
    etapas = [
      { titulo: 'Briefing com o cliente', descricao: 'Coletar medidas do ambiente, estilo desejado, referências e necessidades.', prioridade: 'urgente', ordem: 1 },
      { titulo: 'Projeto no SketchUp', descricao: 'Criar visualização 3D conforme briefing e alinhá-la com o cliente.', prioridade: 'urgente', ordem: 2 },
      { titulo: 'Orçamento e proposta', descricao: 'Calcular custo de material, mão de obra e definir margem. Enviar proposta.', prioridade: 'urgente', ordem: 3 },
      { titulo: 'Contrato assinado', descricao: 'Formalizar o acordo, receber 50% do valor combinado.', prioridade: 'urgente', ordem: 4 },
      { titulo: 'Pedido de material', descricao: 'Enviar plano de corte ao parceiro e fechar pedido com fornecedor.', prioridade: 'importante', ordem: 5 },
      { titulo: 'Compras extras', descricao: 'Adquirir puxadores, vidros, espelhos e demais itens fora do fornecedor padrão.', prioridade: 'importante', ordem: 6 },
      { titulo: 'Pré-montagem na marcenaria', descricao: 'Acompanhar montagem, conferir medidas e acabamento.', prioridade: 'importante', ordem: 7 },
      { titulo: 'Entrega e instalação', descricao: 'Organizar frete, agendar instalação com parceiro e confirmar com o cliente.', prioridade: 'urgente', ordem: 8 },
      { titulo: 'Pagamento final e encerramento', descricao: 'Receber os 50% restantes e documentar o projeto concluído.', prioridade: 'importante', ordem: 9 },
    ];
  }

  state._templateEtapas = etapas.map((e, i) => ({ ...e, _idx: i }));
  loading.style.display = 'none';
  renderizarEtapasTemplate();
}

function renderizarEtapasTemplate() {
  const lista = document.getElementById('templateEtapasList');
  const etapas = state._templateEtapas || [];
  const prioClass = { urgente: 'badge-urgente', importante: 'badge-importante', espera: 'badge-espera' };

  if (etapas.length === 0) {
    lista.innerHTML = `<div class="empty-state" style="padding:32px"><div class="empty-title">Sem etapas</div><div class="empty-desc">Adicione etapas ao template.</div></div>`;
    return;
  }

  lista.innerHTML = etapas.map((e, i) => `
    <div class="tarefa-item" style="margin-bottom:8px" id="template-etapa-${i}">
      <div class="tarefa-header" style="cursor:default">
        <div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--bg-muted);font-size:11px;font-weight:700;color:var(--text-tertiary);flex-shrink:0">${i + 1}</div>
        <div style="flex:1;min-width:0;margin-left:10px">
          <div class="tarefa-nome">${escHTML(e.titulo)}</div>
          ${e.descricao ? `<div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:2px">${escHTML(e.descricao)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span class="badge ${prioClass[e.prioridade] || 'badge-gray'}">${labelPrioridade(e.prioridade)}</span>
          <button class="btn btn-icon btn-ghost btn-sm" onclick="editarEtapaTemplate(${i})" title="Editar">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button class="btn btn-icon btn-ghost btn-sm" onclick="removerEtapaTemplate(${i})" title="Remover">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>`).join('');
}

let _editandoEtapaIdx = null;

function adicionarEtapaTemplate() {
  _editandoEtapaIdx = null;
  document.getElementById('templateEtapaNome').value = '';
  document.getElementById('templateEtapaDesc').value = '';
  document.getElementById('templateEtapaPrio').value = 'importante';
  document.getElementById('modalTemplateEtapaTitulo').textContent = 'Nova Etapa';
  abrirModal('modalTemplateEtapa');
  setTimeout(() => document.getElementById('templateEtapaNome').focus(), 100);
}

function editarEtapaTemplate(idx) {
  _editandoEtapaIdx = idx;
  const e = state._templateEtapas[idx];
  document.getElementById('templateEtapaNome').value = e.titulo || '';
  document.getElementById('templateEtapaDesc').value = e.descricao || '';
  document.getElementById('templateEtapaPrio').value = e.prioridade || 'importante';
  document.getElementById('modalTemplateEtapaTitulo').textContent = 'Editar Etapa';
  abrirModal('modalTemplateEtapa');
  setTimeout(() => document.getElementById('templateEtapaNome').focus(), 100);
}

function salvarEtapaTemplate() {
  const titulo = document.getElementById('templateEtapaNome').value.trim();
  if (!titulo) { mostrarToast('Nome da etapa é obrigatório', 'error'); return; }

  const etapa = {
    titulo,
    descricao: document.getElementById('templateEtapaDesc').value.trim() || '',
    prioridade: document.getElementById('templateEtapaPrio').value,
    ordem: 0,
  };

  if (_editandoEtapaIdx !== null) {
    state._templateEtapas[_editandoEtapaIdx] = { ...state._templateEtapas[_editandoEtapaIdx], ...etapa };
  } else {
    state._templateEtapas.push({ ...etapa, _idx: state._templateEtapas.length });
  }

  fecharModal('modalTemplateEtapa');
  renderizarEtapasTemplate();
}

function removerEtapaTemplate(idx) {
  state._templateEtapas.splice(idx, 1);
  renderizarEtapasTemplate();
}

async function salvarTemplateCompleto() {
  const btn = document.getElementById('btnSalvarTemplate');
  btn.disabled = true; btn.textContent = 'Salvando...';

  const conteudo = state._templateEtapas.map((e, i) => ({
    titulo: e.titulo,
    descricao: e.descricao || '',
    prioridade: e.prioridade || 'importante',
    ordem: i + 1,
  }));

  try {
    // Upsert: atualiza se existe, cria se não existe
    const templateExistente = await getTemplatePlanejado();
    if (templateExistente) {
      await db.from('templates').update({ conteudo }).eq('id', templateExistente.id);
    } else {
      await db.from('templates').insert([{ categoria: 'planejado', nome: 'Projeto de Móvel Planejado — Padrão', conteudo }]);
    }
    mostrarToast('Template salvo com sucesso!', 'success');
  } catch(e) {
    mostrarToast('Erro ao salvar template: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar Template';
  }
}

function confirmarArquivar(projetoId, nome) {
  document.getElementById('confirmMsg').textContent = `Tem certeza que deseja arquivar o projeto "${nome}"? Ele não aparecerá mais na lista principal.`;
  document.getElementById('btnConfirm').onclick = async () => {
    try {
      await arquivarProjeto(projetoId);
      state.projetos = await getProjetos();
      renderizarKPIs(); renderizarHoje(); renderizarProjetos();
      if (state.projetoAtual?.id === projetoId) voltarParaProjetos();
      mostrarToast('Projeto arquivado', 'warning');
      fecharModal('modalConfirm');
    } catch(e) { mostrarToast('Erro ao arquivar', 'error'); }
  };
  abrirModal('modalConfirm');
}

function confirmarExcluirProjeto(projetoId, nome) {
  document.getElementById('confirmMsg').textContent = `⚠️ Excluir permanentemente "${nome}"? Todas as tarefas, subtarefas e compras serão deletadas. Esta ação não pode ser desfeita.`;
  document.getElementById('btnConfirm').onclick = async () => {
    try {
      const { error } = await db.from('projetos').delete().eq('id', projetoId);
      if (error) throw error;
      state.projetos = await getProjetos();
      renderizarKPIs(); renderizarHoje(); renderizarProjetos();
      if (state.projetoAtual?.id === projetoId) voltarParaProjetos();
      mostrarToast('Projeto excluído permanentemente', 'warning');
      fecharModal('modalConfirm');
    } catch(e) { mostrarToast('Erro ao excluir projeto', 'error'); }
  };
  abrirModal('modalConfirm');
}

async function verArquivados() {
  try {
    const { data, error } = await db
      .from('projetos')
      .select('*, tarefas(id, status), compras_extras(id, status)')
      .eq('status', 'arquivado')
      .order('updated_st', { ascending: false });
    if (error) throw error;
    state.projetosArquivados = data || [];
    filtrarProjetos('arquivado', null);
    // Marcar filtro visual
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="arquivado"]')?.classList.add('active');
  } catch(e) {
    mostrarToast('Erro ao carregar arquivados', 'error');
  }
}

function restaurarProjeto(projetoId, nome) {
  document.getElementById('confirmMsg').textContent = `Restaurar o projeto "${nome}"? Ele voltará para a lista de projetos ativos.`;
  document.getElementById('btnConfirm').onclick = async () => {
    try {
      await atualizarProjeto(projetoId, { status: 'ativo' });
      state.projetos = await getProjetos();
      state.projetosArquivados = (state.projetosArquivados || []).filter(p => p.id !== projetoId);
      renderizarKPIs(); renderizarHoje(); renderizarProjetos();
      mostrarToast('Projeto restaurado!', 'success');
      fecharModal('modalConfirm');
    } catch(e) { mostrarToast('Erro ao restaurar', 'error'); }
  };
  abrirModal('modalConfirm');
}

/* ═══════════════════════════════════════
   MODAIS — TAREFA
═══════════════════════════════════════ */

let _subtarefasInputCount = 0;

async function ciclaPrioridade(tarefaId, prioAtual) {
  const ciclo = { urgente: 'importante', importante: 'espera', espera: 'urgente' };
  const novaPrio = ciclo[prioAtual] || 'importante';
  try {
    await atualizarTarefa(tarefaId, { prioridade: novaPrio });
    // Atualiza o badge na UI sem recarregar tudo
    const el = document.getElementById('tarefa-' + tarefaId);
    if (el) {
      const badge = el.querySelector('.tarefa-header .badge');
      if (badge) {
        badge.className = `badge badge-${novaPrio}`;
        badge.textContent = labelPrioridade(novaPrio);
        badge.onclick = (e) => { e.stopPropagation(); ciclaPrioridade(tarefaId, novaPrio); };
      }
    }
    await carregarTudo();
  } catch(e) {
    mostrarToast('Erro ao atualizar prioridade', 'error');
  }
}

function abrirModalEditarTarefa(tarefaId) {
  // Busca a tarefa nas tarefas carregadas na lista do DOM
  const el = document.getElementById('tarefa-' + tarefaId);
  if (!el) return;
  const nome = el.querySelector('.tarefa-nome')?.textContent || '';
  const desc = el.querySelector('.tarefa-body p')?.textContent || '';
  const badgeClasses = el.querySelector('.tarefa-header .badge')?.className || '';
  let prio = 'importante';
  if (badgeClasses.includes('urgente')) prio = 'urgente';
  else if (badgeClasses.includes('espera')) prio = 'espera';

  state.editandoTarefaId = tarefaId;
  document.getElementById('modalTarefaTitulo').textContent = 'Editar Tarefa';
  document.getElementById('btnSalvarTarefa').textContent = 'Salvar Alterações';
  document.getElementById('tarefaNome').value = nome;
  document.getElementById('tarefaDescricao').value = desc;
  document.getElementById('tarefaPrioridade').value = prio;
  document.getElementById('tarefaStatus').value = 'pendente';
  document.getElementById('subtarefasInput').innerHTML = '';
  _subtarefasInputCount = 0;
  // Esconde campo subtarefas no modo edição (subtarefas têm fluxo próprio)
  const subSection = document.getElementById('subtarefasInput')?.closest('.input-group');
  if (subSection) subSection.style.display = 'none';
  abrirModal('modalTarefa');
  setTimeout(() => document.getElementById('tarefaNome').focus(), 100);
}

function abrirModalTarefa() {
  state.editandoTarefaId = null;
  document.getElementById('modalTarefaTitulo').textContent = 'Nova Tarefa';
  document.getElementById('btnSalvarTarefa').textContent = 'Criar Tarefa';
  document.getElementById('tarefaNome').value = '';
  document.getElementById('tarefaDescricao').value = '';
  document.getElementById('tarefaPrioridade').value = 'importante';
  document.getElementById('tarefaStatus').value = 'pendente';
  document.getElementById('subtarefasInput').innerHTML = '';
  _subtarefasInputCount = 0;
  // Restaura seção de subtarefas caso tenha sido ocultada pelo modo edição
  const subSection = document.getElementById('subtarefasInput')?.closest('.input-group');
  if (subSection) subSection.style.display = '';
  abrirModal('modalTarefa');
}

function adicionarCampoSubtarefa() {
  _subtarefasInputCount++;
  const container = document.getElementById('subtarefasInput');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  row.innerHTML = `
    <input class="input" placeholder="Ex: Ligar para o fornecedor" style="flex:1" id="sub_${_subtarefasInputCount}">
    <button type="button" class="btn btn-ghost btn-icon btn-sm" onclick="this.parentElement.remove()" style="flex-shrink:0">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>`;
  container.appendChild(row);
  row.querySelector('input').focus();
}

async function salvarTarefa() {
  const nome = document.getElementById('tarefaNome').value.trim();
  if (!nome) { mostrarToast('Nome da tarefa é obrigatório', 'error'); return; }

  const btn = document.getElementById('btnSalvarTarefa');
  btn.disabled = true; btn.textContent = 'Salvando...';

  // Restaurar visibilidade da seção subtarefas (pode ter sido ocultada no modo edição)
  const subSection = document.getElementById('subtarefasInput')?.closest('.input-group');
  if (subSection) subSection.style.display = '';

  try {
    if (state.editandoTarefaId) {
      // MODO EDIÇÃO
      await atualizarTarefa(state.editandoTarefaId, {
        titulo: nome,
        descricao: document.getElementById('tarefaDescricao').value.trim() || null,
        prioridade: document.getElementById('tarefaPrioridade').value,
      });
      mostrarToast('Tarefa atualizada!', 'success');
      fecharModal('modalTarefa');
      state.editandoTarefaId = null;
      await carregarTudo();
      if (state.projetoAtual) carregarTarefasDoProjeto(state.projetoAtual.id);
    } else {
      // MODO CRIAÇÃO
      if (!state.projetoAtual) { mostrarToast('Nenhum projeto selecionado', 'error'); return; }
      const payload = {
        projeto_id: state.projetoAtual.id,
        titulo: nome,
        descricao: document.getElementById('tarefaDescricao').value.trim() || null,
        prioridade: document.getElementById('tarefaPrioridade').value,
        status: document.getElementById('tarefaStatus').value,
      };
      const tarefa = await criarTarefa(payload);

      // Cria subtarefas
      const inputs = document.getElementById('subtarefasInput').querySelectorAll('input');
      const subs = [];
      inputs.forEach(inp => {
        const val = inp.value.trim();
        if (val) subs.push({ tarefa_id: tarefa.id, titulo: val, concluida: false });
      });
      if (subs.length > 0) await db.from('subtarefas').insert(subs);

      mostrarToast('Tarefa criada!', 'success');
      fecharModal('modalTarefa');
      await carregarTudo();
      carregarTarefasDoProjeto(state.projetoAtual.id);
    }
  } catch(e) {
    mostrarToast('Erro ao salvar tarefa: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = state.editandoTarefaId ? 'Salvar Alterações' : 'Criar Tarefa';
  }
}

let _subtarefaParaTarefaId = null;

function abrirModalSubtarefa(tarefaId) {
  _subtarefaParaTarefaId = tarefaId;
  document.getElementById('subtarefaNomeModal').value = '';
  abrirModal('modalSubtarefa');
  setTimeout(() => document.getElementById('subtarefaNomeModal').focus(), 100);
}

async function salvarSubtarefa() {
  const nome = document.getElementById('subtarefaNomeModal').value.trim();
  if (!nome) { mostrarToast('Digite o nome da subtarefa', 'error'); return; }

  try {
    const sub = await criarSubtarefa({ tarefa_id: _subtarefaParaTarefaId, titulo: nome, concluida: false });
    fecharModal('modalSubtarefa');
    mostrarToast('Subtarefa adicionada!', 'success');

    const lista = document.getElementById('subtarefas-' + _subtarefaParaTarefaId);
    if (lista) {
      lista.insertAdjacentHTML('beforeend', renderizarSubtarefaItem(sub, _subtarefaParaTarefaId));
    }
    atualizarProgressoDaTarefa(_subtarefaParaTarefaId);
  } catch(e) {
    mostrarToast('Erro ao criar subtarefa', 'error');
  }
}

function confirmarExcluirTarefa(tarefaId) {
  document.getElementById('confirmMsg').textContent = 'Tem certeza que deseja excluir esta tarefa e todas as suas subtarefas?';
  document.getElementById('btnConfirm').onclick = async () => {
    try {
      await excluirTarefa(tarefaId);
      document.getElementById('tarefa-' + tarefaId)?.remove();
      mostrarToast('Tarefa excluída', 'warning');
      fecharModal('modalConfirm');
      await carregarTudo();
    } catch(e) { mostrarToast('Erro ao excluir tarefa', 'error'); }
  };
  abrirModal('modalConfirm');
}

function confirmarExcluirSubtarefa(subtarefaId, tarefaId) {
  document.getElementById('confirmMsg').textContent = 'Excluir esta subtarefa?';
  document.getElementById('btnConfirm').onclick = async () => {
    try {
      await excluirSubtarefa(subtarefaId);
      document.getElementById('subtarefa-' + subtarefaId)?.remove();
      mostrarToast('Subtarefa removida', 'warning');
      fecharModal('modalConfirm');
      atualizarProgressoDaTarefa(tarefaId);
    } catch(e) { mostrarToast('Erro ao excluir subtarefa', 'error'); }
  };
  abrirModal('modalConfirm');
}

/* ═══════════════════════════════════════
   MODAIS — COMPRA
═══════════════════════════════════════ */

function abrirModalCompra() {
  ['compraNome','compraFornecedor','compraDescricao'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('compraValor').value = '';
  abrirModal('modalCompra');
}

async function salvarCompra() {
  const desc = document.getElementById('compraNome').value.trim();
  if (!desc) { mostrarToast('Descreva o item a comprar', 'error'); return; }
  if (!state.projetoAtual) { mostrarToast('Nenhum projeto selecionado', 'error'); return; }

  try {
    await criarCompra({
      projeto_id: state.projetoAtual.id,
      descricao: desc,
      fornecedor: document.getElementById('compraFornecedor').value.trim() || null,
      valor: parseFloat(document.getElementById('compraValor').value) || null,
      status: 'pendente',
    });
    mostrarToast('Item adicionado!', 'success');
    fecharModal('modalCompra');
    carregarComprasDoProjeto(state.projetoAtual.id);
    await carregarTudo();
  } catch(e) {
    mostrarToast('Erro ao adicionar item: ' + e.message, 'error');
  }
}

function confirmarExcluirCompra(compraId, projetoId) {
  document.getElementById('confirmMsg').textContent = 'Excluir este item da lista de compras?';
  document.getElementById('btnConfirm').onclick = async () => {
    try {
      await excluirCompra(compraId);
      document.getElementById('compra-' + compraId)?.remove();
      mostrarToast('Item removido', 'warning');
      fecharModal('modalConfirm');
      await carregarTudo();
    } catch(e) { mostrarToast('Erro ao excluir item', 'error'); }
  };
  abrirModal('modalConfirm');
}

/* ═══════════════════════════════════════
   SIDEBAR MOBILE
═══════════════════════════════════════ */

function abrirSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('show');
}

function fecharSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

/* ═══════════════════════════════════════
   COPILOTO
═══════════════════════════════════════ */

function abrirCopiloto() {
  document.getElementById('copiloPanel').classList.add('open');
  document.getElementById('copiloOverlay').style.display = '';
  document.getElementById('copiloContexto').focus();
}

function fecharCopiloto() {
  document.getElementById('copiloPanel').classList.remove('open');
  document.getElementById('copiloOverlay').style.display = 'none';
}

/* ═══════════════════════════════════════
   UTILITÁRIOS DE MODAL
═══════════════════════════════════════ */

function abrirModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function fecharModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) fecharModal(overlay.id);
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => fecharModal(m.id));
    fecharCopiloto();
    fecharSidebar();
  }
});

/* ═══════════════════════════════════════
   TOASTS
═══════════════════════════════════════ */

function mostrarToast(msg, tipo = 'success') {
  const container = document.getElementById('toastContainer');
  const icons = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
  };
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `${icons[tipo] || ''}${escHTML(msg)}`;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */

function escHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, '\\\'');
}

function formatarData(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function labelPrioridade(p) {
  const map = { urgente: 'Urgente', importante: 'Importante', espera: 'Pode esperar' };
  return map[p] || p || 'Importante';
}

function labelStatus(s) {
  const map = { ativo: 'Ativo', pausado: 'Pausado', arquivado: 'Arquivado', pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', comprado: 'Comprado', pendente_compra: 'A comprar' };
  return map[s] || s || '';
}
