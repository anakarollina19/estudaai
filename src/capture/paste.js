// Colar: imagens coladas (Ctrl+V de um print ou de uma foto copiada) viram fotos da aula,
// com leitura do texto; texto colado pelo botão 📋 Colar vai para onde o cursor estava.

import { toast } from '../core/dom.js';
import { register } from '../core/actions.js';
import { processImages } from './ocr.js';
import { insertAtCursor } from '../library.js';

const appOpen = () => !document.getElementById('app').classList.contains('hidden');

// Ctrl+V em qualquer lugar do app: se tiver imagem, anexa. Texto segue o comportamento normal.
document.addEventListener('paste', e => {
  if (!appOpen()) return;
  const images = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
  if (!images.length) return;
  e.preventDefault();
  toast(`🖼️ ${images.length} imagem(ns) colada(s): lendo o texto...`);
  processImages(images.map((f, i) => new File([f], `colada-${Date.now()}-${i + 1}.png`, { type: f.type })));
});

/** Botão 📋 Colar: lê a área de transferência (pede permissão na 1ª vez). */
async function pasteButton() {
  if (!navigator.clipboard?.read) return toast('Use Ctrl+V para colar neste navegador');
  try {
    const items = await navigator.clipboard.read();
    const images = [];
    let text = '';
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (imageType) images.push(new File([await item.getType(imageType)], `colada-${Date.now()}.png`, { type: imageType }));
      else if (item.types.includes('text/plain')) text += await (await item.getType('text/plain')).text();
    }
    if (images.length) processImages(images);
    if (text) {
      insertAtCursor(text);
      toast('📋 Texto colado na anotação');
    }
    if (!images.length && !text) toast('A área de transferência está vazia');
  } catch {
    toast('O navegador bloqueou o acesso. Use Ctrl+V para colar.');
  }
}

register({ 'capture.paste': pasteButton });
