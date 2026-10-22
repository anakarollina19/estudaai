// Resumo, mapa mental e flashcards a partir das notas da aula aberta.

import { $, esc, toast } from '../core/dom.js';
import { register } from '../core/actions.js';
import { on } from '../core/events.js';
import { currentLesson, save } from '../core/store.js';
import { tryComplete, hasKey } from '../ai/claude.js';
import { offlineSummary, topics, sentences, keywords } from '../text/nlp.js';
import { clip } from '../core/util.js';
import { showTab } from '../tabs.js';

const PLACEHOLDER = 'Clique em “📝 Resumo” na barra Gerar.';

async function makeSummary() {
  showTab('resumo');
  const lesson = currentLesson();
  const notes = $('notes').value;
  if (notes.length < 40) return toast('Escreva ou transcreva mais conteúdo primeiro');

  $('summary').textContent = 'Gerando...';
  const ai = await tryComplete(
    'Você é um tutor para estudantes. Faça um resumo didático em português desta aula, ' +
    'com tópicos, conceitos-chave em destaque e 3 perguntas de revisão no final. Texto:\n\n' + notes
  );
  const note = hasKey() ? '\n\n(IA indisponível, resumo feito no modo offline)' : '\n\n(modo offline: adicione a chave de IA em ⚙️ para resumos melhores)';
  lesson.summary = ai ?? offlineSummary(notes) + note;
  $('summary').textContent = lesson.summary;
  save();
}

const COLORS = ['#5b4cf0', '#16a37a', '#e0563b', '#f0a020', '#1f8ce0', '#c03ab0'];

/** Desenha o mapa mental em SVG: aula no centro, tópicos ao redor e até 3 ideias por tópico. */
export function mindmapSvg(title, parts) {
  const W = 900, H = Math.max(420, parts.length * 90), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2.8;
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui">`;
  parts.forEach((part, i) => {
    const angle = (i / parts.length) * 2 * Math.PI - Math.PI / 2;
    const x = cx + Math.cos(angle) * R, y = cy + Math.sin(angle) * R * 0.8, color = COLORS[i % COLORS.length];
    svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${color}" stroke-width="3"/>`;
    part.items.slice(0, 3).forEach((item, j) => {
      const a = angle + (j - 1) * 0.35, x2 = x + Math.cos(a) * 120, y2 = y + Math.sin(a) * 70;
      svg += `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" opacity=".5"/>` +
        `<text x="${x2}" y="${y2}" font-size="11" text-anchor="middle" fill="currentColor">${esc(clip(item, 30))}</text>`;
    });
    svg += `<rect x="${x - 75}" y="${y - 18}" width="150" height="36" rx="18" fill="${color}"/>` +
      `<text x="${x}" y="${y + 5}" font-size="13" fill="#fff" text-anchor="middle" font-weight="700">${esc(clip(part.title, 20))}</text>`;
  });
  svg += `<rect x="${cx - 95}" y="${cy - 24}" width="190" height="48" rx="24" fill="#1d2140"/>` +
    `<text x="${cx}" y="${cy + 6}" font-size="15" fill="#fff" text-anchor="middle" font-weight="800">${esc(clip(title, 24))}</text></svg>`;
  return svg;
}

function makeMindmap() {
  showTab('resumo');
  const parts = topics($('notes').value, $('title').value);
  if (!parts.length) return toast('Sem conteúdo nas notas');
  $('mindmap').innerHTML = mindmapSvg($('title').value, parts);
}

/** Flashcards de lacuna: a palavra-chave de cada frase vira a resposta. */
export function flashcards(notes, max = 12) {
  return sentences(notes).slice(0, max).map(sentence => {
    const answer = keywords(sentence, 1)[0] ?? '';
    return { question: answer ? sentence.replace(new RegExp(answer, 'i'), '_____') : sentence, answer };
  });
}

function makeFlashcards() {
  showTab('resumo');
  const cards = flashcards($('notes').value);
  if (!cards.length) return toast('Sem conteúdo nas notas');
  $('flash').innerHTML = cards.map(c => `
    <div class="card flashcard" data-action="flash.flip">
      <div>${esc(c.question)}</div><b class="hidden">→ ${esc(c.answer)}</b>
    </div>`).join('');
}

on('lesson:open', lesson => {
  $('summary').textContent = lesson.summary ?? PLACEHOLDER;
  $('mindmap').innerHTML = '';
  $('flash').innerHTML = '';
});

register({
  'summary.make': makeSummary,
  'summary.mindmap': makeMindmap,
  'summary.flashcards': makeFlashcards,
  'flash.flip': (_, el) => el.querySelector('b').classList.toggle('hidden'),
});
