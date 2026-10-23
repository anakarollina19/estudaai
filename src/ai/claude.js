// Cliente da API do Claude (Anthropic) direto do navegador.
// A chave fica só no localStorage do estudante. Para produção, isto iria para um backend.

import { state, save } from '../core/store.js';
import { ask, sure, toast } from '../core/dom.js';
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
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(friendlyError(res.status, json?.error?.message));
  return json;
}

/** Traduz os erros mais comuns da API para algo que o estudante entenda. */
function friendlyError(status, message = '') {
  if (status === 401) return 'chave inválida. Confira se copiou a chave inteira (começa com sk-ant-).';
  if (status === 403) return 'esta chave não tem permissão para usar a API.';
  if (status === 429) return 'limite de uso atingido. Espere um pouco e tente de novo.';
  if (/credit|billing/i.test(message)) return 'sem créditos na conta da Anthropic. Adicione créditos em console.anthropic.com.';
  if (status >= 500) return 'a API do Claude está fora do ar no momento. Tente mais tarde.';
  return message || `erro ${status}`;
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
    toast('IA indisponível: ' + e.message);
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
  if (key !== null) {
    state.db.key = key.trim();
    if (state.db.key) {
      toast('Testando a chave...');
      try {
        await callClaude({ max_tokens: 5, messages: [{ role: 'user', content: 'oi' }] });
        toast('✅ Chave do Claude funcionando');
      } catch (e) {
        const msg = e instanceof TypeError ? 'sem conexão com a API (verifique a internet).' : e.message;
        if (!(await sure('A chave não funcionou: ' + msg + '\n\nSalvar mesmo assim?'))) state.db.key = '';
      }
    }
  }
  const openai = await ask('(Opcional) Chave da OpenAI para transcrever arquivos de áudio com Whisper:', state.db.okey ?? '');
  if (openai !== null) state.db.okey = openai.trim();
  save();
  if (!state.db.key) toast('Configurações salvas (modo offline)');
}

register({ 'ai.settings': settings });
