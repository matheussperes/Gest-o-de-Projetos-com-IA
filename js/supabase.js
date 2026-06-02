/* ═══════════════════════════════════════════════════════════
   supabase.js — Cliente e funções de acesso a dados
   Substitua YOUR_SUPABASE_URL e YOUR_SUPABASE_KEY
   pelos valores do seu projeto em app.supabase.com
   Settings → API → Project URL e anon public key
   ═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://mdbsbsisjfzjcvmxzxci.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0FkAvtg9oFAE4PCO0ZvIng_UdKe5uk6';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ─── Projetos ─── */

async function getProjetos() {
  const { data, error } = await db
    .from('projetos')
    .select(`
      *,
      tarefas ( id, titulo, status, prioridade ),
      compras_extras ( id, status, descricao )
    `)
    .neq('status', 'arquivado')
    .order('created_st', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getProjetoById(id) {
  const { data, error } = await db
    .from('projetos')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function criarProjeto(payload) {
  const { data, error } = await db
    .from('projetos')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function atualizarProjeto(id, payload) {
  const { data, error } = await db
    .from('projetos')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function arquivarProjeto(id) {
  return atualizarProjeto(id, { status: 'arquivado' });
}

/* ─── Tarefas ─── */

async function getTarefasPorProjeto(projetoId) {
  const { data, error } = await db
    .from('tarefas')
    .select('*, subtarefas(*)')
    .eq('projeto_id', projetoId)
    .order('ordem', { ascending: true })
    .order('created_st', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getTarefasPrioritarias() {
  // Busca tarefas não concluídas de projetos ativos
  const { data, error } = await db
    .from('tarefas')
    .select(`
      *,
      projetos!inner ( id, nome, status, prioridade, data_fim )
    `)
    .neq('status', 'concluida')
    .eq('projetos.status', 'ativo')
    .order('created_st', { ascending: true })
    .limit(30);
  if (error) throw error;
  return data || [];
}

async function criarTarefa(payload) {
  const { data, error } = await db
    .from('tarefas')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function atualizarTarefa(id, payload) {
  const { data, error } = await db
    .from('tarefas')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function excluirTarefa(id) {
  const { error } = await db.from('tarefas').delete().eq('id', id);
  if (error) throw error;
}

/* ─── Subtarefas ─── */

async function criarSubtarefa(payload) {
  const { data, error } = await db
    .from('subtarefas')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function toggleSubtarefa(id, concluida) {
  const { data, error } = await db
    .from('subtarefas')
    .update({ concluida })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function excluirSubtarefa(id) {
  const { error } = await db.from('subtarefas').delete().eq('id', id);
  if (error) throw error;
}

/* ─── Compras Extras ─── */

async function getComprasPorProjeto(projetoId) {
  const { data, error } = await db
    .from('compras_extras')
    .select('*')
    .eq('projeto_id', projetoId)
    .order('created_st', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function criarCompra(payload) {
  const { data, error } = await db
    .from('compras_extras')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function toggleCompra(id, statusAtual) {
  const novoStatus = statusAtual === 'comprado' ? 'pendente' : 'comprado';
  const { data, error } = await db
    .from('compras_extras')
    .update({ status: novoStatus })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function excluirCompra(id) {
  const { error } = await db.from('compras_extras').delete().eq('id', id);
  if (error) throw error;
}

/* ─── Contexto completo para o Copiloto ─── */

async function getContextoCompleto() {
  const { data, error } = await db
    .from('projetos')
    .select(`
      *,
      tarefas (
        *,
        subtarefas (*)
      ),
      compras_extras (*)
    `)
    .neq('status', 'arquivado')
    .order('created_st', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ─── Templates ─── */

async function getTemplatePlanejado() {
  const { data, error } = await db
    .from('templates')
    .select('*')
    .eq('categoria', 'planejado')
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function criarTarefasDeTemplate(projetoId, conteudo) {
  if (!conteudo || !conteudo.length) return;
  for (const t of conteudo) {
    // Cria a tarefa
    const { data: tarefa, error: errTarefa } = await db
      .from('tarefas')
      .insert([{
        projeto_id: projetoId,
        titulo:     t.titulo,
        descricao:  t.descricao || '',
        status:     'pendente',
        prioridade: t.prioridade || 'importante',
        ordem:      t.ordem || 0,
      }])
      .select()
      .single();
    if (errTarefa) throw errTarefa;

    // Cria subtarefas da tarefa (se houver)
    if (t.subtarefas && t.subtarefas.length > 0 && tarefa) {
      const subtarefasPayload = t.subtarefas.map((nome, idx) => ({
        tarefa_id: tarefa.id,
        nome,
        concluida: false,
        ordem: idx,
      }));
      const { error: errSub } = await db.from('subtarefas').insert(subtarefasPayload);
      if (errSub) throw errSub;
    }
  }
}
