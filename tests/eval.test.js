import { test, equal, assert } from './runner.js';
import { fuseRankings } from '../src/rag/search.js';
import { cosine } from '../src/rag/semantic.js';
import { firstHit, summarize, evaluate } from '../eval/metrics.js';
import { FOLDERS, QUESTIONS } from '../eval/dataset.js';
import { buildChunks, bm25 } from '../src/rag/search.js';

const chunk = (lessonId, text) => ({ lessonId, source: 'notas', lesson: lessonId, text });

test('fuseRankings premia o que aparece bem nos dois rankings', () => {
  const a = chunk('x', 'A'), b = chunk('y', 'B'), c = chunk('z', 'C');
  const fused = fuseRankings([[a, b, c], [b, c, a]], 3);
  equal(fused.map(r => r.text), ['B', 'A', 'C']);
});

test('fuseRankings não duplica o mesmo trecho', () => {
  const a = chunk('x', 'A');
  equal(fuseRankings([[a], [a]], 5).length, 1);
});

test('cosine de vetores normalizados', () => {
  equal(cosine([1, 0], [1, 0]), 1);
  equal(cosine([1, 0], [0, 1]), 0);
});

test('firstHit exige a aula certa e o trecho esperado', () => {
  const item = { lesson: 'bio', contains: 'mitose' };
  equal(firstHit([chunk('qui', 'mitose'), chunk('bio', 'meiose'), chunk('bio', 'na mitose')], item), 3);
  equal(firstHit([chunk('qui', 'x')], item), null);
});

test('summarize calcula hit@k e MRR', () => {
  const m = summarize([1, 2, null, 4]);
  equal([m.hit1, m.hit3, m.hit5], [0.25, 0.5, 0.75]);
  equal(m.mrr, (1 + 0.5 + 0 + 0.25) / 4);
});

test('conjunto de avaliação: toda resposta esperada existe numa aula', () => {
  const chunks = buildChunks(FOLDERS);
  for (const q of QUESTIONS) {
    assert(chunks.some(c => c.lessonId === q.lesson && c.text.includes(q.contains)), `sem trecho para: ${q.question}`);
  }
  equal(QUESTIONS.length, 30);
});

// Trava de regressão: se uma mudança piorar a busca, este teste falha.
test('BM25 acerta todas as perguntas literais no top 5', async () => {
  const chunks = buildChunks(FOLDERS);
  const result = await evaluate(QUESTIONS, q => bm25(q, chunks, 5));
  equal(result.literal.hit5, 1);
  assert(result.all.hit5 >= 0.8, `Hit@5 caiu para ${result.all.hit5}`);
});
