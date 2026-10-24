// Slides interativos: gerados das notas (ou pela IA), com imagens, revelação de tópicos,
// explicação e quiz por slide.

import { $, esc, toast, sure, show } from '../core/dom.js';
import { register } from '../core/actions.js';
import { on } from '../core/events.js';
import { currentLesson, save } from '../core/store.js';
import { tryComplete, extractJson, hasKey } from '../ai/claude.js';
import { topics, sentences, keywords, toItems, capitalize } from '../text/nlp.js';
import { clip } from '../core/util.js';
import { award, confetti } from '../study/xp.js';
import { uid } from '../core/util.js';
import { readImage, summarizeBoard, limitFiles } from '../capture/ocr.js';
import { imageSrc, putImage, collage } from '../capture/images.js';
import { showTab } from '../tabs.js';

// Estado da apresentação. `deck` é o próprio array salvo em lesson.slides.
let deck = [];
let index = 0;
let step = 0;      // quantos tópicos do slide atual já apareceram
let quizAnswer = -1;

const ALL = 99;    // "mostrar todos os tópicos"

export const currentSlides = () => deck;

const titleSlide = lesson => ({ title: lesson.title, items: [lesson.created] });

/** Slides a partir das notas (sem IA): um por tópico "# ...", e um por foto do quadro. */
const imageSlide = image => ({
  title: '📷 Quadro ' + image.time,
  items: toItems(image.sum).slice(0, 4),
  imgId: image.id,
});

export function slidesFromNotes(lesson) {
  const images = lesson.images ?? [];
  const fromTopics = topics(lesson.notes, lesson.title)
    // as seções "# Quadro 10:42" criadas pelo OCR viram slides com a foto, logo abaixo
    .filter(t => !(images.length && /^quadro \d/i.test(t.title)))
    .map(t => ({ title: t.title, items: t.items.slice(0, 5).map(s => clip(s, 110)) }));
  const fromImages = images.map(imageSlide);
  return [titleSlide(lesson), ...fromTopics, ...fromImages];
}

async function build() {
  showTab('slides');
  const lesson = currentLesson();
  toast('Gerando slides...');
  const ai = extractJson(await tryComplete(
    'Transforme esta aula em 6 a 10 slides didáticos. Responda SOMENTE JSON: ' +
    '[{"title":"...","items":["...","..."]}], no máximo 5 itens curtos por slide. Aula:\n' + lesson.notes
  ));
  if (Array.isArray(ai) && ai.length) {
    const images = slidesFromNotes(lesson).filter(s => s.imgId);
    lesson.slides = [titleSlide(lesson), ...ai, ...images];
  } else {
    lesson.slides = slidesFromNotes(lesson);
  }
  load(lesson);
  persist();
}

function load(lesson) {
  lesson.slides ??= [];
  deck = lesson.slides;
  index = 0;
  step = 0;
  render();
}

function persist() {
  save();
  render();
}

function render() {
  const slide = deck[index];
  show($('slideAI'), false);
  if (!slide) {
    $('slideStage').innerHTML = '<h2>Gere os slides a partir das suas notas</h2>';
    return;
  }
  const revealAll = index === 0;
  const list = `<ul>${slide.items.map((item, i) =>
    `<li class="${revealAll || i < step ? 'show' : ''}">${esc(item)}</li>`).join('')}</ul>`;
  const body = slide.imgId
    ? `<div class="slide-img"><img src="${imageSrc(slide.imgId)}" alt="">${list}</div>`
    : list;
  $('slideStage').innerHTML = `<h2>${esc(slide.title)}</h2>${body}<div class="num">${index + 1}/${deck.length}</div>`;
}

// ----- Navegação -----

function next() {
  const slide = deck[index];
  if (!slide) return;
  if (index > 0 && step < slide.items.length) {
    step++;
    render();
  } else {
    nextSlide();
  }
}

function nextSlide() {
  if (index < deck.length - 1) {
    index++;
    step = 0;
    render();
  }
}

function prev() {
  if (index > 0) {
    index--;
    step = ALL;
    render();
  }
}

function present() {
  $('slideStage').requestFullscreen?.().catch(() => toast('Tela cheia indisponível aqui'));
}

// ----- Edição -----

function ensureDeck() {
  if (!deck.length) {
    const lesson = currentLesson();
    lesson.slides = [titleSlide(lesson)];
    deck = lesson.slides;
  }
}

function edit() {
  const slide = deck[index];
  if (!slide) return add();
  $('seTitle').value = slide.title;
  $('seItems').value = slide.items.join('\n');
  show($('slideEdit'));
}

function saveEdit() {
  const slide = deck[index];
  slide.title = $('seTitle').value.trim() || 'Slide';
  slide.items = toItems($('seItems').value);
  show($('slideEdit'), false);
  step = ALL;
  persist();
}

function add() {
  ensureDeck();
  deck.splice(index + 1, 0, { title: 'Novo slide', items: ['Escreva aqui'] });
  index++;
  step = ALL;
  persist();
  edit();
}

async function remove() {
  const slide = deck[index];
  if (!slide) return toast('Não há slide para excluir');
  if (!(await sure(`Excluir o slide "${slide.title}"?`))) return;
  deck.splice(index, 1);
  index = Math.max(0, index - 1);
  persist();
}

// ----- IA no slide -----

function aiBox(text) {
  const box = $('slideAI');
  box.textContent = text;
  show(box);
  return box;
}

const progress = p => aiBox(`Lendo imagem... ${p}%`);

/** Lê vários arquivos (OCR + resumo), respeitando o limite de imagens da aula. */
async function readFiles(input) {
  const files = limitFiles([...input.files]);
  input.value = '';
  const images = [];
  for (const [i, file] of files.entries()) {
    try {
      const tag = files.length > 1 ? ` ${i + 1} de ${files.length}` : '';
      images.push(await readImage(file, { onProgress: p => aiBox(`Lendo imagem${tag}... ${p}%`), maxItems: 4 }));
    } catch (e) {
      toast('Erro: ' + e.message);
    }
  }
  return images;
}

function insertSlide(slide) {
  ensureDeck();
  deck.splice(index + 1, 0, slide);
  index++;
  step = ALL;
  persist();
}

// Palavras que aparecem em quase toda foto de aula e não dizem o assunto.
const GENERIC = /^(quadro|foto|imagem|aula|exemplo|professor|professora)$/;

const titleFrom = (text, fallback) =>
  '📷 ' + capitalize(keywords(text, 6).find(w => !GENERIC.test(w)) ?? fallback);

/** Um slide por imagem (imagem ao lado do resumo dela). */
function imageSlides(images) {
  showTab('slides');
  for (const image of images) {
    const items = image.items ?? toItems(image.sum).slice(0, 5);
    insertSlide({
      title: titleFrom(image.text, 'Imagem ' + image.time),
      items: items.length ? items : ['(sem texto na imagem)'],
      imgId: image.id,
      text: image.text,
    });
  }
  aiBox(`✅ ${images.length} slide(s) criado(s)`);
}

/**
 * Junta várias imagens num único slide: colagem em grade + um resumo do texto de todas.
 * A colagem também vai para o PDF dos slides.
 */
async function mergeImages(images) {
  showTab('slides');
  if (images.length < 2) return images.length ? imageSlides(images) : toast('Escolha pelo menos 2 imagens');
  aiBox(`Juntando ${images.length} imagens...`);
  try {
    const srcs = images.map(i => i.src ?? imageSrc(i.id)).filter(Boolean);
    const imgId = uid();
    await putImage(imgId, await collage(srcs));
    const text = images.map(i => i.text).join('\n\n');
    aiBox('Resumindo o conteúdo das imagens...');
    const items = toItems(await summarizeBoard(text, 5)).slice(0, 5);
    insertSlide({
      title: titleFrom(text, `${images.length} imagens`),
      items: items.length ? items : ['(sem texto nas imagens)'],
      imgId,
      text,
    });
    aiBox(`✅ ${images.length} imagens juntadas em 1 slide` + (hasKey() ? '' : ' (resumo offline: com a chave de IA em ⚙️ fica melhor)'));
  } catch (e) {
    aiBox('Erro ao juntar as imagens: ' + e.message);
  }
}

async function addImages(input) {
  const images = await readFiles(input);
  if (images.length) imageSlides(images);
}

async function mergeFiles(input) {
  const images = await readFiles(input);
  if (images.length) mergeImages(images);
}

async function imageToSlide(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const slide = deck[index];
  if (!slide) return toast('Gere ou crie um slide primeiro');
  try {
    const image = await readImage(file, { onProgress: progress, maxItems: 4 });
    slide.imgId = image.id;
    slide.text = ((slide.text ?? '') + '\n' + image.text).trim();
    if (index > 0 && image.items.length && (await sure('Adicionar o resumo da imagem aos tópicos do slide?'))) {
      slide.items = [...slide.items, ...image.items].slice(0, 6);
    }
    step = ALL;
    persist();
  } catch (e) {
    toast('Erro: ' + e.message);
  }
}

async function summarize() {
  const slide = deck[index];
  if (!slide) return toast('Gere ou crie um slide primeiro');
  const source = [slide.title, ...slide.items, slide.text ?? ''].join('\n');
  aiBox('Resumindo...');
  const ai = await tryComplete(
    'Reescreva este slide de aula como no máximo 4 tópicos curtos e didáticos, em português. ' +
    'Um tópico por linha, sem numeração:\n' + source
  );
  const offline = () => {
    const unique = [...new Set(sentences(source))];
    return (unique.length ? unique : slide.items).slice(0, 4).map(s => clip(s, 90));
  };
  slide.items = ai ? toItems(ai).slice(0, 4) : offline();
  step = ALL;
  persist();
  aiBox('✅ Slide resumido' + (hasKey() ? '' : ' (modo offline: com a chave de IA em ⚙️ o resumo fica melhor)'));
}

async function explain() {
  const slide = deck[index];
  if (!slide) return;
  aiBox('Pensando...');
  const ai = await tryComplete(
    `Explique de forma simples, com um exemplo do dia a dia, para um estudante: ${slide.title} — ${slide.items.join('; ')}`
  );
  aiBox(ai ?? 'Adicione sua chave de IA em ⚙️ para explicações. Enquanto isso: ' + slide.items.join(' '));
}

/** Quiz offline: a resposta certa é um item do slide; as erradas vêm de outros slides. */
export function offlineQuiz(slides, i) {
  const slide = slides[i];
  const right = slide.items[0] ?? slide.title;
  const others = slides.flatMap(s => s.items).filter(item => !slide.items.includes(item));
  const options = [right, ...others.sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
  return { q: `Qual afirmação pertence ao tópico "${slide.title}"?`, opts: options, ok: options.indexOf(right) };
}

async function quiz() {
  const slide = deck[index];
  if (!slide) return;
  aiBox('Criando quiz...');
  const ai = extractJson(await tryComplete(
    `Crie 1 pergunta de múltipla escolha sobre: ${slide.title} — ${slide.items.join('; ')}. ` +
    'Responda SOMENTE JSON {"q":"","opts":["","","",""],"ok":0}'
  ));
  const q = ai?.opts?.length ? ai : offlineQuiz(deck, index);
  quizAnswer = q.ok;
  aiBox('').innerHTML = `<b>${esc(q.q)}</b><div class="quiz">${
    q.opts.map((opt, i) => `<button data-action="slides.answer" data-arg="${i}">${esc(opt)}</button>`).join('')}</div>`;
}

function answer(i, el) {
  const right = Number(i) === quizAnswer;
  el.classList.add(right ? 'right' : 'wrong');
  if (right) {
    confetti(16);
    award(5, 'pela resposta certa ✅');
  }
}

// ----- Ligações -----

on('lesson:open', load);

document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if ($('slideStage').closest('.hidden')) return; // só na aba Slides
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    next();
  }
  if (e.key === 'ArrowLeft') prev();
});

register({
  'slides.build': build,
  'slides.next': next,
  'slides.nextSlide': nextSlide,
  'slides.prev': prev,
  'slides.present': present,
  'slides.edit': edit,
  'slides.saveEdit': saveEdit,
  'slides.cancelEdit': () => show($('slideEdit'), false),
  'slides.add': add,
  'slides.delete': remove,
  'slides.addImages': addImages,
  'slides.mergeFiles': mergeFiles,
  'slides.mergeImages': mergeImages,
  'slides.imageSlides': imageSlides,
  'slides.imageToSlide': imageToSlide,
  'slides.summarize': summarize,
  'slides.explain': explain,
  'slides.quiz': quiz,
  'slides.answer': answer,
});
