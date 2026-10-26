// Gamificação: XP por estudar, níveis e sequência de dias (🔥), com confete nas conquistas.
// Fica em state.db.xp, então vai junto para a nuvem quando ela está ligada.

import { $, toast } from '../core/dom.js';
import { state, save } from '../core/store.js';
import { on, emit } from '../core/events.js';

const PER_LEVEL = 100;
export const DAILY_GOAL = 30; // XP por dia para bater a meta (≈ 3 ações de estudo)
export const isoDay = (d = new Date()) => d.toLocaleDateString('sv');

const data = () => (state.db.xp ??= { xp: 0, streak: 0, last: null });
export const level = xp => Math.floor(xp / PER_LEVEL) + 1;

/** XP de hoje e dias estudados (para a meta do dia e a semana na tela Início). */
export function dailyStats() {
  const x = data();
  const today = isoDay();
  const alive = x.last === today || x.last === isoDay(new Date(Date.now() - 864e5));
  return {
    today: x.daily?.day === today ? x.daily.xp : 0,
    goal: DAILY_GOAL,
    days: new Set(x.days ?? []),
    streak: alive ? x.streak : 0,
    xp: x.xp,
    level: level(x.xp),
    toNext: PER_LEVEL - (x.xp % PER_LEVEL),
    pct: (x.xp % PER_LEVEL) / PER_LEVEL,
  };
}

/** Soma o XP do dia e guarda os últimos 60 dias em que houve estudo. */
function trackDay(points) {
  const x = data();
  const today = isoDay();
  if (x.daily?.day !== today) x.daily = { day: today, xp: 0 };
  x.daily.xp += points;
  x.days = [...new Set([...(x.days ?? []), today])].slice(-60);
}

/** Conta o dia de estudo: continua a sequência se ontem teve estudo, senão recomeça. */
function touchStreak() {
  const x = data();
  const today = isoDay();
  if (x.last === today) return false;
  const yesterday = isoDay(new Date(Date.now() - 864e5));
  x.streak = x.last === yesterday ? x.streak + 1 : 1;
  x.last = today;
  return true;
}

/** Dá XP por uma ação de estudo. */
export function award(points, reason = '') {
  if (!state.db) return;
  const x = data();
  const before = level(x.xp);
  const newDay = touchStreak();
  const goalBefore = dailyStats().today >= DAILY_GOAL;
  x.xp += points;
  trackDay(points);
  save();
  render();
  emit('xp:changed');
  if (!goalBefore && dailyStats().today >= DAILY_GOAL) {
    confetti();
    return toast('🎯 Meta do dia batida! Mandou bem!');
  }
  if (level(x.xp) > before) {
    confetti();
    toast(`🎉 Subiu para o nível ${level(x.xp)}!`);
  } else if (newDay && x.streak > 1) {
    confetti(14);
    toast(`🔥 ${x.streak} dias seguidos estudando!`);
  } else {
    toast(`+${points} XP ${reason}`.trim());
  }
}

export function render() {
  const box = $('xpBar');
  if (!box || !state.db) return;
  const x = data();
  const alive = x.last === isoDay() || x.last === isoDay(new Date(Date.now() - 864e5));
  const streak = alive ? x.streak : 0;
  const pct = (x.xp % PER_LEVEL) / PER_LEVEL * 100;
  box.innerHTML = `
    <div class="xp-row">
      <span class="xp-chip" title="Dias seguidos estudando">🔥 ${streak} ${streak === 1 ? 'dia' : 'dias'}</span>
      <span class="xp-chip" title="${x.xp} XP no total">⭐ Nível ${level(x.xp)}</span>
    </div>
    <div class="xp-track" title="${x.xp % PER_LEVEL}/${PER_LEVEL} XP para o próximo nível"><i style="width:${pct}%"></i></div>`;
}

/** Chuva de emojis rápida, sem biblioteca. */
export function confetti(count = 28) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const emojis = ['🎉', '✨', '⭐', '💙', '🎊', '🔥'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'confetti';
    el.textContent = emojis[i % emojis.length];
    el.style.left = Math.random() * 100 + 'vw';
    el.style.animationDelay = Math.random() * 0.4 + 's';
    el.style.fontSize = 16 + Math.random() * 18 + 'px';
    document.body.append(el);
    setTimeout(() => el.remove(), 2200);
  }
}

on('lesson:open', render);
