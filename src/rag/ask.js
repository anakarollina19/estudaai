// Aba "Pergunte às aulas": busca os trechos (BM25) e pede ao Claude uma resposta com fontes.

import { $, esc, toast } from '../core/dom.js';
import { register, run } from '../core/actions.js';
import { state } from '../core/store.js';
import { complete, hasKey } from '../ai/claude.js';
import { clip } from '../core/util.js';
import { searchLessons, ragPrompt } from './search.js';

async function askLessons() {
  const question = $('ragQ').value.trim();
  if (!question) return toast('Digite uma pergunta');

  const hits = searchLessons(state.db.folders, question, 5);
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
