// Utilitários de interface: seletor, escape de HTML, avisos e janelas de diálogo.

export const $ = id => document.getElementById(id);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

let toastTimer;
export function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export const show = (el, visible = true) => el.classList.toggle('hidden', !visible);

// Janela própria em vez de confirm()/prompt(): alguns navegadores embutidos
// bloqueiam essas janelas em silêncio.
function dialog(message, { input = false, value = '', type = 'text' } = {}) {
  return new Promise(resolve => {
    const box = $('dlg'), field = $('dlgIn'), ok = $('dlgOk'), cancel = $('dlgNo');
    $('dlgMsg').textContent = message;
    show(field, input);
    field.type = type;
    field.value = value;
    show(box);
    if (input) setTimeout(() => field.select(), 30);

    const done = result => {
      show(box, false);
      ok.onclick = cancel.onclick = field.onkeydown = null;
      resolve(result);
    };
    ok.onclick = () => done(input ? field.value : true);
    cancel.onclick = () => done(input ? null : false);
    field.onkeydown = e => {
      if (e.key === 'Enter') ok.click();
      if (e.key === 'Escape') cancel.click();
    };
  });
}

/** Pede um texto ao usuário. Resolve com o texto, ou null se cancelar. */
export const ask = (message, value = '') => dialog(message, { input: true, value });

/** Pede uma senha (campo escondido). Resolve com o texto, ou null se cancelar. */
export const askPassword = message => dialog(message, { input: true, type: 'password' });

/** Pede confirmação. Resolve com true ou false. */
export const sure = message => dialog(message);
