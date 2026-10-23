// Voz: ditado contínuo para as notas e comandos de voz (Web Speech API, Chrome/Edge).

import { $, toast } from '../core/dom.js';
import { register, run } from '../core/actions.js';
import { appendNotes } from '../library.js';

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

const SPEECH_ERRORS = {
  'not-allowed': 'Microfone bloqueado. Permita o microfone no ícone 🔒 da barra de endereço.',
  'service-not-allowed': 'Microfone bloqueado. Permita o microfone no ícone 🔒 da barra de endereço.',
  'audio-capture': 'Nenhum microfone encontrado.',
  'network': 'O reconhecimento de voz precisa de internet.',
  'language-not-supported': 'Idioma não suportado pelo reconhecimento de voz.',
};

/** Cria um reconhecedor que se reinicia sozinho enquanto `isOn()` for verdadeiro. */
function listener({ lang, interim, onResult, isOn, onStop, onFatal }) {
  const rec = new Recognition();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = interim;
  rec.onresult = onResult;
  let fatal = false;
  rec.onerror = e => {
    // "no-speech" e "aborted" são normais (silêncio, parada): o onend reinicia.
    if (!SPEECH_ERRORS[e.error]) return;
    fatal = true;
    toast(SPEECH_ERRORS[e.error]);
    onFatal?.();
  };
  rec.onend = () => {
    if (!fatal && isOn()) {
      try { rec.start(); } catch { onFatal?.(); }
    } else onStop?.();
  };
  try {
    rec.start();
  } catch {
    toast('Não foi possível iniciar o microfone neste navegador.');
    onFatal?.();
  }
  return rec;
}

// ----- Ditado -----

let dictation = null;
let dictating = false;

function toggleDictation() {
  if (!Recognition) return toast('Use Chrome ou Edge para ditado por voz');
  if (dictating) {
    dictating = false;
    dictation.stop();
    return;
  }
  dictating = true;
  dictation = listener({
    lang: $('lang').value,
    interim: true,
    isOn: () => dictating,
    onFatal: () => (dictating = false),
    onResult: e => {
      let final = '', partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else partial += r[0].transcript;
      }
      if (final) appendNotes(final.trim().replace(/^./, c => c.toUpperCase()) + '.');
      $('dictState').textContent = partial ? '… ' + partial.slice(-40) : 'ouvindo';
    },
    onStop: () => {
      $('dictState').textContent = 'parado';
      $('dictBtn').textContent = '🎤 Ditar / transcrever aula ao vivo';
    },
  });
  if (!dictating) return;
  $('dictBtn').textContent = '⏹️ Parar ditado';
  $('dictState').textContent = 'ouvindo';
}

// ----- Comandos de voz -----
// Cada comando aponta para uma ação registrada, a mesma que os botões usam.

export const VOICE_COMMANDS = [
  [/nova aula/, () => run('library.newLesson')],
  [/nova pasta/, () => run('library.newFolder')],
  [/resumo|resumir/, () => run('summary.make')],
  [/mapa mental/, () => run('summary.mindmap')],
  [/flashcard/, () => run('summary.flashcards')],
  [/slide/, () => run('slides.build')],
  [/pdf/, () => run('pdf.lesson')],
  [/quadro/, () => run('tab.show', 'quadro')],
  [/anota|notas/, () => run('tab.show', 'notas')],
  [/foto|câmera|camera/, () => run('tab.show', 'captura')],
  [/agente/, () => run('tab.show', 'agente')],
  [/ditar|ditado/, () => { run('tab.show', 'notas'); toggleDictation(); }],
  [/próximo|avançar/, () => run('slides.nextSlide')],
  [/voltar|anterior/, () => run('slides.prev')],
  [/(?:pesquisar|pesquise|google) (.+)/, m => { $('gq').value = m[1]; run('web.google'); }],
  [/renomear (?:aula )?(?:para )?(.+)/, m => { $('title').value = m[1]; run('library.rename'); }],
];

/** Encontra o comando para uma frase falada. Devolve a função já ligada ao resultado, ou null. */
export function matchCommand(phrase) {
  for (const [pattern, fn] of VOICE_COMMANDS) {
    const m = phrase.match(pattern);
    if (m) return () => fn(m);
  }
  return null;
}

let commands = null;
let listening = false;

function toggleVoiceCommands() {
  if (!Recognition) return toast('Use Chrome ou Edge para comandos de voz');
  if (listening) {
    listening = false;
    commands.stop();
    $('voiceBtn').textContent = '🎙️ Comandos de voz';
    return;
  }
  listening = true;
  commands = listener({
    lang: 'pt-BR',
    interim: false,
    isOn: () => listening,
    onFatal: () => (listening = false),
    onStop: () => ($('voiceBtn').textContent = '🎙️ Comandos de voz'),
    onResult: e => {
      const phrase = e.results[e.resultIndex][0].transcript.toLowerCase().trim().replace(/[.!?]$/, '');
      const command = matchCommand(phrase);
      toast(command ? '🎙️ ' + phrase : 'Não entendi: ' + phrase);
      command?.();
    },
  });
  if (!listening) return;
  $('voiceBtn').textContent = '🔴 Ouvindo comandos';
  toast('Diga: "nova aula", "resumo", "slides", "pesquisar ...", "renomear para ..."');
}

register({
  'dictation.toggle': toggleDictation,
  'voice.toggle': toggleVoiceCommands,
});
