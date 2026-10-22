export const uid = () => Math.random().toString(36).slice(2, 9);

export const nowStr = () => new Date().toLocaleString('pt-BR');

export const timeHM = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const today = () => new Date().toLocaleDateString('pt-BR');

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Corta um texto com reticências. */
export const clip = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text);
