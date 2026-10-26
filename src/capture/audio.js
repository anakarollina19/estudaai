// Gravação de áudio (MediaRecorder) e transcrição de arquivos de áudio.
// Dois motores:
//   local   Whisper rodando no navegador (Transformers.js): grátis, sem chave, offline depois do 1º uso
//   openai  Whisper da OpenAI: mais preciso, precisa da chave em ⚙️

import { $, toast, sure } from '../core/dom.js';
import { register } from '../core/actions.js';
import { state, currentLesson } from '../core/store.js';
import { saveFile } from '../core/files.js';
import { createPipeline } from '../ai/transformers.js';
import { appendNotes } from '../library.js';

const LOCAL_MODEL = 'Xenova/whisper-base';
const SAMPLE_RATE = 16000; // o Whisper espera áudio mono a 16 kHz
const LANGUAGES = { pt: 'portuguese', en: 'english', es: 'spanish' };

let recorder = null;
let timer = null;

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
    saveFile(`${currentLesson().title} - ${new Date().toLocaleTimeString('pt-BR')}.webm`, blob);
    $('recBtn').textContent = 'Gravar';
    $('recInfo').textContent = 'salvo no dispositivo';
    if (await sure('Transcrever esta gravação agora?')) transcribe(new File([blob], 'gravação da aula.webm'));
  };
  recorder.start();
  const started = Date.now();
  timer = setInterval(() => ($('recInfo').textContent = `⏺ ${Math.floor((Date.now() - started) / 1000)}s`), 500);
  $('recBtn').textContent = '⏹️ Parar';
}

// ----- Motor local -----

let whisperPromise = null;

function localWhisper(onProgress) {
  whisperPromise ??= createPipeline('automatic-speech-recognition', LOCAL_MODEL, onProgress);
  whisperPromise.catch(() => (whisperPromise = null));
  return whisperPromise;
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

async function transcribeLocal(file, out) {
  out.textContent = 'Preparando o modelo de transcrição...';
  const whisper = await localWhisper(p => (out.textContent = `Baixando o modelo de transcrição (só na 1ª vez)... ${p}%`));
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
  try {
    const engine = $('sttEngine').value;
    const text = engine === 'openai' ? await transcribeOpenAI(file, out) : await transcribeLocal(file, out);
    if (!text) throw new Error('não encontrei fala neste áudio.');
    appendNotes(`\n# Transcrição: ${file.name}\n${text}`);
    out.textContent = `✅ Transcrição de "${file.name}" adicionada às anotações (${minutes((Date.now() - started) / 1000)}).`;
  } catch (e) {
    out.textContent = '⚠️ ' + e.message;
  } finally {
    busy = false;
  }
}

register({
  'audio.record': toggleRecording,
  'audio.transcribeFile': input => {
    const file = input.files[0];
    input.value = '';
    if (file) transcribe(file);
  },
});
