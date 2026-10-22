// Exportação em PDF (jsPDF, carregado como global pelo index.html).

import { toast } from '../core/dom.js';
import { register } from '../core/actions.js';
import { currentLesson } from '../core/store.js';
import { saveFile } from '../core/files.js';
import { currentSlides } from '../slides/slides.js';
import { imageSrc } from '../capture/images.js';

// As fontes padrão do jsPDF não têm emojis; removemos o que estiver fora do Latin-1.
const latin1 = text => text.replace(/[^\x00-\xFF•]/g, '').trim();

/** Escreve texto quebrando linhas e páginas. Devolve a nova posição y. */
function writeText(doc, text, y, { x = 15, width = 180, lineHeight = 6 } = {}) {
  for (const line of doc.splitTextToSize(latin1(text), width)) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

/** Imagem ajustada à caixa, mantendo a proporção. Devolve a altura usada. */
function addFitted(doc, src, x, y, maxW, maxH) {
  const p = doc.getImageProperties(src);
  const k = Math.min(maxW / p.width, maxH / p.height);
  doc.addImage(src, src.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, p.width * k, p.height * k);
  return p.height * k;
}

export function lessonPdf(lesson) {
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(18);
  doc.text(latin1(lesson.title), 15, 20);
  doc.setFontSize(10);
  doc.text(lesson.created, 15, 27);
  doc.setFontSize(12);
  writeText(doc, lesson.notes, 38);

  if (lesson.summary) {
    doc.addPage();
    doc.setFontSize(16);
    doc.text('Resumo', 15, 20);
    doc.setFontSize(12);
    writeText(doc, lesson.summary, 30);
  }
  for (const image of lesson.images ?? []) {
    const src = imageSrc(image.id);
    if (!src) continue;
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Foto do quadro - ' + image.time, 15, 15);
    const h = addFitted(doc, src, 15, 22, 180, 150);
    doc.setFontSize(11);
    writeText(doc, image.sum, 30 + h);
  }
  if (lesson.board) {
    doc.addPage();
    doc.text('Quadro branco', 15, 15);
    addFitted(doc, lesson.board, 15, 22, 180, 250);
  }
  return doc;
}

export function slidesPdf(slides) {
  const doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
  slides.forEach((slide, i) => {
    if (i) doc.addPage();
    doc.setFillColor(91, 76, 240);
    doc.rect(0, 0, 297, 210, 'F');
    doc.setTextColor(255);
    doc.setFontSize(28);
    doc.text(doc.splitTextToSize(latin1(slide.title), 260), 20, 40);
    doc.setFontSize(16);
    let x = 22, width = 255;
    const src = slide.imgId && imageSrc(slide.imgId);
    if (src) {
      addFitted(doc, src, 20, 55, 150, 120);
      x = 180;
      width = 100;
    }
    let y = 70;
    for (const item of slide.items) {
      for (const line of doc.splitTextToSize('• ' + latin1(item), width)) {
        doc.text(line, x, y);
        y += 9;
      }
    }
  });
  return doc;
}

export function exportLessonPdf() {
  const lesson = currentLesson();
  saveFile(lesson.title + '.pdf', lessonPdf(lesson).output('blob'));
}

function exportSlidesPdf() {
  const slides = currentSlides();
  if (!slides.length) return toast('Gere os slides antes');
  saveFile(currentLesson().title + ' - slides.pdf', slidesPdf(slides).output('blob'));
}

register({
  'pdf.lesson': exportLessonPdf,
  'pdf.slides': exportSlidesPdf,
});
