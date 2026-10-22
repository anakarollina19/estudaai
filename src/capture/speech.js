// Voz: ditado contínuo para as notas e comandos de voz (Web Speech API, Chrome/Edge).

import { $, toast } from '../core/dom.js';
import { register, run } from '../core/actions.js';
import { appendNotes } from '../library.js';

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

/** Cria um reconhecedor que se reinicia sozinho enquanto `isOn()` for verdadeiro. */
function listener({ lang, interim, onResult, isOn, onStop }) {
  const rec = new Recognition();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = interim;
  rec.onresult = onResult;
  rec.onend = () => (isOn() ? rec.start() : onStop?.());
  rec.start();
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
    onResult: e => {
      const phrase = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
      const command = matchCommand(phrase);
      toast(command ? '🎙️ ' + phrase : 'Não entendi: ' + phrase);
      command?.();
    },
  });
  $('voiceBtn').textContent = '🔴 Ouvindo comandos';
  toast('Diga: "nova aula", "resumo", "slides", "pesquisar ...", "renomear para ..."');
}

register({
  'dictation.toggle': toggleDictation,
  'voice.toggle': toggleVoiceCommands,
});
