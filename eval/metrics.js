// Métricas de recuperação. Funções puras, usadas pela página de avaliação e pelos testes.

/** Um trecho é relevante se é da aula certa e contém o texto esperado (identifica o tópico). */
export const isRelevant = (chunk, item) => chunk.lessonId === item.lesson && chunk.text.includes(item.contains);

/** Posição (1, 2, 3...) do primeiro trecho relevante, ou null se não apareceu. */
export function firstHit(results, item) {
  const i = results.findIndex(chunk => isRelevant(chunk, item));
  return i < 0 ? null : i + 1;
}

/**
 * Resume as posições em métricas:
 *   hit@1, hit@3, hit@5  fração das perguntas com resposta certa entre os k primeiros
 *   mrr                  média de 1/posição (1 se veio em 1º, 0,5 se em 2º, 0 se não veio)
 */
export function summarize(ranks) {
  const n = ranks.length || 1;
  const hitAt = k => ranks.filter(r => r !== null && r <= k).length / n;
  return {
    n: ranks.length,
    hit1: hitAt(1),
    hit3: hitAt(3),
    hit5: hitAt(5),
    mrr: ranks.reduce((sum, r) => sum + (r ? 1 / r : 0), 0) / n,
  };
}

/** Roda um método de busca em todas as perguntas. `search(question)` devolve os trechos ordenados. */
export async function evaluate(questions, search) {
  const rows = [];
  for (const item of questions) {
    const results = await search(item.question);
    rows.push({ ...item, rank: firstHit(results, item), top: results[0] ?? null });
  }
  const byKind = kind => summarize(rows.filter(r => r.kind === kind).map(r => r.rank));
  return {
    rows,
    all: summarize(rows.map(r => r.rank)),
    literal: byKind('literal'),
    parafrase: byKind('parafrase'),
  };
}
