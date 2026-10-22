// Cliente da API do Claude (Anthropic) direto do navegador.
// A chave fica só no localStorage do estudante. Para produção, isto iria para um backend.

import { state, save } from '../core/store.js';
import { ask, toast } from '../core/dom.js';
import { register } from '../core/actions.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-sonnet-5-5';

export const hasKey = () => Boolean(state.db?.key);

/** Chamada crua à API de mensagens. Lança erro com a mensagem da API. */
export async function callClaude(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': state.db.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, ...body }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

/** Envia um prompt e devolve o texto. Sem chave configurada, devolve null (modo offline). */
export async function complete(prompt, options = {}) {
  if (!hasKey()) return null;
  const json = await callClaude({ messages: [{ role: 'user', content: prompt }], ...options });
  return json.content.map(block => block.text ?? '').join('');
}

/** Igual a complete(), mas nunca lança: em erro devolve null. Para recursos com plano B offline. */
export async function tryComplete(prompt, options) {
  try {
    return await complete(prompt, options);
  } catch (e) {
    console.warn('IA indisponível:', e.message);
    return null;
  }
}

/** Extrai o primeiro JSON (objeto ou lista) de uma resposta em texto. */
export function extractJson(text) {
  if (!text) return null;
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  const close = text[start] === '[' ? ']' : '}';
  try {
    return JSON.parse(text.slice(start, text.lastIndexOf(close) + 1));
  } catch {
    return null;
  }
}

async function settings() {
  const key = await ask(
    'Chave da API do Claude (Anthropic) para resumos, slides, agente e dúvidas com IA.\n' +
    'Fica salva só neste dispositivo. Deixe vazio para usar o modo offline.',
    state.db.key ?? ''
  );
  if (key !== null) state.db.key = key.trim();
  const openai = await ask('(Opcional) Chave da OpenAI para transcrever arquivos de áudio com Whisper:', state.db.okey ?? '');
  if (openai !== null) state.db.okey = openai.trim();
  save();
  toast('Configurações salvas');
}

register({ 'ai.settings': settings });
