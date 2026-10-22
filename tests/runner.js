// Mini executor de testes para o navegador (sem dependências).

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(condition, message = 'esperava verdadeiro') {
  if (!condition) throw new Error(message);
}

export function equal(actual, expected, message = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  esperado: ${e}\n  recebido: ${a}`);
}

export async function runAll(target) {
  let passed = 0;
  const lines = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      lines.push(`<li class="ok">✔ ${name}</li>`);
    } catch (e) {
      lines.push(`<li class="fail">✘ ${name}<pre>${e.message}</pre></li>`);
    }
  }
  const failed = tests.length - passed;
  target.innerHTML = `<h2 class="${failed ? 'fail' : 'ok'}">${passed}/${tests.length} testes passaram</h2><ul>${lines.join('')}</ul>`;
  window.testResults = { passed, failed, total: tests.length };
  return window.testResults;
}
