// Resumo, mapa mental e flashcards a partir das notas da aula aberta.

import { $, esc, toast } from '../core/dom.js';
import { register } from '../core/actions.js';
import { on } from '../core/events.js';
import { currentLesson, save } from '../core/store.js';
import { tryComplete, hasKey } from '../ai/claude.js';
import { offlineSummary, topics, sentences, keywords } from '../text/nlp.js';
import { clip } from '../core/util.js';
import { showTab } from '../tabs.js';
import { award, confetti } from './xp.js';

const PLACEHOLDER = 'Clique em “📝 Resumo” na barra Gerar.';

async function makeSummary() {
  showTab('resumo');
  const lesson = currentLesson();
  const notes = currentLesson().notes;
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
  award(10, 'pelo resumo 📝');
}

const COLORS = ['#8a78e0', '#e48fb5', '#5bb894', '#e8b45a', '#6fa8dc', '#e58d7a'];

/** Desenha o mapa mental em SVG: aula no centro, tópicos ao redor e até 3 ideias por tópico. */
export function mindmapSvg(title, parts) {
  parts = parts.slice(0, 8);
  const W = 1000, H = 560, cx = W / 2, cy = H / 2, rx = 300, ry = 190, CHAR = 6.2;
  const box = { x1: cx - 100, y1: cy - 30, x2: cx + 100, y2: cy + 30 };
  const grow = (x1, y1, x2, y2) => {
    box.x1 = Math.min(box.x1, x1); box.y1 = Math.min(box.y1, y1);
    box.x2 = Math.max(box.x2, x2); box.y2 = Math.max(box.y2, y2);
  };
  let lines = '', nodes = '';
  parts.forEach((part, i) => {
    const angle = (i / parts.length) * 2 * Math.PI - Math.PI / 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const x = cx + cos * rx, y = cy + sin * ry, color = COLORS[i % COLORS.length];
    lines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${color}" stroke-width="3"/>`;
    const items = part.items.slice(0, 3).map(item => clip(item, 34));
    // Ideias empilhadas para fora do tópico: à direita, à esquerda, acima ou abaixo.
    const side = Math.abs(cos) > 0.35 ? (cos > 0 ? 'right' : 'left') : (sin > 0 ? 'below' : 'above');
    items.forEach((item, j) => {
      const width = item.length * CHAR;
      let tx, ty, anchor;
      if (side === 'right' || side === 'left') {
        const dir = side === 'right' ? 1 : -1;
        tx = x + dir * 92; ty = y + (j - (items.length - 1) / 2) * 18 + 4;
        anchor = dir > 0 ? 'start' : 'end';
        grow(dir > 0 ? tx : tx - width, ty - 12, dir > 0 ? tx + width : tx, ty + 4);
      } else {
        const dir = side === 'below' ? 1 : -1;
        tx = x; ty = y + dir * (36 + j * 18) + (dir > 0 ? 8 : 0);
        anchor = 'middle';
        grow(tx - width / 2, ty - 12, tx + width / 2, ty + 4);
      }
      if (anchor !== 'middle') lines += `<line x1="${x}" y1="${y}" x2="${tx - (anchor === 'start' ? 4 : -4)}" y2="${ty - 4}" stroke="${color}" opacity=".35"/>`;
      nodes += `<text x="${tx}" y="${ty}" font-size="12" text-anchor="${anchor}" fill="currentColor">${esc(item)}</text>`;
    });
    grow(x - 80, y - 20, x + 80, y + 20);
    nodes += `<rect x="${x - 78}" y="${y - 18}" width="156" height="36" rx="18" fill="${color}"/>` +
      `<text x="${x}" y="${y + 5}" font-size="13" fill="#fff" text-anchor="middle" font-weight="700">${esc(clip(part.title, 20))}</text>`;
  });
  nodes += `<rect x="${cx - 100}" y="${cy - 24}" width="200" height="48" rx="24" fill="#2a2140"/>` +
    `<text x="${cx}" y="${cy + 6}" font-size="15" fill="#fff" text-anchor="middle" font-weight="800">${esc(clip(title, 24))}</text>`;
  const pad = 16, vx = box.x1 - pad, vy = box.y1 - pad, vw = box.x2 - box.x1 + 2 * pad, vh = box.y2 - box.y1 + 2 * pad;
  return `<svg viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui">${lines}${nodes}</svg>`;
}

function makeMindmap() {
  showTab('resumo');
  const parts = topics(currentLesson().notes, $('title').value);
  if (!parts.length) return toast('Escreva algo nas anotações da aula para gerar o mapa mental');
  $('mindmap').innerHTML = mindmapSvg($('title').value, parts);
  award(5, 'pelo mapa mental 🧠');
}

/** Flashcards de lacuna: a palavra-chave de cada frase vira a resposta. */
export function flashcards(notes, max = 12) {
  return sentences(notes).slice(0, max).map(sentence => {
    const answer = keywords(sentence, 1)[0] ?? '';
    return { question: answer ? sentence.replace(new RegExp(answer, 'i'), '_____') : sentence, answer };
  });
}

// ----- Modo estudo dos flashcards: um cartão por vez, vira em 3D, "sabia" ou "ainda não" -----

let study = null; // { cards, i, known, again }

function makeFlashcards() {
  showTab('resumo');
  const cards = flashcards(currentLesson().notes);
  if (!cards.length) return toast('Sem conteúdo nas notas');
  study = { cards, i: 0, known: 0, again: [] };
  renderCard();
  $('flash').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderCard() {
  const { cards, i, known } = study;
  if (i >= cards.length) return renderResult();
  const c = cards[i];
  $('flash').innerHTML = `
    <div class="fc-progress"><span>${i + 1} de ${cards.length}</span><span>😎 ${known}</span>
      <div class="xp-track"><i style="width:${(i / cards.length) * 100}%"></i></div></div>
    <div class="fc" data-action="flash.flip" title="Clique para virar">
      <div class="fc-inner">
        <div class="fc-face fc-front"><small>Complete a frase</small>${esc(c.question)}<em>toque para virar ↻</em></div>
        <div class="fc-face fc-back"><small>Resposta</small><b>${esc(c.answer)}</b></div>
      </div>
    </div>
    <div class="fc-actions">
      <button class="chunky warn" data-action="flash.rate" data-arg="0">😅 Ainda não</button>
      <button class="chunky ok" data-action="flash.rate" data-arg="1">😎 Sabia!</button>
    </div>`;
}

function rate(knew) {
  if (knew === '1') {
    study.known++;
    award(2);
  } else {
    study.again.push(study.cards[study.i]);
  }
  study.i++;
  renderCard();
}

function renderResult() {
  const { cards, known, again } = study;
  const pct = Math.round((known / cards.length) * 100);
  if (pct >= 70) confetti();
  $('flash').innerHTML = `
    <div class="fc-result">
      <div class="fc-score">${pct >= 70 ? '🏆' : pct >= 40 ? '💪' : '📚'} ${pct}%</div>
      <p>Você sabia <b>${known}</b> de <b>${cards.length}</b> cartões.</p>
      <div class="fc-actions">
        ${again.length ? `<button class="chunky" data-action="flash.again">🔁 Revisar os ${again.length} que faltaram</button>` : ''}
        <button class="ghost" data-action="summary.flashcards">Recomeçar</button>
      </div>
    </div>`;
}

function reviewAgain() {
  study = { cards: study.again, i: 0, known: 0, again: [] };
  renderCard();
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
  'flash.flip': (_, el) => el.classList.toggle('flipped'),
  'flash.rate': rate,
  'flash.again': reviewAgain,
});
