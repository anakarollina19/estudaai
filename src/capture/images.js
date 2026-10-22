// Armazenamento das imagens no IndexedDB.
// O localStorage (~5 MB) guarda só os dados das aulas; as fotos, que são pesadas, ficam
// aqui (centenas de MB). As aulas guardam apenas o id de cada imagem.
//
// Uso: antes de abrir uma aula, `loadImages(ids)` coloca as imagens no cache em memória;
// depois `imageSrc(id)` devolve o data URL de forma síncrona (para renderizar).

const DB_NAME = 'estudaai';
const STORE = 'images';
export const MAX_IMAGES_PER_LESSON = 100;

const cache = new Map(); // id -> data URL
let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function request(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function putImage(id, src) {
  cache.set(id, src);
  await request('readwrite', store => store.put(src, id));
}

export async function deleteImage(id) {
  cache.delete(id);
  await request('readwrite', store => store.delete(id));
}

/** Carrega no cache as imagens que ainda não estão em memória. */
export async function loadImages(ids) {
  const missing = ids.filter(id => id && !cache.has(id));
  if (!missing.length) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    for (const id of missing) {
      const req = store.get(id);
      req.onsuccess = () => req.result && cache.set(id, req.result);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export const imageSrc = id => cache.get(id) ?? '';

/** Todos os ids de imagem usados por uma aula (galeria e slides). */
export const lessonImageIds = lesson => [
  ...(lesson.images ?? []).map(i => i.id),
  ...(lesson.slides ?? []).map(s => s.imgId).filter(Boolean),
];

/**
 * Versões antigas guardavam o data URL dentro da aula (`image.src`, `slide.img`).
 * Move para o IndexedDB e deixa só o id. Devolve true se mudou algo.
 */
export async function migrateLesson(lesson, makeId) {
  let changed = false;
  for (const image of lesson.images ?? []) {
    if (image.src) {
      await putImage(image.id, image.src);
      delete image.src;
      changed = true;
    }
  }
  for (const slide of lesson.slides ?? []) {
    if (slide.img) {
      slide.imgId = makeId();
      await putImage(slide.imgId, slide.img);
      delete slide.img;
      changed = true;
    }
  }
  return changed;
}

/** Carrega um data URL como <img>. */
const loadImg = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('imagem inválida'));
  img.src = src;
});

/**
 * Junta várias imagens numa colagem em grade (JPEG). Cada imagem é encaixada na sua
 * célula sem cortar. Com 1–2 imagens a grade é uma linha; com 4, 2×2; com 9, 3×3...
 */
export async function collage(srcs, { width = 1600, gap = 12, background = '#ffffff' } = {}) {
  const imgs = await Promise.all(srcs.map(loadImg));
  const cols = imgs.length <= 2 ? imgs.length : Math.ceil(Math.sqrt(imgs.length));
  const rows = Math.ceil(imgs.length / cols);
  const cellW = (width - gap * (cols + 1)) / cols;
  const cellH = cellW * 0.75;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(rows * cellH + gap * (rows + 1));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  imgs.forEach((img, i) => {
    const x = gap + (i % cols) * (cellW + gap);
    const y = gap + Math.floor(i / cols) * (cellH + gap);
    const k = Math.min(cellW / img.width, cellH / img.height);
    const w = img.width * k, h = img.height * k;
    ctx.drawImage(img, x + (cellW - w) / 2, y + (cellH - h) / 2, w, h);
  });
  return canvas.toDataURL('image/jpeg', 0.8);
}
