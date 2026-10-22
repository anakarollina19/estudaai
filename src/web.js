// Ferramentas ao lado das notas: Google, YouTube e dúvida rápida com IA.

import { $, toast } from './core/dom.js';
import { register } from './core/actions.js';
import { complete } from './ai/claude.js';

export function openGoogle(query) {
  const url = 'https://www.google.com/search?q=' + encodeURIComponent(query);
  window.open(url, 'google', `width=520,height=800,left=${screen.width - 540}`);
}

/** Extrai o id de 11 caracteres de links do YouTube (watch, youtu.be, shorts, embed). */
export const youtubeId = url => url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1] ?? null;

function loadYoutube() {
  const id = youtubeId($('ytUrl').value);
  if (!id) return toast('Link do YouTube inválido');
  $('ytBox').innerHTML = `<iframe src="https://www.youtube.com/embed/${id}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
}

async function askAI() {
  const question = $('gq').value.trim();
  if (!question) return toast('Digite a dúvida');
  const out = $('aiAns');
  out.textContent = 'Pensando...';
  try {
    const answer = await complete(
      'Sou estudante. Contexto da minha aula:\n' + $('notes').value.slice(0, 4000) +
      '\n\nMinha dúvida: ' + question + '\nResponda de forma clara e didática.'
    );
    out.textContent = answer ?? 'Configure a chave de IA em ⚙️ ou use o botão Google.';
  } catch (e) {
    out.textContent = 'Erro: ' + e.message;
  }
}

register({
  'web.google': () => {
    const q = $('gq').value.trim();
    if (q) openGoogle(q);
  },
  'web.youtube': loadYoutube,
  'web.askAI': askAI,
});
