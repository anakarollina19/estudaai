import { test, equal, assert } from './runner.js';
import { normalize, tokenize, sentences, keywords, topics, toItems, offlineSummary } from '../src/text/nlp.js';

test('normalize remove acentos e deixa minúsculo', () => {
  equal(normalize('Fotossíntese ÁGUA ação'), 'fotossintese agua acao');
});

test('tokenize ignora stopwords e palavras curtas', () => {
  equal(tokenize('A célula é a unidade da vida'), ['celula', 'unidade', 'vida']);
});

test('sentences não duplica ponto em linhas sem pontuação', () => {
  const s = sentences('# Título\nAs plantas convertem luz solar em energia\nO processo ocorre nos cloroplastos das folhas.');
  equal(s, ['As plantas convertem luz solar em energia.', 'O processo ocorre nos cloroplastos das folhas.']);
});

test('keywords devolve as palavras mais frequentes', () => {
  const k = keywords('mitose mitose mitose meiose meiose célula', 2);
  equal(k, ['mitose', 'meiose']);
});

test('topics agrupa itens pelos títulos "#"', () => {
  const t = topics('# Mitose\n- duas células\n- idênticas\n# Meiose\ngametas', 'Aula');
  equal(t, [
    { title: 'Mitose', items: ['duas células', 'idênticas'] },
    { title: 'Meiose', items: ['gametas'] },
  ]);
});

test('topics usa o título da aula quando não há "#"', () => {
  equal(topics('linha um\nlinha dois', 'Biologia')[0].title, 'Biologia');
});

test('toItems limpa marcadores e numeração', () => {
  equal(toItems('• primeiro\n- segundo\n3. terceiro\n\n'), ['primeiro', 'segundo', 'terceiro']);
});

test('offlineSummary traz frases e palavras-chave', () => {
  const s = offlineSummary('A mitose divide a célula em duas células iguais. A meiose produz gametas com metade dos cromossomos. A mitose ajuda no crescimento dos tecidos do corpo.');
  assert(s.includes('🔑 Palavras-chave'), 'sem palavras-chave');
  assert(s.includes('mitose'), 'resumo sem o termo principal');
});
