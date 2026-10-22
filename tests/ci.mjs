// Roda tests/index.html num Chrome sem janela (Playwright) e falha se algum teste falhar.
// Uso no CI:  node tests/ci.mjs http://localhost:8080/tests/

import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:8080/tests/';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.error('Erro na página:', e.message));

await page.goto(url);
await page.waitForFunction(() => window.testResults, null, { timeout: 30_000 });
const results = await page.evaluate(() => window.testResults);
const report = await page.locator('#results').innerText();
await browser.close();

console.log(report);
if (results.failed > 0 || results.total === 0) {
  console.error(`\n${results.failed} teste(s) falharam.`);
  process.exit(1);
}
console.log(`\n${results.passed}/${results.total} testes passaram.`);
