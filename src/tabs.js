import { $, esc } from './core/dom.js';
import { emit } from './core/events.js';
import { register } from './core/actions.js';

export const TABS = {
  inicio: '🏠 Início',
  notas: '📝 Anotações',
  captura: '📷 Foto & Áudio',
  resumo: '✨ Resumo & Mapa',
  slides: '🎞️ Slides',
  quadro: '🖍️ Quadro branco',
  agente: '🤖 Agente',
  perguntar: '🔎 Pergunte às aulas',
};

export function showTab(name) {
  for (const section of document.querySelectorAll('[data-tab]')) {
    section.classList.toggle('hidden', section.dataset.tab !== name);
  }
  $('tabs').innerHTML = Object.entries(TABS)
    .map(([key, label]) => `<button class="${key === name ? 'on' : ''}" data-action="tab.show" data-arg="${key}">${esc(label)}</button>`)
    .join('');
  emit('tab:show', name);
}

register({ 'tab.show': showTab });
