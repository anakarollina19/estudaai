// Configuração da nuvem (Supabase). Com os dois campos vazios, o app funciona como antes:
// contas e aulas só no navegador de cada aparelho.
// Os valores ficam em Supabase → Project Settings → API. A "anon key" pode ser pública;
// NUNCA coloque aqui a "service_role" key.

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export const cloudEnabled = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
