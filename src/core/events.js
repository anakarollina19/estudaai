// Barramento de eventos simples, para os módulos reagirem sem depender uns dos outros.
// Eventos usados no app:
//   "lesson:open"   (lesson)  uma aula foi aberta
//   "tab:show"      (name)    uma aba ficou visível
//   "storage:full"            o localStorage não coube

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, ...args) {
  for (const fn of listeners.get(event) ?? []) fn(...args);
}
