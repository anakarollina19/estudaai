// Contas e aulas na nuvem com Supabase: login de verdade, sincronização entre aparelhos
// e painel de admin. Só é carregado quando config.js está preenchido.
// A chave de IA (key/okey) nunca sai do aparelho.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

// Com "Lembrar de mim" desmarcado, a sessão do Supabase vai para o sessionStorage
// e some ao fechar o navegador.
const box = () => (localStorage.getItem('remember') === '0' ? sessionStorage : localStorage);
const sessionStore = {
  getItem: k => localStorage.getItem(k) ?? sessionStorage.getItem(k),
  setItem: (k, v) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
    box().setItem(k, v);
  },
  removeItem: k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  },
};

let client = null;
export async function sb() {
  if (!client) {
    const { createClient } = await import(SDK);
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: sessionStore } });
  }
  return client;
}

/** Lança erro com mensagem em português para os casos comuns. */
function check({ data, error }) {
  if (!error) return data;
  const msg = error.message ?? String(error);
  if (/invalid login/i.test(msg)) throw new Error('E-mail ou senha incorretos');
  if (/already registered/i.test(msg)) throw new Error('Essa conta já existe. Clique em Entrar.');
  if (/email not confirmed/i.test(msg)) throw new Error('Confirme seu e-mail pelo link que enviamos e depois entre.');
  if (/password/i.test(msg)) throw new Error('Senha fraca: use pelo menos 6 caracteres.');
  throw new Error(msg);
}

export async function signUp(email, password, name) {
  const c = await sb();
  return check(await c.auth.signUp({ email, password, options: { data: { name } } }));
}

export async function signIn(email, password) {
  const c = await sb();
  return check(await c.auth.signInWithPassword({ email, password }));
}

export async function signOut() {
  await (await sb()).auth.signOut();
}

export async function resetPassword(email) {
  const c = await sb();
  return check(await c.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] }));
}

/** Sessão salva (o Supabase mantém o login entre visitas). */
export async function currentUser() {
  const { data } = await (await sb()).auth.getSession();
  return data.session?.user ?? null;
}

/** Perfil do usuário logado: { name, is_admin, blocked }. */
export async function myProfile() {
  const c = await sb();
  const user = await currentUser();
  return check(await c.from('profiles').select('name, email, blocked, is_admin').eq('id', user.id).single());
}

// ----- Aulas -----

export async function loadCloudDb() {
  const c = await sb();
  const user = await currentUser();
  const rows = check(await c.from('lesson_dbs').select('data, updated_at').eq('user_id', user.id));
  return rows[0] ?? null;
}

export async function saveCloudDb(db) {
  const c = await sb();
  const user = await currentUser();
  if (!user) return;
  const { key, okey, ...data } = db; // a chave de IA fica só no aparelho
  check(await c.from('lesson_dbs').upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }));
}

// ----- Admin -----

export async function listUsers() {
  const c = await sb();
  return check(await c.rpc('admin_list_users'));
}

export async function setBlocked(userId, blocked) {
  const c = await sb();
  return check(await c.rpc('admin_set_blocked', { target: userId, value: blocked }));
}

export async function deleteUser(userId) {
  const c = await sb();
  return check(await c.rpc('admin_delete_user', { target: userId }));
}
