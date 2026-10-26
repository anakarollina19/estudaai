// Fotos do quadro: reduz a imagem, extrai o texto (Tesseract.js), resume e guarda na aula.
// A galeria permite selecionar imagens e juntá-las num slide.

import { $, esc, toast, sure, show } from '../core/dom.js';
import { register, run } from '../core/actions.js';
import { on } from '../core/events.js';
import { currentLesson, save } from '../core/store.js';
import { pickImagesFromDir } from '../core/files.js';
import { uid, timeHM } from '../core/util.js';
import { tryComplete } from '../ai/claude.js';
import { sentences, keywords, toItems } from '../text/nlp.js';
import { appendNotes } from '../library.js';
import { recordingTime } from './audio.js';
import { putImage, deleteImage as deleteStored, imageSrc, MAX_IMAGES_PER_LESSON } from './images.js';

/** Redimensiona para no máximo `max` px e devolve um data URL JPEG. */
export function shrinkImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * k;
      canvas.height = img.height * k;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => reject(new Error('não foi possível abrir a imagem'));
    img.src = URL.createObjectURL(file);
  });
}

// Um único "worker" do Tesseract para todas as imagens: carregar o modelo de idioma
// é a parte lenta, então reaproveitá-lo deixa lotes de dezenas de fotos bem mais rápidos.
let workerPromise = null;
let reportProgress = null;

function ocrWorker() {
  workerPromise ??= window.Tesseract.createWorker('por+eng', 1, {
    logger: m => m.status === 'recognizing text' && reportProgress?.(Math.round(m.progress * 100)),
  });
  workerPromise.catch(() => (workerPromise = null));
  return workerPromise;
}

async function recognize(src, onProgress) {
  const worker = await ocrWorker();
  reportProgress = onProgress;
  const { data } = await worker.recognize(src);
  return data.text.trim();
}

/** Resumo de texto de foto(s): com IA (corrigindo erros do OCR) ou as primeiras frases. */
export async function summarizeBoard(text, maxItems) {
  const ai = await tryComplete(
    `Resuma em até ${maxItems} tópicos curtos, em português, o conteúdo deste texto extraído de ` +
    'foto(s) de quadro de aula (corrija erros de leitura). Um tópico por linha:\n' + text
  );
  if (ai) return ai;
  return sentences(text).slice(0, maxItems).map(s => '• ' + s).join('\n') || keywords(text, 6).join(', ');
}

/** Quantas imagens ainda cabem na aula aberta. */
export const freeSlots = () => MAX_IMAGES_PER_LESSON - (currentLesson().images?.length ?? 0);

/**
 * Lê uma imagem e a guarda na aula aberta.
 * Devolve { id, src, text, sum, items, time } para quem chamou (galeria ou slides).
 */
export async function readImage(file, { onProgress, maxItems = 3 } = {}) {
  if (freeSlots() <= 0) throw new Error(`limite de ${MAX_IMAGES_PER_LESSON} imagens por aula`);
  const src = await shrinkImage(file);
  const text = await recognize(src, onProgress);
  const sum = await summarizeBoard(text, maxItems);
  const image = { id: uid(), text, sum, time: timeHM(), name: file.name || 'foto' };
  await putImage(image.id, src);
  (currentLesson().images ??= []).push(image);
  save();
  renderGallery();
  return { ...image, src, items: toItems(sum).slice(0, 5) };
}

/** Mantém só as imagens que cabem no limite e avisa se cortou alguma. */
export function limitFiles(files) {
  const slots = freeSlots();
  if (files.length > slots) {
    toast(`Esta aula aceita até ${MAX_IMAGES_PER_LESSON} imagens. Vou ler só ${Math.max(slots, 0)} de ${files.length}.`);
  }
  return files.slice(0, Math.max(slots, 0));
}

/** O andamento aparece na aba Foto & Áudio e na barra de captura (visível em qualquer aba). */
function setStatus(text) {
  $('ocrSt').textContent = text;
  $('capState').textContent = text;
}

export async function processImages(files) {
  files = limitFiles(files);
  if (!files.length) return;
  let ok = 0;
  for (const [i, file] of files.entries()) {
    const tag = files.length > 1 ? ` ${i + 1} de ${files.length}` : '';
    try {
      const image = await readImage(file, { onProgress: p => setStatus(`📷 Lendo imagem${tag}... ${p}%`) });
      // Foto tirada durante a gravação: anota em que minuto do áudio ela foi tirada.
      const rec = recordingTime();
      appendNotes(`\n# Quadro ${image.time}${rec ? ` (⏺ ${rec} da gravação)` : ''}\n${image.text}`);
      ok++;
    } catch (e) {
      toast(`Erro na imagem ${file.name ?? ''}: ${e.message}`);
    }
  }
  setStatus(`✅ ${ok} imagem(ns) lida(s) e guardada(s) · ${currentLesson().images.length}/${MAX_IMAGES_PER_LESSON} na aula`);
  setTimeout(() => $('capState').textContent.startsWith('✅') && ($('capState').textContent = ''), 6000);
}

// ----- Galeria com seleção -----

const selected = new Set();

export function renderGallery() {
  const images = currentLesson()?.images ?? [];
  for (const id of selected) if (!images.some(i => i.id === id)) selected.delete(id);
  show($('galleryTools'), images.length > 0);
  $('gallerySel').textContent = `${selected.size} selecionada(s) · ${images.length}/${MAX_IMAGES_PER_LESSON} na aula`;
  $('gallery').innerHTML = images.map(image => `
    <div class="card flat thumb ${selected.has(image.id) ? 'selected' : ''}">
      <label class="pick">
        <input type="checkbox" data-change="gallery.toggle" data-id="${image.id}" ${selected.has(image.id) ? 'checked' : ''}>
        <img class="ocrimg" src="${imageSrc(image.id)}" alt="Foto do quadro ${esc(image.time)}" loading="lazy">
      </label>
      <div class="row between" style="margin-top:6px">
        <b>🕒 ${esc(image.time)} · ${esc(image.name)}</b>
        <span>
          <button class="icon" data-action="gallery.text" title="Ver texto lido">📄</button>
          <button class="icon" data-action="gallery.delete" data-arg="${image.id}" title="Remover">🗑️</button>
        </span>
      </div>
      <div class="pre" style="font-size:14px">${esc(image.sum)}</div>
      <div class="pre muted hidden" style="font-size:13px;margin-top:6px">${esc(image.text)}</div>
    </div>`).join('');
}

const selectedImages = () => (currentLesson().images ?? []).filter(i => selected.has(i.id));

async function removeImage(id) {
  if (!(await sure('Remover esta imagem da aula?'))) return;
  const lesson = currentLesson();
  lesson.images = lesson.images.filter(i => i.id !== id);
  const usedBySlide = (lesson.slides ?? []).some(s => s.imgId === id);
  if (!usedBySlide) await deleteStored(id);
  save();
  renderGallery();
}

function useSelected(action) {
  const images = selectedImages();
  if (!images.length) return toast('Marque as imagens que quer usar');
  run(action, images);
  selected.clear();
  renderGallery();
}

on('lesson:open', () => {
  selected.clear();
  renderGallery();
});

register({
  'ocr.files': async input => {
    const files = [...input.files];
    input.value = '';
    await processImages(files);
  },
  'ocr.folder': async () => {
    const files = await pickImagesFromDir();
    if (files.length) processImages(files);
  },
  'gallery.toggle': input => {
    if (input.checked) selected.add(input.dataset.id);
    else selected.delete(input.dataset.id);
    renderGallery();
  },
  'gallery.selectAll': () => {
    const images = currentLesson().images ?? [];
    const all = images.every(i => selected.has(i.id));
    images.forEach(i => (all ? selected.delete(i.id) : selected.add(i.id)));
    renderGallery();
  },
  'gallery.merge': () => useSelected('slides.mergeImages'),
  'gallery.each': () => useSelected('slides.imageSlides'),
  'gallery.text': (_, el) => el.closest('.card').querySelector('.muted').classList.toggle('hidden'),
  'gallery.delete': removeImage,
});
