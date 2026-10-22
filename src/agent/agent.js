// Agente de estudos: loop de tool use com o Claude.
//
//   1. envia a conversa + a lista de ferramentas
//   2. o modelo responde com texto e/ou blocos tool_use
//   3. o app executa cada ferramenta e devolve tool_result
//   4. repete até o modelo responder só com texto (ou atingir maxSteps)

import { $, esc, toast } from '../core/dom.js';
import { register } from '../core/actions.js';
import { state, currentLesson } from '../core/store.js';
import { callClaude, hasKey } from '../ai/claude.js';
import { TOOLS, toolSpecs, uiHooks } from './tools.js';
import { openLesson, refresh } from '../library.js';
import { exportLessonPdf } from '../study/pdf.js';
import { openGoogle } from '../web.js';

const MAX_RESULT_CHARS = 15000;

/**
 * Executa o loop do agente. `callModel` é injetado (a API real ou um modelo falso nos testes).
 * Modifica `messages` (o histórico continua na próxima pergunta). Devolve quantos passos levou.
 */
export async function runAgentLoop({ messages, system, tools, callModel, onText, onToolCall, maxSteps = 10 }) {
  for (let step = 1; step <= maxSteps; step++) {
    const response = await callModel({ system, tools: toolSpecs(tools), messages });
    messages.push({ role: 'assistant', content: response.content });

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) onText?.(block.text);
    }
    const calls = response.content.filter(block => block.type === 'tool_use');
    if (!calls.length) return { steps: step, finished: true };

    const results = [];
    for (const call of calls) {
      const tool = tools.find(t => t.name === call.name);
      let output;
      try {
        output = tool ? await tool.run(call.input ?? {}) : `Ferramenta desconhecida: ${call.name}`;
      } catch (e) {
        output = 'Erro: ' + e.message;
      }
      onToolCall?.(call, output);
      results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(output).slice(0, MAX_RESULT_CHARS) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { steps: maxSteps, finished: false };
}

// ----- Interface -----

let history = [];

uiHooks.exportPdf = id => {
  openLesson(id);
  exportLessonPdf();
};
uiHooks.openGoogle = openGoogle;

function line(html, kind = '') {
  const el = document.createElement('div');
  el.className = `card flat ${kind}`;
  el.innerHTML = html;
  $('agentLog').append(el);
  el.scrollIntoView({ block: 'end' });
}

const systemPrompt = () =>
  'Você é o agente de estudos do app EstudaAI. Ajude o estudante a organizar e estudar as aulas dele usando as ferramentas. ' +
  `Aula aberta agora: id ${state.cur} ("${currentLesson()?.title ?? ''}"). ` +
  'Antes de mexer em aulas, use listar_aulas ou buscar_nas_aulas. Escreva notas em Markdown com "# Tópico". ' +
  'Responda em português, curto e claro, dizendo o que você fez.';

async function send() {
  const input = $('agentIn');
  const request = input.value.trim();
  if (!request) return;
  if (!hasKey()) return toast('O agente precisa da chave do Claude: clique em ⚙️ Chave de IA');

  input.value = '';
  $('agentBtn').disabled = true;
  line(`<b>Você:</b> ${esc(request)}`, 'msg-me');
  history.push({ role: 'user', content: request });

  try {
    const result = await runAgentLoop({
      messages: history,
      system: systemPrompt(),
      tools: TOOLS,
      callModel: body => callClaude({ max_tokens: 4000, ...body }),
      onText: text => line(`<b>🤖 Agente:</b> ${esc(text).replace(/\n/g, '<br>')}`),
      onToolCall: call => line(`🔧 <b>${esc(call.name)}</b> ${esc(JSON.stringify(call.input).slice(0, 160))}`, 'msg-tool'),
    });
    if (!result.finished) line('⏸️ Parei após muitos passos. Peça para continuar se precisar.');
  } catch (e) {
    line('⚠️ ' + esc(e.message));
    history = []; // histórico pode ter ficado inconsistente (tool_use sem tool_result)
  }
  $('agentBtn').disabled = false;
  refresh();
}

register({
  'agent.send': send,
  'agent.example': (_, el) => {
    $('agentIn').value = el.textContent;
    send();
  },
  'agent.clear': () => {
    history = [];
    $('agentLog').innerHTML = '';
  },
});
