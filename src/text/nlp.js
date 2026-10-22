// Processamento de texto em português, sem dependências.
// Usado no modo offline (sem IA) e na busca das aulas (RAG).

export const STOPWORDS = new Set((
  'a o as os de da do das dos e é em um uma uns umas para por com que no na nos nas se ao aos como ' +
  'mais mas foi são ser tem têm isso esse essa este esta isto também entre sobre muito pelo pela já ' +
  'ou quando seu sua seus suas ele ela eles elas qual quais onde porque pois sem até foram era está ' +
  'the of and to in is it'
).split(' '));

/** Minúsculas e sem acentos: "Fotossíntese" -> "fotossintese". */
export const normalize = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Palavras com 3+ letras, normalizadas e sem stopwords. */
export const tokenize = text =>
  (normalize(text).match(/[a-z0-9]{3,}/g) ?? []).filter(w => !STOPWORDS.has(w));

/** Divide em frases. Linhas sem pontuação final viram frases; títulos "# ..." são ignorados. */
export function sentences(text) {
  return text
    .replace(/^#+.*$/gm, '')
    .replace(/([^.!?\s])\s*\n+/g, '$1. ')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 25);
}

/** As n palavras mais frequentes (4+ letras, sem stopwords), na forma original. */
export function keywords(text, n = 10) {
  const counts = {};
  for (const w of text.toLowerCase().match(/[a-zà-ú0-9]{4,}/g) ?? []) {
    if (!STOPWORDS.has(w)) counts[w] = (counts[w] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

const capitalize = s => s.replace(/^./, c => c.toUpperCase());

/** Resumo extrativo: escolhe as frases com mais palavras-chave, na ordem original. */
export function offlineSummary(text) {
  const kws = keywords(text, 15);
  const all = sentences(text);
  const take = Math.max(3, Math.ceil(all.length * 0.3));
  const picked = all
    .map((s, i) => ({ s, i, score: kws.filter(k => s.toLowerCase().includes(k)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .sort((a, b) => a.i - b.i)
    .map(x => '• ' + x.s);
  return picked.join('\n') + '\n\n🔑 Palavras-chave: ' + kws.slice(0, 8).join(', ');
}

/**
 * Agrupa as notas em tópicos usando os títulos "# ...".
 * Sem títulos e com texto longo, cria tópicos de 4 frases nomeados pela palavra-chave.
 */
export function topics(notes, fallbackTitle = 'Aula') {
  const parts = [];
  let current = null;
  for (const line of notes.split('\n')) {
    const heading = line.match(/^#+\s*(.+)/);
    if (heading) {
      current = { title: heading[1].trim(), items: [] };
      parts.push(current);
    } else if (line.trim()) {
      if (!current) {
        current = { title: fallbackTitle, items: [] };
        parts.push(current);
      }
      current.items.push(line.replace(/^[-*•]\s*/, '').trim());
    }
  }
  if (parts.length === 1 && parts[0].items.length > 6) {
    const all = sentences(notes);
    parts.length = 0;
    for (let i = 0; i < all.length; i += 4) {
      const group = all.slice(i, i + 4);
      parts.push({ title: capitalize(keywords(group.join(' '), 1)[0] ?? 'Tópico'), items: group });
    }
  }
  return parts;
}

/** Converte uma lista em texto ("• a\n- b\n1. c") num array de itens limpos. */
export const toItems = text =>
  text.split('\n').map(s => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);

export { capitalize };
