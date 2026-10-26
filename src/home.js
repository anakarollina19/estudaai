// Tela Início: saudação com o mascote, "continue de onde parou", ferramentas,
// aulas recentes, meta do dia (anel) e progresso. Tudo calculado dos dados que já existem.

import { $, esc } from './core/dom.js';
import { register, run } from './core/actions.js';
import { on } from './core/events.js';
import { state, allLessons } from './core/store.js';
import { dailyStats, isoDay } from './study/xp.js';

/** "26/10/2026, 14:29:08" → número para ordenar (as datas são guardadas em pt-BR). */
function brTime(text = '') {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? new Date(m[3], m[2] - 1, m[1], m[4], m[5], m[6] ?? 0).getTime() : 0;
}

const recentLessons = () => allLessons().sort((a, b) => brTime(b.lesson.updated) - brTime(a.lesson.updated));

/** Etapas de estudo de uma aula, para a barra de progresso. */
function lessonSteps(lesson) {
  return [
    ['📝', 'anotações', (lesson.notes ?? '').trim().length > 80],
    ['📷', 'fotos ou áudio', (lesson.images?.length ?? 0) + (lesson.transcripts?.length ?? 0) > 0],
    ['✨', 'resumo', Boolean(lesson.summary)],
    ['🎞️', 'slides', (lesson.slides?.length ?? 0) > 1],
  ];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const TOOLS = [
  ['gravar', '🎙️', 'Gravar aula', 'Grava e transcreve', 'lilas'],
  ['foto', '📷', 'Foto do quadro', 'Lê o texto da foto', 'rosa'],
  ['notas', '📝', 'Anotações', 'Folha de caderno', 'amarelo'],
  ['resumo', '✨', 'Resumo', 'Com IA ou offline', 'verde'],
  ['flash', '🃏', 'Flashcards', 'Revise brincando', 'laranja'],
  ['slides', '🎞️', 'Slides', 'Interativos com quiz', 'azul'],
  ['agente', '🤖', 'Agente', 'Peça e ele faz', 'lilas'],
  ['perguntar', '🔎', 'Pergunte às aulas', 'Respostas com fonte', 'rosa'],
];

const WEEK = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/** Dias da semana atual (segunda a domingo) com estudo. */
function weekDays(studied) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return WEEK.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = isoDay(d);
    return { label, done: studied.has(iso), today: iso === isoDay(now), future: d > now };
  });
}

function ring(value, goal) {
  const r = 46, c = 2 * Math.PI * r, pct = Math.min(1, value / goal);
  return `
    <svg viewBox="0 0 120 120" class="ring" aria-label="${value} de ${goal} XP hoje">
      <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
      <circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
    </svg>
    <div class="ring-label"><span>${pct >= 1 ? '🎯' : '🔥'}</span><b>${value}<small>/${goal}</small></b><em>XP hoje</em></div>`;
}

export function renderHome() {
  if (!state.db || !$('homeHero')) return;
  const name = (state.users[state.me]?.name ?? '').split(' ')[0];
  const stats = dailyStats();
  const recent = recentLessons();
  const last = recent[0];

  $('homeHero').innerHTML = `
    <div class="hero-text">
      <h2>${greeting()},<br><span>${esc(name || 'estudante')}!</span> 👋</h2>
      <p>${stats.today >= stats.goal ? 'Meta de hoje batida! Que tal revisar com flashcards?' : 'Uma aula de cada vez. Bora continuar?'}</p>
      <button class="primary big" data-action="home.continue">Continuar estudando →</button>
    </div>
    <img src="img/mascote.svg" alt="" class="hero-mascot">`;

  if (last) {
    const steps = lessonSteps(last.lesson);
    const done = steps.filter(s => s[2]).length;
    const next = steps.find(s => !s[2]);
    $('homeContinue').innerHTML = `
      <div class="continue-icon">📘</div>
      <div class="continue-body">
        <b>${esc(last.lesson.title)}</b>
        <span class="muted">${esc(last.folder.name)} · editada ${esc(last.lesson.updated.split(',')[0])}</span>
        <div class="progress"><i style="width:${(done / steps.length) * 100}%"></i></div>
        <span class="muted small">${done} de ${steps.length} etapas${next ? ` · próximo: ${next[0]} ${next[1]}` : ' · aula completa 🎉'}</span>
      </div>
      <button class="primary" data-action="home.open" data-arg="${last.lesson.id}">▶ Abrir</button>`;
  }

  $('homeTools').innerHTML = TOOLS.map(([key, icon, title, sub, color]) => `
    <button class="tool-tile ${color}" data-action="home.tool" data-arg="${key}">
      <span class="tile-icon">${icon}</span><b>${title}</b><small>${sub}</small><i>→</i>
    </button>`).join('');

  $('homeRecent').innerHTML = recent.slice(0, 6).map(({ lesson, folder }) => `
    <button class="recent" data-action="home.open" data-arg="${lesson.id}">
      <b>${esc(lesson.title)}</b><small>📁 ${esc(folder.name)}</small>
    </button>`).join('');

  const totals = allLessons().reduce((t, { lesson }) => ({
    aulas: t.aulas + 1,
    fotos: t.fotos + (lesson.images?.length ?? 0),
    audios: t.audios + (lesson.transcripts?.length ?? 0),
  }), { aulas: 0, fotos: 0, audios: 0 });

  $('homeGoal').innerHTML = `
    <div class="row between"><b>Meta do dia</b><span class="pill">🔥 ${stats.streak} ${stats.streak === 1 ? 'dia' : 'dias'}</span></div>
    <div class="ring-wrap">${ring(stats.today, stats.goal)}</div>
    <p class="muted small center">${stats.today >= stats.goal ? 'Você bateu a meta de hoje!' : `Faltam ${stats.goal - stats.today} XP. Cada resumo, foto ou anotação conta.`}</p>
    <div class="week">${weekDays(stats.days).map(d => `
      <span class="${d.done ? 'done' : ''} ${d.today ? 'today' : ''} ${d.future ? 'future' : ''}">
        <i>${d.done ? '✓' : ''}</i>${d.label}</span>`).join('')}</div>`;

  $('homeStats').innerHTML = `
    <div class="row between"><b>Seu progresso</b><span class="pill">⭐ Nível ${stats.level}</span></div>
    <div class="progress"><i style="width:${stats.pct * 100}%"></i></div>
    <span class="muted small">${stats.toNext} XP para o nível ${stats.level + 1}</span>
    <div class="stat-grid">
      <div><b>${totals.aulas}</b><small>aulas</small></div>
      <div><b>${totals.fotos}</b><small>fotos</small></div>
      <div><b>${totals.audios}</b><small>áudios</small></div>
    </div>`;
}

function openLessonTab(id, tab = 'notas') {
  run('library.open', id);
  run('tab.show', tab);
}

const TOOL_ACTIONS = {
  gravar: () => { run('tab.show', 'notas'); run('audio.record'); },
  foto: () => document.querySelector('#captureBar input[capture]')?.click(),
  notas: () => run('tab.show', 'notas'),
  resumo: () => run('summary.make'),
  flash: () => run('summary.flashcards'),
  slides: () => run('slides.build'),
  agente: () => run('tab.show', 'agente'),
  perguntar: () => run('tab.show', 'perguntar'),
};

// No Início, o cabeçalho e a barra da aula aberta somem: a tela é sobre todas as aulas.
on('tab:show', name => {
  document.body.classList.toggle('on-home', name === 'inicio');
  if (name === 'inicio') renderHome();
});
on('xp:changed', () => !$('homeHero')?.closest('.hidden') && renderHome());

register({
  'home.continue': () => {
    const last = recentLessons()[0];
    if (last) openLessonTab(last.lesson.id);
  },
  'home.open': id => openLessonTab(id),
  'home.tool': key => TOOL_ACTIONS[key]?.(),
});
