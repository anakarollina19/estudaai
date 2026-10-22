import { test, equal, assert } from './runner.js';
import { buildChunks, bm25, searchLessons, ragPrompt } from '../src/rag/search.js';

const folders = [
  {
    name: 'Biologia',
    lessons: [{
      id: 'bio', title: 'Divisão celular',
      notes: '# Mitose\nNa mitose a célula se divide em duas células filhas idênticas.\n\n# Meiose\nA meiose gera gametas com metade dos cromossomos.',
      images: [{ time: '10:42', text: 'Fases da mitose: prófase, metáfase, anáfase e telófase' }],
    }],
  },
  {
    name: 'Química',
    lessons: [{ id: 'qui', title: 'Ligações', notes: '# Ligação iônica\nOcorre entre metal e ametal com transferência de elétrons.' }],
  },
];

test('buildChunks cria um trecho por tópico e por foto', () => {
  const chunks = buildChunks(folders);
  equal(chunks.length, 4);
  equal(chunks.map(c => c.source), ['notas', 'notas', 'foto 10:42', 'notas']);
});

test('buildChunks corta textos longos com sobreposição', () => {
  const long = [{ name: 'X', lessons: [{ id: 'l', title: 'T', notes: 'palavra '.repeat(200) }] }];
  const chunks = buildChunks(long);
  assert(chunks.length === 3, `esperava 3 trechos, veio ${chunks.length}`);
  assert(chunks.every(c => c.text.length <= 700), 'trecho maior que 700');
});

test('bm25 coloca o trecho mais relevante primeiro', () => {
  const hits = searchLessons(folders, 'quais as fases da mitose?', 5);
  equal(hits[0].source, 'foto 10:42');
  assert(hits.every(h => h.lessonId === 'bio'), 'trouxe aula de química para pergunta de biologia');
});

test('busca ignora acentos (ionica = iônica)', () => {
  equal(searchLessons(folders, 'ligacao ionica')[0].lessonId, 'qui');
});

test('sem termos em comum não devolve nada', () => {
  equal(searchLessons(folders, 'revolução francesa'), []);
});

test('bm25 com lista vazia não quebra', () => {
  equal(bm25('mitose', []), []);
});

test('ragPrompt numera as fontes e pede citação', () => {
  const p = ragPrompt('O que é mitose?', searchLessons(folders, 'mitose', 2));
  assert(p.includes('[1] (Divisão celular'), 'fonte [1] ausente');
  assert(p.includes('Cite as fontes'), 'sem instrução de citação');
  assert(p.endsWith('Pergunta: O que é mitose?'), 'pergunta fora do lugar');
});
