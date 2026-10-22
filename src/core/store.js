// Estado do app e operações sobre pastas e aulas.
// Não mexe na interface: a UI (library.js), o agente e os testes usam as mesmas funções.

import { emit } from './events.js';
import { uid, nowStr, today } from './util.js';
import { normalize } from '../text/nlp.js';

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export const state = {
  users: read('users', {}),
  me: localStorage.getItem('me'),
  db: null,   // { folders: [...], key, okey }
  cur: null,  // id da aula aberta
};

export const emptyDb = () => ({ folders: [makeFolder('Geral')], key: '', okey: '' });

export function loadDb() {
  state.db = read('db_' + state.me, null) ?? emptyDb();
}

export function save() {
  if (!state.me) return;
  try {
    localStorage.setItem('db_' + state.me, JSON.stringify(state.db));
  } catch {
    emit('storage:full');
  }
}

export function saveUsers() {
  localStorage.setItem('users', JSON.stringify(state.users));
}

// ----- Consultas -----

export const allLessons = () =>
  state.db.folders.flatMap(folder => folder.lessons.map(lesson => ({ lesson, folder })));

export function findLesson(id) {
  for (const folder of state.db.folders) {
    const lesson = folder.lessons.find(l => l.id === id);
    if (lesson) return { lesson, folder };
  }
  return null;
}

export const currentLesson = () => findLesson(state.cur)?.lesson ?? null;

export const folderByName = name =>
  state.db.folders.find(f => normalize(f.name) === normalize(name ?? ''));

// ----- Alterações -----

function makeFolder(name) {
  return { id: uid(), name, open: true, lessons: [] };
}

/** Cria a pasta, ou devolve a existente com o mesmo nome. */
export function createFolder(name) {
  let folder = folderByName(name);
  if (!folder) {
    folder = makeFolder(name);
    state.db.folders.push(folder);
  }
  return folder;
}

/** Cria uma aula (na pasta indicada pelo nome, ou na primeira) e a torna a aula atual. */
export function createLesson({ title, folder, notes = '' } = {}) {
  const target = folder ? createFolder(folder) : state.db.folders[0];
  const lesson = {
    id: uid(),
    title: title || 'Aula de ' + today(),
    created: nowStr(),
    updated: nowStr(),
    notes,
    board: null,
    slides: [],
    images: [],
  };
  target.lessons.unshift(lesson);
  state.cur = lesson.id;
  return { lesson, folder: target };
}

export function touch(lesson) {
  lesson.updated = nowStr();
}

export function moveLesson(id, folderName) {
  const found = findLesson(id);
  if (!found) return null;
  const target = createFolder(folderName);
  if (target === found.folder) return target;
  found.folder.lessons = found.folder.lessons.filter(l => l.id !== id);
  target.lessons.unshift(found.lesson);
  return target;
}

export function deleteLesson(id) {
  for (const folder of state.db.folders) folder.lessons = folder.lessons.filter(l => l.id !== id);
  if (state.cur === id) state.cur = allLessons()[0]?.lesson.id ?? null;
}

export function deleteFolder(id) {
  if (state.db.folders.length === 1) return false;
  state.db.folders = state.db.folders.filter(f => f.id !== id);
  if (!findLesson(state.cur)) state.cur = allLessons()[0]?.lesson.id ?? null;
  return true;
}
