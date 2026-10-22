// Quadro branco em canvas: caneta, borracha, texto, caixas, desfazer. Salvo como PNG na aula.

import { $, ask } from './core/dom.js';
import { register } from './core/actions.js';
import { on } from './core/events.js';
import { currentLesson, save } from './core/store.js';
import { saveFile } from './core/files.js';

let canvas, ctx;
let tool = 'pen';
let drawing = false;
let start = null;     // ponto inicial (para caixas)
let snapshot = null;  // imagem antes da caixa atual
const history = [];

export function initBoard() {
  canvas = $('board');
  ctx = canvas.getContext('2d');
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onUp);
}

function point(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}

function pushHistory() {
  history.push(canvas.toDataURL());
  if (history.length > 30) history.shift();
}

async function onDown(e) {
  const p = point(e);
  pushHistory();
  if (tool === 'text') {
    const text = await ask('Texto para o quadro:');
    if (text) {
      ctx.fillStyle = $('pen').value;
      ctx.font = `${$('size').value * 4 + 10}px system-ui`;
      ctx.fillText(text, p.x, p.y);
      persist();
    }
    return;
  }
  drawing = true;
  start = p;
  snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
}

function onMove(e) {
  if (!drawing) return;
  const p = point(e);
  const eraser = tool === 'eraser';
  ctx.lineCap = 'round';
  ctx.lineWidth = $('size').value * (eraser ? 5 : 1);
  ctx.strokeStyle = eraser ? '#fff' : $('pen').value;
  if (tool === 'rect') {
    ctx.putImageData(snapshot, 0, 0);
    ctx.strokeRect(start.x, start.y, p.x - start.x, p.y - start.y);
  } else {
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

function onUp() {
  if (!drawing) return;
  drawing = false;
  persist();
}

function paint(dataUrl) {
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.src = dataUrl;
}

/** O canvas só tem tamanho quando a aba está visível; ajusta e redesenha a aula. */
function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  paint(currentLesson()?.board);
}

function persist() {
  currentLesson().board = canvas.toDataURL('image/png');
  save();
}

on('lesson:open', lesson => {
  history.length = 0;
  paint(lesson.board);
});
on('tab:show', name => name === 'quadro' && resize());

register({
  'board.tool': name => (tool = name),
  'board.undo': () => {
    const previous = history.pop();
    if (!previous) return;
    paint(previous);
    setTimeout(persist, 50);
  },
  'board.clear': () => {
    pushHistory();
    paint(null);
    persist();
  },
  'board.png': () => canvas.toBlob(blob => saveFile(currentLesson().title + ' - quadro.png', blob)),
});
