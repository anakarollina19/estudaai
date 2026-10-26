// Gravação de áudio (MediaRecorder) e transcrição de arquivos de áudio.
// Dois motores:
//   local   Whisper rodando no navegador (Transformers.js): grátis, sem chave, offline depois do 1º uso
//   openai  Whisper da OpenAI: mais preciso, precisa da chave em ⚙️

import { $, esc, toast, sure, show } from '../core/dom.js';
import { register } from '../core/actions.js';
import { on } from '../core/events.js';
import { state, currentLesson, save, touch } from '../core/store.js';
import { saveFile } from '../core/files.js';
import { uid, timeHM } from '../core/util.js';
import { createPipeline } from '../ai/transformers.js';
import { appendNotes, insertAtCursor } from '../library.js';

// Modelos grátis: o "base" é leve e rápido; o "small" erra menos palavras técnicas.
const LOCAL_MODELS = { local: 'Xenova/whisper-base', 'local-small': 'Xenova/whisper-small' };
const SAMPLE_RATE = 16000; // o Whisper espera áudio mono a 16 kHz
const LANGUAGES = { pt: 'portuguese', en: 'english', es: 'spanish' };

// ----- Gravação (botão na barra de captura, funciona em qualquer aba) -----

let recorder = null;
let timer = null;
let recStarted = 0;

const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** "03:12" se está gravando (para marcar fotos e notas no tempo do áudio), senão null. */
export const recordingTime = () => (recorder?.state === 'recording' ? clock((Date.now() - recStarted) / 1000) : null);

async function toggleRecording() {
  if (recorder?.state === 'recording') {
    recorder.stop();
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return toast('Microfone bloqueado. Permita o acesso no navegador.');
  }
  const chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(timer);
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const name = `${currentLesson().title} - gravação ${timeHM().replace(':', 'h')}.webm`;
    saveFile(name, blob);
    $('recBtn').textContent = '⏺ Gravar';
    $('recBtn').classList.remove('live');
    $('recInfo').textContent = `💾 ${clock((Date.now() - recStarted) / 1000)} salvos`;
    if (await sure('Gravação salva. Transcrever agora?')) transcribe(new File([blob], name));
  };
  recorder.start(1000);
  recStarted = Date.now();
  show($('recInfo'));
  const tick = () => ($('recInfo').textContent = `🔴 ${recordingTime()}`);
  tick();
  timer = setInterval(tick, 500);
  $('recBtn').textContent = '⏹️ Parar';
  $('recBtn').classList.add('live');
  toast('Gravando. Pode continuar escrevendo e tirando fotos.');
}

// ----- Motor local -----

const whisperPromises = {};

function localWhisper(engine, onProgress) {
  whisperPromises[engine] ??= createPipeline('automatic-speech-recognition', LOCAL_MODELS[engine], onProgress);
  whisperPromises[engine].catch(() => delete whisperPromises[engine]);
  return whisperPromises[engine];
}

/** Decodifica qualquer formato que o navegador entenda para mono 16 kHz (Float32Array). */
async function decodeAudio(file) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
    const [left, right] = [buffer.getChannelData(0), buffer.getChannelData(1)];
    return left.map((v, i) => (v + right[i]) / 2);
  } catch {
    throw new Error('não consegui abrir este formato de áudio no navegador. Tente converter para mp3 ou use o modo OpenAI.');
  } finally {
    ctx.close();
  }
}

const minutes = seconds => `${Math.floor(seconds / 60)}min${String(Math.round(seconds % 60)).padStart(2, '0')}s`;

async function transcribeLocal(file, out, engine) {
  out.textContent = 'Preparando o modelo de transcrição...';
  const whisper = await localWhisper(engine, p => (out.textContent = `Baixando o modelo de transcrição (só na 1ª vez)... ${p}%`));
  out.textContent = 'Lendo o áudio...';
  const audio = await decodeAudio(file);
  const duration = audio.length / SAMPLE_RATE;
  out.textContent = `Transcrevendo ${minutes(duration)} de áudio... isso leva mais ou menos o tempo do próprio áudio. Não feche a página.`;
  const result = await whisper(audio, {
    language: LANGUAGES[$('lang').value.slice(0, 2)] ?? 'portuguese',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return result.text.trim();
}

// ----- Motor OpenAI -----

async function transcribeOpenAI(file, out) {
  if (!state.db.okey) throw new Error('adicione a chave da OpenAI em ⚙️ ou escolha o modo grátis.');
  out.textContent = `Enviando ${file.name} para a OpenAI...`;
  const form = new FormData();
  form.append('file', file);
  form.append('model', 'whisper-1');
  form.append('language', $('lang').value.slice(0, 2));
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + state.db.okey },
    body: form,
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.text.trim();
}

// ----- Fluxo -----

let busy = false;

async function transcribe(file) {
  const out = $('trOut');
  if (busy) return toast('Já tem uma transcrição em andamento');
  busy = true;
  const started = Date.now();
  // O andamento também aparece na barra de captura, para quem está escrevendo em outra aba.
  const mirror = new MutationObserver(() => ($('capState').textContent = '🎧 ' + out.textContent.slice(0, 70)));
  mirror.observe(out, { childList: true, characterData: true, subtree: true });
  try {
    const engine = $('sttEngine').value;
    const text = engine === 'openai' ? await transcribeOpenAI(file, out) : await transcribeLocal(file, out, engine);
    if (!text) throw new Error('não encontrei fala neste áudio.');
    const lesson = currentLesson();
    (lesson.transcripts ??= []).unshift({ id: uid(), name: file.name, time: timeHM(), text, open: true });
    touch(lesson);
    appendNotes(`\n# Transcrição: ${file.name}\n${text}`);
    save();
    renderTranscripts();
    out.textContent = `✅ Transcrição de "${file.name}" pronta (${minutes((Date.now() - started) / 1000)}). Está aqui embaixo e nas anotações.`;
  } catch (e) {
    out.textContent = '⚠️ ' + e.message;
  } finally {
    busy = false;
    mirror.disconnect();
    $('capState').textContent = '🎧 ' + out.textContent.slice(0, 70);
    setTimeout(() => $('capState').textContent.startsWith('🎧') && ($('capState').textContent = ''), 6000);
  }
}

// ----- Transcrições da aula (embaixo do áudio): editar, copiar, colar na anotação -----

const findTranscript = id => currentLesson().transcripts?.find(t => t.id === id);

export function renderTranscripts() {
  const list = currentLesson()?.transcripts ?? [];
  $('transcripts').innerHTML = list.length ? `<b>📝 Transcrições desta aula (${list.length})</b>` + list.map(t => `
    <div class="card flat transcript ${t.open ? 'open' : ''}">
      <div class="row between" data-action="transcript.toggle" data-arg="${t.id}" title="Mostrar ou esconder o texto">
        <b>🎧 ${esc(t.name)}</b>
        <span class="pill">🕒 ${esc(t.time)} · ${t.text.split(/\s+/).length} palavras ${t.open ? '▴' : '▾'}</span>
      </div>
      <textarea class="tr-text" rows="5" data-input="transcript.edit" data-id="${t.id}"
        aria-label="Texto da transcrição (pode editar)">${esc(t.text)}</textarea>
      <div class="row tr-tools">
        <button data-action="transcript.copy" data-arg="${t.id}">📋 Copiar</button>
        <button data-action="transcript.insert" data-arg="${t.id}" title="Insere onde o cursor estava na anotação aberta">📥 Colar na anotação</button>
        <button class="icon" data-action="transcript.delete" data-arg="${t.id}" title="Apagar esta transcrição">🗑️</button>
      </div>
    </div>`).join('') : '';
}

/** Copia texto para a área de transferência, com plano B para navegadores que bloqueiam. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('📋 Copiado! Cole onde quiser com Ctrl+V');
}

let editTimer;

on('lesson:open', renderTranscripts);

register({
  'transcript.toggle': id => {
    const t = findTranscript(id);
    t.open = !t.open;
    save();
    renderTranscripts();
  },
  'transcript.edit': area => {
    findTranscript(area.dataset.id).text = area.value;
    clearTimeout(editTimer);
    editTimer = setTimeout(save, 500);
  },
  'transcript.copy': id => copyText(findTranscript(id).text),
  'transcript.insert': id => {
    const t = findTranscript(id);
    insertAtCursor(`\n${t.text}\n`);
    toast('📥 Colado na anotação aberta');
  },
  'transcript.delete': async id => {
    if (!(await sure('Apagar esta transcrição? (o texto que já foi para as anotações continua lá)'))) return;
    const lesson = currentLesson();
    lesson.transcripts = lesson.transcripts.filter(t => t.id !== id);
    save();
    renderTranscripts();
  },
  'audio.record': toggleRecording,
  'audio.transcribeFile': input => {
    const file = input.files[0];
    input.value = '';
    if (file) transcribe(file);
  },
});
