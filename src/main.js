// Ponto de entrada: carrega os módulos (cada um registra suas ações) e liga o HTML a elas.
//
//   data-action="nome"  clique            -> run(nome, data-arg, elemento, evento)
//   data-change="nome"  change (arquivos) -> run(nome, elemento)
//   data-input="nome"   input (digitação) -> run(nome, elemento)
//   data-enter="nome"   tecla Enter       -> run(nome, elemento)

import { run, register } from './core/actions.js';
import { on } from './core/events.js';
import { toast } from './core/dom.js';
import { state } from './core/store.js';
import { startApp } from './library.js';
import { initBoard } from './board.js';

import './core/files.js';
import './ai/claude.js';
import './auth.js';
import './tabs.js';
import './study/summary.js';
import './study/pdf.js';
import './slides/slides.js';
import './capture/ocr.js';
import './capture/audio.js';
import './capture/speech.js';
import './web.js';
import './rag/ask.js';
import './agent/agent.js';
import './demo.js';

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el) run(el.dataset.action, el.dataset.arg, el, e);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el) run(el.dataset.change, el);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if (el) run(el.dataset.input, el);
});
document.addEventListener('keydown', e => {
  const el = e.target.closest?.('[data-enter]');
  if (el && e.key === 'Enter') run(el.dataset.enter, el);
});

on('storage:full', () => toast('⚠️ Armazenamento cheio: faça um Backup e remova imagens antigas'));

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'light' : 'dark';
}

register({ 'theme.toggle': toggleTheme });

initBoard();
if (state.me && state.users[state.me]) startApp();
