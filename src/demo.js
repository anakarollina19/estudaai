// Modo demonstração: aulas de exemplo e uma execução gravada do agente,
// para quem abrir o app sem chave de IA ver tudo funcionando.

import { $, esc } from './core/dom.js';
import { register } from './core/actions.js';
import { state, emptyDb, createLesson, save, saveUsers } from './core/store.js';
import { startApp, refresh } from './library.js';
import { runAgentLoop } from './agent/agent.js';
import { TOOLS } from './agent/tools.js';
import { showTab } from './tabs.js';

const DEMO_USER = 'demo@estudaai';

export const SAMPLE_LESSONS = [
  {
    title: 'Divisão celular',
    notes: `# Mitose
Na mitose uma célula se divide em duas células filhas idênticas, com o mesmo número de cromossomos.
As fases são prófase, metáfase, anáfase e telófase.

# Meiose
A meiose gera gametas com metade dos cromossomos (células haploides).
Acontece em duas divisões seguidas e aumenta a variabilidade genética pelo crossing-over.

# Importância
A mitose permite crescimento e regeneração dos tecidos. A meiose é essencial para a reprodução sexuada.`,
  },
  {
    title: 'Ligações químicas',
    notes: `# Ligação iônica
Ocorre entre um metal e um ametal, com transferência de elétrons. Exemplo: NaCl, o sal de cozinha.

# Ligação covalente
Ocorre entre ametais, que compartilham pares de elétrons. Exemplo: a molécula de água (H2O).

# Ligação metálica
Os elétrons livres formam um "mar de elétrons", o que explica a condução elétrica dos metais.`,
  },
  {
    title: 'Revolução Industrial',
    notes: `# Contexto
Começou na Inglaterra no século XVIII, com a máquina a vapor e a produção têxtil mecanizada.

# Consequências
Êxodo rural, crescimento das cidades e surgimento da classe operária.
Jornadas de trabalho longas levaram aos primeiros movimentos sindicais.`,
  },
];

function loadDemo() {
  state.users[DEMO_USER] ??= { name: 'Visitante', h: '' };
  saveUsers();
  state.me = DEMO_USER;
  // A demonstração não fica lembrada: ao fechar o navegador, volta para o login.
  localStorage.removeItem('me');
  sessionStorage.setItem('me', DEMO_USER);
  state.db = emptyDb();
  for (const sample of [...SAMPLE_LESSONS].reverse()) createLesson(sample);
  save();
  startApp();
}

// Execução gravada: as respostas do "modelo" são fixas, mas as ferramentas rodam de verdade.
function scriptedModel() {
  const findId = (messages, title) => {
    const listing = messages.findLast(m => m.role === 'user' && Array.isArray(m.content))?.content[0].content ?? '';
    return listing.match(new RegExp(`"id":"(\\w+)","titulo":"${title}`))?.[1];
  };
  const script = [
    () => [
      { type: 'text', text: 'Vou ver quais aulas você tem.' },
      { type: 'tool_use', id: 't1', name: 'listar_aulas', input: {} },
    ],
    messages => [
      { type: 'text', text: 'Encontrei 3 aulas de matérias diferentes. Vou separar cada uma na sua pasta.' },
      { type: 'tool_use', id: 't2', name: 'mover_aula', input: { id: findId(messages, 'Divisão celular'), pasta: 'Biologia' } },
      { type: 'tool_use', id: 't3', name: 'mover_aula', input: { id: findId(messages, 'Ligações químicas'), pasta: 'Química' } },
      { type: 'tool_use', id: 't4', name: 'mover_aula', input: { id: findId(messages, 'Revolução Industrial'), pasta: 'História' } },
    ],
    () => [
      { type: 'text', text: 'Agora vou procurar o que você estudou sobre divisão celular para montar uma revisão.' },
      { type: 'tool_use', id: 't5', name: 'buscar_nas_aulas', input: { consulta: 'mitose meiose cromossomos' } },
    ],
    () => [
      {
        type: 'tool_use', id: 't6', name: 'criar_aula', input: {
          titulo: 'Revisão: mitose x meiose', pasta: 'Biologia',
          notas: '# Mitose\n2 células filhas idênticas, mesmo número de cromossomos. Serve para crescimento e regeneração.\n\n# Meiose\n4 gametas com metade dos cromossomos. Gera variabilidade genética (crossing-over).\n\n# Pergunta de revisão\nPor que a meiose é importante para a reprodução sexuada?',
        },
      },
    ],
    () => [{
      type: 'text',
      text: 'Pronto! Organizei suas aulas nas pastas Biologia, Química e História, e criei a aula "Revisão: mitose x meiose" em Biologia, com base no que encontrei nas suas notas.',
    }],
  ];
  let i = 0;
  return async ({ messages }) => {
    await new Promise(r => setTimeout(r, 700)); // ritmo de leitura
    return { content: script[Math.min(i++, script.length - 1)](messages) };
  };
}

async function agentDemo() {
  showTab('agente');
  const log = $('agentLog');
  const line = (html, kind = '') => {
    const el = document.createElement('div');
    el.className = `card flat ${kind}`;
    el.innerHTML = html;
    log.append(el);
  };
  log.innerHTML = '';
  const request = 'Organize minhas aulas por matéria e crie uma revisão de biologia';
  line(`<b>Você:</b> ${esc(request)} <span class="pill">demonstração</span>`, 'msg-me');
  await runAgentLoop({
    messages: [{ role: 'user', content: request }],
    tools: TOOLS,
    callModel: scriptedModel(),
    onText: text => line(`<b>🤖 Agente:</b> ${esc(text)}`),
    onToolCall: call => {
      line(`🔧 <b>${esc(call.name)}</b> ${esc(JSON.stringify(call.input).slice(0, 160))}`, 'msg-tool');
      refresh();
    },
  });
  refresh();
}

register({
  'demo.load': loadDemo,
  'agent.demo': agentDemo,
});
