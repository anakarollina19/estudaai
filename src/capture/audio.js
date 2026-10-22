// Gravação de áudio (MediaRecorder) e transcrição de arquivos com Whisper (OpenAI).

import { $, toast, sure } from '../core/dom.js';
import { register } from '../core/actions.js';
import { state, currentLesson } from '../core/store.js';
import { saveFile } from '../core/files.js';
import { appendNotes } from '../library.js';

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
    if (state.db.okey && (await sure('Transcrever esta gravação com Whisper?'))) {
      transcribe(new File([blob], 'aula.webm'));
    }
  };
  recorder.start();
  const started = Date.now();
  timer = setInterval(() => ($('recInfo').textContent = `⏺ ${Math.floor((Date.now() - started) / 1000)}s`), 500);
  $('recBtn').textContent = '⏹️ Parar';
}

async function transcribe(file) {
  const out = $('trOut');
  if (!state.db.okey) {
    out.textContent = 'Adicione a chave da OpenAI em ⚙️ para transcrever arquivos. Alternativa: toque o áudio perto do microfone e use 🎤 Ditar.';
    return;
  }
  out.textContent = `Transcrevendo ${file.name}...`;
  const form = new FormData();
  form.append('file', file);
  form.append('model', 'whisper-1');
  form.append('language', $('lang').value.slice(0, 2));
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.db.okey },
      body: form,
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    appendNotes(`\n# Transcrição: ${file.name}\n${json.text}`);
    out.textContent = '✅ Transcrição adicionada às notas';
  } catch (e) {
    out.textContent = 'Erro: ' + e.message;
  }
}

register({
  'audio.record': toggleRecording,
  'audio.transcribeFile': input => {
    if (input.files[0]) transcribe(input.files[0]);
    input.value = '';
  },
});
