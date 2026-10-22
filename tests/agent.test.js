import { test, equal, assert } from './runner.js';
import { state, emptyDb, createLesson, findLesson, moveLesson, deleteLesson, deleteFolder } from '../src/core/store.js';
import { runAgentLoop } from '../src/agent/agent.js';
import { TOOLS, toolSpecs } from '../src/agent/tools.js';

function freshDb() {
  state.me = null; // não grava no localStorage durante os testes
  state.db = emptyDb();
  state.cur = null;
}

/** Modelo falso: devolve as respostas da lista, uma por chamada, e guarda o que recebeu. */
function fakeModel(responses) {
  const calls = [];
  const model = async body => {
    calls.push(structuredClone(body));
    return { content: responses[Math.min(calls.length - 1, responses.length - 1)] };
  };
  model.calls = calls;
  return model;
}

// ----- Store -----

test('createLesson cria a pasta quando ela não existe', () => {
  freshDb();
  const { lesson, folder } = createLesson({ title: 'Mitose', folder: 'Biologia' });
  equal(folder.name, 'Biologia');
  equal(state.cur, lesson.id);
  equal(state.db.folders.length, 2);
});

test('createFolder não duplica pasta com acento ou maiúscula diferente', () => {
  freshDb();
  createLesson({ folder: 'Química' });
  createLesson({ folder: 'quimica' });
  equal(state.db.folders.map(f => f.name), ['Geral', 'Química']);
});

test('moveLesson e deleteLesson', () => {
  freshDb();
  const { lesson } = createLesson({ title: 'A' });
  moveLesson(lesson.id, 'História');
  equal(findLesson(lesson.id).folder.name, 'História');
  deleteLesson(lesson.id);
  equal(findLesson(lesson.id), null);
});

test('deleteFolder recusa apagar a última pasta', () => {
  freshDb();
  equal(deleteFolder(state.db.folders[0].id), false);
});

// ----- Ferramentas -----

test('toda ferramenta tem descrição e JSON Schema', () => {
  for (const spec of toolSpecs(TOOLS)) {
    assert(spec.description?.length > 10, `${spec.name} sem descrição`);
    equal(spec.input_schema.type, 'object', spec.name);
    assert(!('run' in spec), `${spec.name} enviaria a função para a API`);
  }
});

// ----- Loop do agente -----

test('agente executa a ferramenta pedida e termina com texto', async () => {
  freshDb();
  createLesson({ title: 'Mitose' });
  const model = fakeModel([
    [{ type: 'tool_use', id: 't1', name: 'criar_pasta', input: { nome: 'Biologia' } }],
    [{ type: 'text', text: 'Pasta criada.' }],
  ]);
  const texts = [];
  const result = await runAgentLoop({ messages: [{ role: 'user', content: 'crie Biologia' }], tools: TOOLS, callModel: model, onText: t => texts.push(t) });

  equal(result, { steps: 2, finished: true });
  equal(texts, ['Pasta criada.']);
  assert(state.db.folders.some(f => f.name === 'Biologia'), 'pasta não foi criada');
  const toolResult = model.calls[1].messages.at(-1).content[0];
  equal(toolResult.type, 'tool_result');
  equal(toolResult.tool_use_id, 't1');
});

test('agente devolve erro para ferramenta desconhecida em vez de quebrar', async () => {
  freshDb();
  const model = fakeModel([
    [{ type: 'tool_use', id: 'x', name: 'apagar_tudo', input: {} }],
    [{ type: 'text', text: 'ok' }],
  ]);
  await runAgentLoop({ messages: [{ role: 'user', content: '?' }], tools: TOOLS, callModel: model });
  assert(model.calls[1].messages.at(-1).content[0].content.includes('Ferramenta desconhecida'), 'erro não informado ao modelo');
});

test('agente para depois de maxSteps', async () => {
  freshDb();
  const model = fakeModel([[{ type: 'tool_use', id: 'l', name: 'listar_aulas', input: {} }]]);
  const result = await runAgentLoop({ messages: [{ role: 'user', content: '?' }], tools: TOOLS, callModel: model, maxSteps: 3 });
  equal(result, { steps: 3, finished: false });
});

test('ferramenta mover_aula com id inválido avisa o modelo', async () => {
  freshDb();
  const move = TOOLS.find(t => t.name === 'mover_aula');
  assert(move.run({ id: 'nao-existe', pasta: 'X' }).startsWith('Aula não encontrada'));
});
