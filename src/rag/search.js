// Recuperação para o RAG: divide as aulas em trechos e ranqueia com BM25.
// Funções puras (recebem as pastas), para poder testar sem a interface.

import { tokenize } from '../text/nlp.js';

const CHUNK_SIZE = 700;
const CHUNK_STEP = 600; // 100 caracteres de sobreposição entre trechos de um texto longo

/**
 * Trechos de todas as aulas: cada tópico "# ..." ou parágrafo das notas (cortado em ~700
 * caracteres) e o texto de cada foto do quadro.
 */
export function buildChunks(folders) {
  const chunks = [];
  for (const folder of folders) {
    for (const lesson of folder.lessons) {
      const base = { lessonId: lesson.id, lesson: lesson.title, folder: folder.name };
      const sections = (lesson.notes ?? '')
        .split(/\n(?=#)|\n\s*\n/)
        .map(s => s.trim())
        .filter(s => s.length > 20);
      for (const section of sections) {
        for (let i = 0; i < section.length; i += CHUNK_STEP) {
          chunks.push({ ...base, source: 'notas', text: section.slice(i, i + CHUNK_SIZE) });
        }
      }
      for (const image of lesson.images ?? []) {
        if (image.text) chunks.push({ ...base, source: 'foto ' + image.time, text: image.text });
      }
    }
  }
  return chunks;
}

/** BM25 (k1 = 1.2, b = 0.75). O título da aula entra no texto indexado de cada trecho. */
export function bm25(query, chunks, k = 5, { k1 = 1.2, b = 0.75 } = {}) {
  const docs = chunks.map(c => tokenize(c.text + ' ' + c.lesson));
  const N = docs.length;
  if (!N) return [];
  const avgLen = docs.reduce((sum, d) => sum + d.length, 0) / N;

  const df = {};
  for (const doc of docs) for (const term of new Set(doc)) df[term] = (df[term] ?? 0) + 1;

  const terms = [...new Set(tokenize(query))];
  return chunks
    .map((chunk, i) => {
      const tf = {};
      for (const term of docs[i]) tf[term] = (tf[term] ?? 0) + 1;
      let score = 0;
      for (const term of terms) {
        if (!tf[term]) continue;
        const idf = Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5));
        score += idf * (tf[term] * (k1 + 1)) / (tf[term] + k1 * (1 - b + b * docs[i].length / avgLen));
      }
      return { ...chunk, score };
    })
    .filter(c => c.score > 0)
    .sort((a, c) => c.score - a.score)
    .slice(0, k);
}

export const searchLessons = (folders, query, k) => bm25(query, buildChunks(folders), k);

/** Prompt de geração: só pode usar as fontes numeradas e deve citá-las. */
export function ragPrompt(question, hits) {
  const sources = hits.map((h, i) => `[${i + 1}] (${h.lesson} - ${h.source})\n${h.text}`).join('\n\n');
  return (
    'Responda à pergunta do estudante usando SOMENTE as fontes abaixo, tiradas das aulas dele. ' +
    'Cite as fontes como [1], [2]. Se as fontes não tiverem a resposta, diga isso claramente.\n\n' +
    sources + '\n\nPergunta: ' + question
  );
}
