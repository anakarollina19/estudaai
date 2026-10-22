// Fotos do quadro: reduz a imagem, extrai o texto (Tesseract.js), resume e guarda na aula.

import { $, esc, toast, sure } from '../core/dom.js';
import { register } from '../core/actions.js';
import { on } from '../core/events.js';
import { currentLesson, save } from '../core/store.js';
import { pickImagesFromDir } from '../core/files.js';
import { uid, timeHM } from '../core/util.js';
import { tryComplete } from '../ai/claude.js';
import { sentences, keywords, toItems } from '../text/nlp.js';
import { appendNotes } from '../library.js';

/** Redimensiona para no máximo `max` px e devolve um data URL JPEG (cabe no localStorage). */
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

async function recognize(src, onProgress) {
  const result = await window.Tesseract.recognize(src, 'por+eng', {
    logger: m => m.status === 'recognizing text' && onProgress?.(Math.round(m.progress * 100)),
  });
  return result.data.text.trim();
}

/** Resumo do texto de uma foto: com IA (corrigindo erros do OCR) ou as primeiras frases. */
async function summarizeBoard(text, maxItems) {
  const ai = await tryComplete(
    `Resuma em até ${maxItems} tópicos curtos, em português, o conteúdo deste texto extraído de uma ` +
    'foto de quadro de aula (corrija erros de leitura). Um tópico por linha:\n' + text
  );
  if (ai) return ai;
  return sentences(text).slice(0, maxItems).map(s => '• ' + s).join('\n') || keywords(text, 6).join(', ');
}

/**
 * Lê uma imagem e a guarda na aula aberta.
 * Devolve { src, text, sum, items, time } para quem chamou (galeria ou slides).
 */
export async function readImage(file, { onProgress, maxItems = 3 } = {}) {
  const src = await shrinkImage(file);
  const text = await recognize(src, onProgress);
  const sum = await summarizeBoard(text, maxItems);
  const image = { id: uid(), src, text, sum, time: timeHM(), name: file.name || 'foto' };
  const lesson = currentLesson();
  (lesson.images ??= []).push(image);
  save();
  renderGallery();
  return { ...image, items: toItems(sum).slice(0, 5) };
}

async function processImages(files) {
  const status = $('ocrSt');
  for (const [i, file] of files.entries()) {
    const tag = files.length > 1 ? ` (${i + 1}/${files.length})` : '';
    try {
      const image = await readImage(file, { onProgress: p => (status.textContent = `Lendo texto${tag}... ${p}%`) });
      appendNotes(`\n# Quadro ${image.time}\n${image.text}`);
    } catch (e) {
      toast(`Erro na imagem ${file.name ?? ''}: ${e.message}`);
    }
  }
  status.textContent = `✅ ${files.length} imagem(ns) lida(s), resumida(s) e guardada(s) na aula`;
}

export function renderGallery() {
  const images = currentLesson()?.images ?? [];
  $('gallery').innerHTML = images.map(image => `
    <div class="card flat" style="margin-top:10px">
      <img class="ocrimg" src="${image.src}" alt="Foto do quadro ${esc(image.time)}">
      <div class="row between" style="margin-top:6px">
        <b>🕒 ${esc(image.time)} · ${esc(image.name)}</b>
        <span>
          <button class="icon" data-action="gallery.text">📄 Texto</button>
          <button class="icon" data-action="gallery.delete" data-arg="${image.id}">🗑️</button>
        </span>
      </div>
      <div class="pre" style="font-size:14px">${esc(image.sum)}</div>
      <div class="pre muted hidden" style="font-size:13px;margin-top:6px">${esc(image.text)}</div>
    </div>`).join('');
}

async function deleteImage(id) {
  if (!(await sure('Remover esta imagem da aula?'))) return;
  const lesson = currentLesson();
  lesson.images = lesson.images.filter(i => i.id !== id);
  save();
  renderGallery();
}

on('lesson:open', renderGallery);

register({
  'ocr.files': async input => {
    await processImages([...input.files]);
    input.value = '';
  },
  'ocr.folder': async () => {
    const files = await pickImagesFromDir();
    if (files.length) processImages(files);
  },
  'gallery.text': (_, el) => el.closest('.card').querySelector('.muted').classList.toggle('hidden'),
  'gallery.delete': deleteImage,
});
