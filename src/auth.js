// Cadastro e login.
// Sem nuvem configurada (cloud/config.js vazio): contas locais, senha guardada como hash
// SHA-256 (e-mail + senha) só neste navegador.
// Com Supabase: login de verdade, aulas sincronizadas entre aparelhos e painel de admin.

import { $, toast, ask, askPassword, sure } from './core/dom.js';
import { state, saveUsers } from './core/store.js';
import { on } from './core/events.js';
import { sha256 } from './core/util.js';
import { register } from './core/actions.js';
import { startApp } from './library.js';
import { cloudEnabled } from './cloud/config.js';

const cloud = () => import('./cloud/supabase.js');

const remember = () => $('aRemember').checked;

/** Guarda quem está logado: para sempre com "Lembrar de mim", ou só nesta aba do navegador. */
function keepSession(email) {
  localStorage.removeItem('me');
  sessionStorage.removeItem('me');
  (remember() ? localStorage : sessionStorage).setItem('me', email);
  localStorage.setItem('remember', remember() ? '1' : '0');
  if (remember()) localStorage.setItem('lastEmail', email);
  else localStorage.removeItem('lastEmail');
}

// Preenche o e-mail lembrado e a opção escolhida da última vez.
$('aRemember').checked = localStorage.getItem('remember') !== '0';
$('aEmail').value = localStorage.getItem('lastEmail') ?? '';

// Entrar é um <form> de verdade: o navegador oferece salvar a senha e o Enter funciona.
$('authForm').addEventListener('submit', e => {
  e.preventDefault();
  authenticate('login');
});

async function authenticate(mode) {
  const email = $('aEmail').value.trim().toLowerCase();
  const password = $('aPass').value;
  const name = $('aName').value.trim();
  if (cloudEnabled()) return cloudAuthenticate(mode, email, password, name);
  if (!email || password.length < 4) return toast('Informe e-mail e senha (mín. 4 caracteres)');

  const hash = await sha256(email + password);
  if (mode === 'signup') {
    if (state.users[email]) return toast('Essa conta já existe. Clique em Entrar.');
    state.users[email] = { name: name || email.split('@')[0], h: hash };
    saveUsers();
    toast('Conta criada!');
  } else if (state.users[email]?.h !== hash) {
    return toast('E-mail ou senha incorretos');
  }
  state.me = email;
  keepSession(email);
  startApp();
}

// ----- Nuvem (Supabase) -----

async function cloudAuthenticate(mode, email, password, name) {
  if (!email || password.length < 6) return toast('Informe e-mail e senha (mín. 6 caracteres)');
  const api = await cloud();
  try {
    if (mode === 'signup') {
      const { session } = await api.signUp(email, password, name || email.split('@')[0]);
      if (!session) return toast('Conta criada! Confirme pelo link enviado ao seu e-mail e depois clique em Entrar.');
    } else {
      await api.signIn(email, password);
    }
    await enterCloud();
  } catch (e) {
    toast(e.message);
  }
}

/** Depois do login na nuvem: confere bloqueio, baixa as aulas e abre o app. */
async function enterCloud() {
  const api = await cloud();
  const user = await api.currentUser();
  if (!user) return false;
  const profile = await api.myProfile();
  if (profile.blocked) {
    await api.signOut();
    toast('Sua conta foi bloqueada pelo administrador.');
    return false;
  }
  const email = user.email.toLowerCase();
  // Guarda nome e admin localmente para a interface (o servidor é quem decide de verdade).
  state.users[email] = { name: profile.name ?? email.split('@')[0], h: '', cloud: true, admin: profile.is_admin };
  saveUsers();
  state.me = email;
  keepSession(email);

  // A nuvem é a fonte da verdade; a chave de IA continua a deste aparelho.
  const local = JSON.parse(localStorage.getItem('db_' + email) ?? 'null');
  const remote = await api.loadCloudDb();
  if (remote) {
    localStorage.setItem('db_' + email, JSON.stringify({ ...remote.data, key: local?.key ?? '', okey: local?.okey ?? '' }));
  }
  startApp();
  $('adminBtn').classList.toggle('hidden', !profile.is_admin);
  if (!remote) api.saveCloudDb(state.db).catch(e => console.warn('Nuvem:', e.message));
  return true;
}

// Cada gravação local também vai para a nuvem (agrupada a cada 1,5 s).
let syncTimer;
on('db:saved', () => {
  if (!cloudEnabled() || !state.users[state.me]?.cloud) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await (await cloud()).saveCloudDb(state.db);
    } catch (e) {
      toast('⚠️ Não foi possível salvar na nuvem: ' + e.message);
    }
  }, 1500);
});

/** Pede a nova senha duas vezes. Devolve a senha ou null se a pessoa desistir. */
async function chooseNewPassword(min) {
  for (;;) {
    const first = await askPassword(`Nova senha (mín. ${min} caracteres):`);
    if (first === null) return null;
    if (first.length < min) { toast(`A senha precisa de pelo menos ${min} caracteres`); continue; }
    const again = await askPassword('Repita a nova senha:');
    if (again === null) return null;
    if (again === first) return first;
    toast('As senhas não são iguais. Tente de novo.');
  }
}

/** Sem nuvem, a conta só existe neste aparelho: quem está com ele pode criar uma nova senha. */
async function resetLocalPassword() {
  const email = (await ask('E-mail da conta neste aparelho:', $('aEmail').value.trim()))?.trim().toLowerCase();
  if (!email) return;
  if (!state.users[email]) return toast('Não há conta com esse e-mail neste aparelho.');
  const ok = await sure(`Criar uma nova senha para ${email}? Suas aulas continuam aqui.`);
  if (!ok) return;
  const password = await chooseNewPassword(4);
  if (!password) return;
  state.users[email].h = await sha256(email + password);
  saveUsers();
  $('aEmail').value = email;
  $('aPass').value = '';
  toast('✅ Senha alterada! Agora é só entrar.');
}

/** O link do e-mail traz a pessoa de volta com "type=recovery": aqui ela escolhe a nova senha. */
async function finishCloudRecovery() {
  const api = await cloud();
  await api.sb(); // lê o token do link e cria a sessão
  history.replaceState(null, '', location.pathname + location.search);
  const password = await chooseNewPassword(6);
  if (!password) return false;
  try {
    await api.updatePassword(password);
    toast('✅ Senha alterada!');
    return enterCloud();
  } catch (e) {
    toast(e.message);
    return false;
  }
}

async function forgotPassword() {
  if (!cloudEnabled()) return resetLocalPassword();
  const email = await ask('Seu e-mail para receber o link de nova senha:', $('aEmail').value.trim());
  if (!email) return;
  try {
    await (await cloud()).resetPassword(email.trim().toLowerCase());
    toast('Enviamos um link para ' + email);
  } catch (e) {
    toast(e.message);
  }
}

/** Abertura do app: com nuvem, retoma a sessão salva do Supabase. */
/**
 * Só entra direto se a pessoa marcou "Lembrar de mim" (ou se a sessão é desta aba).
 * Logins antigos, de antes dessa opção, e a demonstração não abrem o app sozinhos.
 */
function rememberedUser() {
  const tab = sessionStorage.getItem('me');
  if (tab) return tab;
  const saved = localStorage.getItem('me');
  if (saved && localStorage.getItem('remember') === '1') return saved;
  localStorage.removeItem('me');
  return null;
}

export async function resumeSession() {
  state.me = rememberedUser();
  if (cloudEnabled()) {
    if (/type=recovery/.test(location.hash) && (await finishCloudRecovery())) return;
    try {
      if (await enterCloud()) return;
    } catch (e) {
      console.warn('Nuvem indisponível:', e.message);
    }
    // Sem sessão na nuvem: só o modo demonstração continua aberto localmente.
    if (state.me && !state.users[state.me]?.cloud && state.users[state.me]) return startApp();
    return;
  }
  if (state.me && state.users[state.me]) startApp();
}

async function logout() {
  if (cloudEnabled() && state.users[state.me]?.cloud) await (await cloud()).signOut();
  localStorage.removeItem('me');
  sessionStorage.removeItem('me');
  location.reload();
}

register({
  'auth.signup': () => authenticate('signup'),
  'auth.forgot': forgotPassword,
  'auth.logout': logout,
});
