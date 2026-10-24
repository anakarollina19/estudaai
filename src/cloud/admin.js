// Painel de admin: lista as contas da nuvem e permite bloquear ou excluir.
// A permissão de verdade é checada no Supabase (funções admin_* do setup.sql);
// esconder o botão aqui é só conveniência.

import { $, esc, toast, sure } from '../core/dom.js';
import { register } from '../core/actions.js';
import { state } from '../core/store.js';

const api = () => import('./supabase.js');
const fmt = d => (d ? new Date(d).toLocaleString('pt-BR') : '—');

async function openAdmin() {
  $('adminPanel').classList.remove('hidden');
  await renderUsers();
}

async function renderUsers() {
  const box = $('adminUsers');
  box.innerHTML = '<p class="muted">Carregando...</p>';
  try {
    const users = await (await api()).listUsers();
    $('adminCount').textContent = `${users.length} conta(s)`;
    box.innerHTML = users.map(u => {
      const me = u.email.toLowerCase() === state.me;
      return `
      <div class="admin-user ${u.blocked ? 'blocked' : ''}">
        <div class="grow">
          <b>${esc(u.name ?? '')}</b> ${u.is_admin ? '<span class="pill">admin</span>' : ''} ${u.blocked ? '<span class="pill">bloqueada</span>' : ''}
          <div class="muted">${esc(u.email)}</div>
          <small class="muted">Criada ${fmt(u.created_at)} · Último acesso ${fmt(u.last_sign_in_at)} · ${u.lessons} aula(s)</small>
        </div>
        ${me ? '<small class="muted">você</small>' : `
          <button class="ghost" data-action="admin.block" data-arg="${u.id}|${u.blocked ? 0 : 1}">${u.blocked ? '✅ Desbloquear' : '⛔ Bloquear'}</button>
          <button class="ghost danger" data-action="admin.delete" data-arg="${u.id}|${esc(u.email)}">🗑️ Excluir</button>`}
      </div>`;
    }).join('') || '<p class="muted">Nenhuma conta ainda.</p>';
  } catch (e) {
    box.innerHTML = `<p>Não foi possível carregar: ${esc(e.message)}</p>`;
  }
}

async function block(arg) {
  const [id, value] = arg.split('|');
  try {
    await (await api()).setBlocked(id, value === '1');
    toast(value === '1' ? 'Conta bloqueada' : 'Conta desbloqueada');
    renderUsers();
  } catch (e) {
    toast(e.message);
  }
}

async function remove(arg) {
  const [id, email] = arg.split('|');
  if (!(await sure(`Excluir a conta ${email} e todas as aulas dela? Isso não tem volta.`))) return;
  try {
    await (await api()).deleteUser(id);
    toast('Conta excluída');
    renderUsers();
  } catch (e) {
    toast(e.message);
  }
}

register({
  'admin.open': openAdmin,
  'admin.close': () => $('adminPanel').classList.add('hidden'),
  'admin.refresh': renderUsers,
  'admin.block': block,
  'admin.delete': remove,
});
