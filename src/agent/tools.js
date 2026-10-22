// Ferramentas do agente. Cada uma tem a especificação que vai para o Claude
// (name, description, input_schema em JSON Schema) e a função `run` executada no app.

import {
  state, findLesson, createFolder, createLesson, moveLesson, touch,
} from '../core/store.js';
import { searchLessons } from '../rag/search.js';

const NOT_FOUND = 'Aula não encontrada. Use listar_aulas para ver os ids.';

const string = { type: 'string' };
const object = (properties, required = []) => ({ type: 'object', properties, required });

/** Ações da interface que o agente pode disparar; injetadas pelo agent.js para manter isto testável. */
export const uiHooks = { exportPdf: () => {}, openGoogle: () => {} };

export const TOOLS = [
  {
    name: 'listar_aulas',
    description: 'Lista todas as pastas e aulas do estudante, com id, título, data, tamanho das notas e número de fotos.',
    input_schema: object({}),
    run: () => state.db.folders.map(f => ({
      pasta: f.name,
      aulas: f.lessons.map(l => ({
        id: l.id, titulo: l.title, criada: l.created,
        caracteres: (l.notes ?? '').length, fotos: (l.images ?? []).length, aberta: l.id === state.cur,
      })),
    })),
  },
  {
    name: 'ler_aula',
    description: 'Lê as anotações completas de uma aula, incluindo transcrições e textos das fotos do quadro.',
    input_schema: object({ id: string }, ['id']),
    run: ({ id }) => {
      const found = findLesson(id);
      if (!found) return NOT_FOUND;
      const { lesson, folder } = found;
      return { titulo: lesson.title, pasta: folder.name, notas: (lesson.notes ?? '').slice(0, 12000), fotos: (lesson.images ?? []).map(i => i.text) };
    },
  },
  {
    name: 'buscar_nas_aulas',
    description: 'Busca trechos relevantes em todas as aulas do estudante (RAG, por palavras). Use para responder perguntas sobre o que foi estudado; prefira palavras que provavelmente aparecem nas notas.',
    input_schema: object({ consulta: string }, ['consulta']),
    run: ({ consulta }) => searchLessons(state.db.folders, consulta, 6)
      .map(h => ({ aula_id: h.lessonId, aula: h.lesson, fonte: h.source, trecho: h.text })),
  },
  {
    name: 'criar_pasta',
    description: 'Cria uma pasta (matéria). Se já existir uma com o mesmo nome, usa a existente.',
    input_schema: object({ nome: string }, ['nome']),
    run: ({ nome }) => 'Pasta pronta: ' + createFolder(nome).name,
  },
  {
    name: 'criar_aula',
    description: 'Cria uma aula nova, opcionalmente numa pasta e já com anotações em Markdown (use "# Tópico" para tópicos).',
    input_schema: object({ titulo: string, pasta: string, notas: string }, ['titulo']),
    run: ({ titulo, pasta, notas }) => {
      const { lesson, folder } = createLesson({ title: titulo, folder: pasta, notes: notas });
      return { id: lesson.id, pasta: folder.name };
    },
  },
  {
    name: 'escrever_notas',
    description: 'Adiciona texto ao fim das anotações de uma aula, ou substitui tudo.',
    input_schema: object({ id: string, texto: string, modo: { type: 'string', enum: ['adicionar', 'substituir'] } }, ['id', 'texto']),
    run: ({ id, texto, modo = 'adicionar' }) => {
      const lesson = findLesson(id)?.lesson;
      if (!lesson) return NOT_FOUND;
      lesson.notes = modo === 'substituir' || !lesson.notes ? texto : lesson.notes + '\n\n' + texto;
      touch(lesson);
      return 'Notas salvas';
    },
  },
  {
    name: 'renomear_aula',
    description: 'Renomeia uma aula.',
    input_schema: object({ id: string, titulo: string }, ['id', 'titulo']),
    run: ({ id, titulo }) => {
      const lesson = findLesson(id)?.lesson;
      if (!lesson) return NOT_FOUND;
      lesson.title = titulo;
      return 'Renomeada para ' + titulo;
    },
  },
  {
    name: 'mover_aula',
    description: 'Move uma aula para outra pasta (cria a pasta se não existir).',
    input_schema: object({ id: string, pasta: string }, ['id', 'pasta']),
    run: ({ id, pasta }) => {
      const folder = moveLesson(id, pasta);
      return folder ? 'Movida para ' + folder.name : NOT_FOUND;
    },
  },
  {
    name: 'criar_slides',
    description: 'Cria os slides de uma aula. Cada slide tem um título e até 5 tópicos curtos. O slide de capa é criado automaticamente.',
    input_schema: object({
      id: string,
      slides: { type: 'array', items: object({ title: string, items: { type: 'array', items: string } }, ['title', 'items']) },
    }, ['id', 'slides']),
    run: ({ id, slides }) => {
      const lesson = findLesson(id)?.lesson;
      if (!lesson) return NOT_FOUND;
      lesson.slides = [{ title: lesson.title, items: [lesson.created] }, ...slides];
      return `${slides.length} slides criados`;
    },
  },
  {
    name: 'gerar_pdf',
    description: 'Gera e baixa o PDF de uma aula (notas, resumo e fotos).',
    input_schema: object({ id: string }, ['id']),
    run: ({ id }) => {
      if (!findLesson(id)) return NOT_FOUND;
      uiHooks.exportPdf(id);
      return 'PDF gerado';
    },
  },
  {
    name: 'pesquisar_google',
    description: 'Abre uma pesquisa no Google para o estudante ver. Você não recebe o resultado.',
    input_schema: object({ consulta: string }, ['consulta']),
    run: ({ consulta }) => {
      uiHooks.openGoogle(consulta);
      return 'Pesquisa aberta para o estudante';
    },
  },
];

/** Só a parte que vai para a API (sem `run`). */
export const toolSpecs = tools => tools.map(({ run, ...spec }) => spec);
