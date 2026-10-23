// Interface da biblioteca: barra lateral com pastas e aulas, editor de notas e backup.

import { $, esc, toast, ask, sure } from './core/dom.js';
import { emit } from './core/events.js';
import { register } from './core/actions.js';
import {
  state, save, loadDb, allLessons, findLesson, currentLesson,
  createFolder, createLesson, deleteLesson, deleteFolder, touch,
  ensurePages, syncNotes, addPage,
} from './core/store.js';
import { saveFile } from './core/files.js';
import { uid } from './core/util.js';
import { showTab } from './tabs.js';
import { loadImages, lessonImageIds, migrateLesson, imageSrc, putImage } from './capture/images.js';

export function startApp() {
  loadDb();
  if (!allLessons().length) createLesson();
  show('auth', false);
  show('app', true);
  $('hello').textContent = `Olá, ${state.users[state.me]?.name ?? ''} 👋`;
  showTab('notas');
  openLesson(state.cur ?? allLessons()[0].lesson.id);
}

const show = (id, visible) => $(id).classList.toggle('hidden', !visible);

// ----- Barra lateral -----

export function renderSidebar() {
  const query = $('search').value.toLowerCase();
  const matches = l => !query || (l.title + ' ' + l.notes).toLowerCase().includes(query);
  $('tree').innerHTML = state.db.folders.map(folder => `
    <div class="folder">
      <div class="fh" data-action="library.toggleFolder" data-arg="${folder.id}">
        <span>${folder.open ? '📂' : '📁'} ${esc(folder.name)}</span>
        <span>
          <button class="icon" data-action="library.renameFolder" data-arg="${folder.id}" title="Renomear">✏️</button>
          <button class="icon" data-action="library.deleteFolder" data-arg="${folder.id}" title="Excluir">🗑️</button>
        </span>
      </div>
      ${folder.open || query ? folder.lessons.filter(matches).map(l => `
        <div class="lesson ${l.id === state.cur ? 'active' : ''}" data-action="library.open" data-arg="${l.id}">
          <button class="icon edit" data-action="library.editLesson" data-arg="${l.id}" title="Editar nome e data">✏️</button>
          ${esc(l.title)}<small>${l.date ? '📅 ' + brDate(l.date) : '🕒 ' + esc(l.created)}</small>
        </div>`).join('') : ''}
    </div>`).join('');
}

// Data da aula guardada como AAAA-MM-DD (o formato do <input type="date">).
const isoToday = () => new Date().toLocaleDateString('sv');
const brDate = iso => iso.split('-').reverse().join('/');
function parseBrDate(text) {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  const date = new Date(y, mo - 1, d);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const folderById = id => state.db.folders.find(f => f.id === id);

// ----- Aula aberta -----

export async function openLesson(id) {
  if (!findLesson(id)) {
    if (!allLessons().length) createLesson();
    id = allLessons()[0].lesson.id;
  }
  state.cur = id;
  const lesson = currentLesson();
  $('title').value = lesson.title;
  $('lessonDate').value = lesson.date ?? '';
  ensurePages(lesson);
  syncNotes(lesson);
  openPage(lesson.pages[0].id);
  showDates(lesson);
  renderSidebar();
  $('side').classList.remove('open');
  // As imagens ficam no IndexedDB: carrega antes de desenhar galeria e slides.
  try {
    if (await migrateLesson(lesson, uid)) save();
    await loadImages(lessonImageIds(lesson));
  } catch (e) {
    console.warn('Imagens indisponíveis:', e);
  }
  if (state.cur === id) emit('lesson:open', lesson);
}

const showDates = l => ($('when').textContent = `Criada ${l.created} · Editada ${l.updated}`);

// ----- Várias anotações por aula -----

let curPage = null;
const currentPage = () => {
  const pages = ensurePages(currentLesson());
  return pages.find(p => p.id === curPage) ?? pages[0];
};

function renderPages() {
  const lesson = currentLesson();
  const page = currentPage();
  $('pages').innerHTML = lesson.pages.map(p => `
    <button class="page ${p.id === page.id ? 'on' : ''} ${p.use === false ? 'off' : ''}"
      data-action="page.open" data-arg="${p.id}" title="${p.use === false ? 'Fora do resumo, mapa e slides' : 'Usada no resumo, mapa e slides'}">${esc(p.title)}</button>`).join('') +
    `<button class="ghost" data-action="page.add">+ Anotação</button>`;
  $('pageUse').checked = page.use !== false;
}

function openPage(id) {
  curPage = id;
  $('notes').value = currentPage().text;
  renderPages();
}

async function newPage() {
  const lesson = currentLesson();
  const title = await ask('Nome da anotação:', 'Anotação ' + (ensurePages(lesson).length + 1));
  if (title === null) return;
  const page = addPage(lesson, title.trim() || 'Anotação');
  touch(lesson);
  save();
  openPage(page.id);
  $('notes').focus();
}

async function renamePage() {
  const page = currentPage();
  const title = await ask('Nome da anotação:', page.title);
  if (title === null) return;
  page.title = title.trim() || page.title;
  syncNotes(currentLesson());
  save();
  renderPages();
}

async function removePage() {
  const lesson = currentLesson();
  const page = currentPage();
  if (lesson.pages.length === 1) return toast('A aula precisa de pelo menos uma anotação');
  if (!(await sure(`Excluir a anotação "${page.title}"?`))) return;
  lesson.pages = lesson.pages.filter(p => p !== page);
  syncNotes(lesson);
  touch(lesson);
  save();
  openPage(lesson.pages[0].id);
}

function togglePageUse() {
  currentPage().use = $('pageUse').checked;
  syncNotes(currentLesson());
  save();
  renderPages();
  toast($('pageUse').checked ? 'Anotação usada no resumo, mapa e slides' : 'Anotação fora do resumo, mapa e slides');
}

let saveTimer;
function saveNotes() {
  const lesson = currentLesson();
  currentPage().text = $('notes').value;
  syncNotes(lesson);
  touch(lesson);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save();
    showDates(lesson);
  }, 400);
}

/** Acrescenta texto ao fim das notas da aula aberta (ditado, OCR, transcrição). */
export function appendNotes(text) {
  const notes = $('notes');
  const needsBreak = notes.value && !notes.value.endsWith('\n');
  notes.value += (needsBreak ? '\n' : '') + text;
  saveNotes();
}

/** Grava e redesenha tudo depois de mudanças feitas fora da UI (agente, backup). */
export function refresh() {
  save();
  openLesson(state.cur);
}

// ----- Ações -----

async function newFolder() {
  const name = await ask('Nome da pasta:', 'Matéria ' + (state.db.folders.length + 1));
  if (!name) return;
  createFolder(name.trim());
  save();
  renderSidebar();
}

async function newLesson() {
  let folder;
  if (state.db.folders.length > 1) {
    const list = state.db.folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
    const answer = await ask('Em qual pasta? (digite o número)\n' + list, '1');
    if (answer === null) return;
    folder = state.db.folders[parseInt(answer, 10) - 1]?.name;
  }
  const title = await ask('Nome da aula:', 'Aula de ' + brDate(isoToday()));
  if (title === null) return;
  const date = await askDate(brDate(isoToday()));
  if (date === null) return;
  const { lesson } = createLesson({ folder, title: title.trim() });
  if (date) lesson.date = date;
  save();
  openLesson(lesson.id);
}

// O nome muda na barra lateral enquanto a pessoa digita; ao sair do campo, grava.
function liveRename() {
  const lesson = currentLesson();
  lesson.title = $('title').value.trim() || 'Sem título';
  renderSidebar();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

function renameLesson() {
  liveRename();
  $('title').value = currentLesson().title;
  save();
  toast('Aula renomeada');
}

/** Pede uma data dd/mm/aaaa. Devolve AAAA-MM-DD, '' (sem data) ou null (cancelou). */
async function askDate(current) {
  for (let typed = current; ;) {
    typed = await ask('Data da aula (dd/mm/aaaa). Deixe vazio para não colocar data:', typed);
    if (typed === null) return null;
    if (!typed.trim()) return '';
    const date = parseBrDate(typed);
    if (date) return date;
    toast('Data inválida. Use o formato dd/mm/aaaa');
  }
}

/** ✏️ na barra lateral: edita nome e data de qualquer aula. */
async function editLesson(id) {
  const lesson = findLesson(id)?.lesson;
  if (!lesson) return;
  const title = await ask('Nome da aula:', lesson.title);
  if (title === null) return;
  lesson.title = title.trim() || 'Sem título';
  const date = await askDate(lesson.date ? brDate(lesson.date) : '');
  if (date !== null) lesson.date = date || undefined;
  save();
  if (id === state.cur) {
    $('title').value = lesson.title;
    $('lessonDate').value = lesson.date ?? '';
  }
  renderSidebar();
  toast('Aula atualizada');
}

function setLessonDate() {
  const lesson = currentLesson();
  lesson.date = $('lessonDate').value || undefined;
  save();
  renderSidebar();
  toast(lesson.date ? 'Data da aula: ' + brDate(lesson.date) : 'Data removida');
}

async function removeLesson() {
  const lesson = currentLesson();
  if (!lesson || !(await sure(`Excluir a aula "${lesson.title}"?`))) return;
  deleteLesson(lesson.id);
  refresh();
}

async function renameFolder(id) {
  const folder = folderById(id);
  const name = await ask('Renomear pasta:', folder.name);
  if (!name) return;
  folder.name = name.trim();
  save();
  renderSidebar();
}

async function removeFolder(id) {
  const folder = folderById(id);
  if (state.db.folders.length === 1) return toast('Precisa ter ao menos uma pasta');
  if (!(await sure(`Excluir a pasta "${folder.name}" e todas as aulas dela?`))) return;
  deleteFolder(id);
  refresh();
}

function toggleFolder(id) {
  const folder = folderById(id);
  folder.open = !folder.open;
  save();
  renderSidebar();
}

// ----- Backup -----

async function exportBackup() {
  // As imagens moram no IndexedDB; vão junto no arquivo para o backup ser completo.
  const ids = allLessons().flatMap(({ lesson }) => lessonImageIds(lesson));
  await loadImages(ids);
  const images = Object.fromEntries(ids.map(id => [id, imageSrc(id)]).filter(([, src]) => src));
  const data = JSON.stringify({ ...state.db, key: '', okey: '', images }); // nunca exporta as chaves
  saveFile(`estudaai-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([data], { type: 'application/json' }));
}

function importBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const { images = {}, ...data } = JSON.parse(reader.result);
      if (!Array.isArray(data.folders)) throw new Error('arquivo sem pastas');
      for (const [id, src] of Object.entries(images)) await putImage(id, src);
      state.db = { ...data, key: state.db.key, okey: state.db.okey };
      state.cur = null;
      refresh();
      toast('Backup restaurado');
    } catch (e) {
      toast('Backup inválido: ' + e.message);
    }
    input.value = '';
  };
  reader.readAsText(file);
}

register({
  'library.render': renderSidebar,
  'library.open': openLesson,
  'library.newFolder': newFolder,
  'library.newLesson': newLesson,
  'library.rename': renameLesson,
  'library.liveRename': liveRename,
  'library.editLesson': editLesson,
  'library.blurTitle': () => $('title').blur(),
  'library.setDate': setLessonDate,
  'library.deleteLesson': removeLesson,
  'library.renameFolder': renameFolder,
  'library.deleteFolder': removeFolder,
  'library.toggleFolder': toggleFolder,
  'library.toggleMenu': () => $('side').classList.toggle('open'),
  'library.saveNotes': saveNotes,
  'page.open': openPage,
  'page.add': newPage,
  'page.rename': renamePage,
  'page.delete': removePage,
  'page.toggleUse': togglePageUse,
  'backup.export': exportBackup,
  'backup.import': importBackup,
});
