// Aba "Pergunte às aulas": busca os trechos (BM25) e pede ao Claude uma resposta com fontes.

import { $, esc, toast } from '../core/dom.js';
import { register, run } from '../core/actions.js';
import { state } from '../core/store.js';
import { complete, hasKey } from '../ai/claude.js';
import { clip } from '../core/util.js';
import { buildChunks, bm25, ragPrompt } from './search.js';
import { loadEmbedder, semanticSearch, hybridSearch } from './semantic.js';

/** Busca no modo escolhido. Os modos com significado carregam o modelo de embeddings na primeira vez. */
async function retrieve(question) {
  const chunks = buildChunks(state.db.folders);
  const mode = $('ragMode').value;
  if (mode === 'bm25') return bm25(question, chunks, 5);
  $('ragAns').textContent = 'Carregando o modelo de significado...';
  try {
    await loadEmbedder(p => ($('ragAns').textContent = `Baixando o modelo de significado... ${p}%`));
    return await (mode === 'semantic' ? semanticSearch : hybridSearch)(question, chunks, 5);
  } catch (e) {
    toast('Busca por significado indisponível, usando busca por palavras');
    console.warn(e);
    return bm25(question, chunks, 5);
  }
}

async function askLessons() {
  const question = $('ragQ').value.trim();
  if (!question) return toast('Digite uma pergunta');

  const hits = await retrieve(question);
  $('ragSrc').innerHTML = hits.map((h, i) => `
    <div class="card flat source" data-action="rag.openSource" data-arg="${h.lessonId}">
      <b>[${i + 1}] ${esc(h.lesson)}</b> <span class="pill">${esc(h.folder)} · ${esc(h.source)}</span>
      <div>${esc(clip(h.text, 300))}</div>
    </div>`).join('');

  const out = $('ragAns');
  if (!hits.length) {
    out.textContent = 'Não encontrei nada sobre isso nas suas aulas. Tente outras palavras ou pesquise no Google.';
    return;
  }
  if (!hasKey()) {
    out.textContent = '📚 Trechos mais relevantes das suas aulas (adicione a chave de IA em ⚙️ para receber uma resposta escrita):';
    return;
  }
  out.textContent = 'Pensando...';
  try {
    out.textContent = await complete(ragPrompt(question, hits));
  } catch (e) {
    out.textContent = 'Erro: ' + e.message;
  }
}

register({
  'rag.ask': askLessons,
  'rag.openSource': id => {
    run('library.open', id);
    run('tab.show', 'notas');
  },
});
