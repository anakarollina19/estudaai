// Busca por significado com embeddings, rodando no próprio navegador (Transformers.js).
// O modelo multilíngue transforma cada texto num vetor de 384 números; textos com sentido
// parecido ficam próximos, mesmo sem palavras em comum ("divisão celular" ~ "mitose").
// Na primeira vez o modelo (~120 MB) é baixado; depois fica no cache do navegador.

import { bm25, fuseRankings } from './search.js';
import { createPipeline } from '../ai/transformers.js';

export const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

let extractorPromise = null;
const cache = new Map(); // texto -> vetor

/** Carrega o modelo uma única vez. `onProgress(pct)` recebe o andamento do download. */
export function loadEmbedder(onProgress) {
  extractorPromise ??= createPipeline('feature-extraction', EMBEDDING_MODEL, onProgress);
  extractorPromise.catch(() => (extractorPromise = null)); // permite tentar de novo
  return extractorPromise;
}

export const isEmbedderLoaded = () => extractorPromise !== null;

/** Vetores normalizados (comprimento 1) para cada texto, com cache. */
export async function embed(texts) {
  const extractor = await loadEmbedder();
  const missing = [...new Set(texts.filter(t => !cache.has(t)))];
  for (let i = 0; i < missing.length; i += 16) {
    const batch = missing.slice(i, i + 16);
    const output = await extractor(batch, { pooling: 'mean', normalize: true });
    output.tolist().forEach((vector, j) => cache.set(batch[j], vector));
  }
  return texts.map(t => cache.get(t));
}

/** Como os vetores já são normalizados, o produto escalar é a similaridade do cosseno. */
export const cosine = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

const chunkText = c => `${c.lesson}. ${c.text}`;

export async function semanticSearch(query, chunks, k = 5) {
  if (!chunks.length) return [];
  const [queryVector, ...chunkVectors] = await embed([query, ...chunks.map(chunkText)]);
  return chunks
    .map((chunk, i) => ({ ...chunk, score: cosine(queryVector, chunkVectors[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Híbrida: junta o ranking por palavras (BM25) e por significado com Reciprocal Rank Fusion. */
export async function hybridSearch(query, chunks, k = 5) {
  const depth = Math.max(10, k * 2);
  const [lexical, semantic] = [bm25(query, chunks, depth), await semanticSearch(query, chunks, depth)];
  return fuseRankings([lexical, semantic], k);
}
