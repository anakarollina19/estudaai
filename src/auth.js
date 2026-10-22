// Cadastro e login locais. A senha é guardada como hash SHA-256 (e-mail + senha).
// Para contas na nuvem de verdade, isto seria trocado por Supabase/Firebase Auth.

import { $, toast } from './core/dom.js';
import { state, saveUsers } from './core/store.js';
import { sha256 } from './core/util.js';
import { register } from './core/actions.js';
import { startApp } from './library.js';

async function authenticate(mode) {
  const email = $('aEmail').value.trim().toLowerCase();
  const password = $('aPass').value;
  const name = $('aName').value.trim();
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
  localStorage.setItem('me', email);
  startApp();
}

function logout() {
  localStorage.removeItem('me');
  location.reload();
}

register({
  'auth.login': () => authenticate('login'),
  'auth.signup': () => authenticate('signup'),
  'auth.logout': logout,
});
