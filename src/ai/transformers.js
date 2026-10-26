// Carregamento único do Transformers.js (modelos de IA rodando no navegador).
// Usado pela busca por significado (embeddings) e pela transcrição local (Whisper).

const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

let libraryPromise = null;

export function loadTransformers() {
  libraryPromise ??= import(LIBRARY_URL).then(lib => {
    lib.env.allowLocalModels = false; // baixa direto do Hugging Face, sem procurar /models/ no nosso site
    return lib;
  });
  libraryPromise.catch(() => (libraryPromise = null));
  return libraryPromise;
}

/**
 * Cria um pipeline e informa o andamento do download (soma de todos os arquivos do modelo).
 * Na primeira vez o modelo é baixado; depois fica no cache do navegador.
 */
export async function createPipeline(task, model, onProgress) {
  const { pipeline } = await loadTransformers();
  const files = {};
  return pipeline(task, model, {
    quantized: true,
    progress_callback: p => {
      if (p.status !== 'progress' || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      const [loaded, total] = Object.values(files).reduce(([a, b], [l, t]) => [a + l, b + t], [0, 0]);
      onProgress?.(Math.round((loaded / total) * 100));
    },
  });
}
