// Registro central de ações.
// Cada módulo registra suas ações por nome ("slides.build", "library.newFolder"...)
// e o HTML só referencia esses nomes via data-action / data-change / data-input / data-enter.
// Assim os botões, os comandos de voz e o agente disparam exatamente o mesmo código.

const actions = new Map();

export function register(map) {
  for (const [name, fn] of Object.entries(map)) {
    if (actions.has(name)) console.warn(`Ação duplicada: ${name}`);
    actions.set(name, fn);
  }
}

export function run(name, ...args) {
  const fn = actions.get(name);
  if (!fn) {
    console.warn(`Ação não registrada: ${name}`);
    return;
  }
  return fn(...args);
}

export const hasAction = name => actions.has(name);
