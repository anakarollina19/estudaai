// Salvar arquivos: numa pasta escolhida do computador (File System Access API)
// ou, se não houver pasta, como download normal.

import { $, toast } from './dom.js';
import { register } from './actions.js';

let dir = null;

async function pickDir() {
  if (!window.showDirectoryPicker) {
    toast('Seu navegador não permite escolher pasta (use Chrome ou Edge no computador). Os arquivos vão para Downloads.');
    return;
  }
  try {
    dir = await showDirectoryPicker({ mode: 'readwrite' });
    $('dirBtn').textContent = '📁 Salvando em: ' + dir.name;
    toast(`PDFs, slides, áudios e quadros serão salvos em "${dir.name}"`);
  } catch {
    // usuário cancelou
  }
}

const safeName = name => name.replace(/[\\/:*?"<>|]/g, '-');

export async function saveFile(name, blob) {
  name = safeName(name);
  if (dir) {
    try {
      const handle = await dir.getFileHandle(name, { create: true });
      const writer = await handle.createWritable();
      await writer.write(blob);
      await writer.close();
      toast(`💾 Salvo em ${dir.name}/${name}`);
      return;
    } catch {
      toast('Sem permissão na pasta, baixando...');
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Abre o seletor de pasta e devolve as imagens dela, em ordem de modificação. */
export async function pickImagesFromDir() {
  if (!window.showDirectoryPicker) {
    toast('Use "Escolher imagens" neste navegador');
    return [];
  }
  try {
    const folder = await showDirectoryPicker();
    const files = [];
    for await (const entry of folder.values()) {
      if (entry.kind === 'file' && /\.(jpe?g|png|webp|bmp)$/i.test(entry.name)) files.push(await entry.getFile());
    }
    return files.sort((a, b) => a.lastModified - b.lastModified);
  } catch {
    return [];
  }
}

register({ 'files.pickDir': pickDir });
