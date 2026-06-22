#!/usr/bin/env node
/**
 * Gera um PDF "escaneado" (só imagem, sem texto pesquisável) para testar o fluxo OCR.
 * Uso: node scripts/generate-ocr-test-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { pdf } from 'pdf-to-img';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');
const tempPdf = path.join(fixturesDir, '_temp-text.pdf');
const outPdf = path.join(fixturesDir, 'lei-escaneada-teste.pdf');

fs.mkdirSync(fixturesDir, { recursive: true });

function createTextPdf() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(tempPdf);
    doc.pipe(stream);
    doc.fontSize(16).text('EMENTA', { underline: true });
    doc.fontSize(12).text('Dispõe sobre o uso de bicicletas no município de Franca/SP.');
    doc.moveDown();
    doc.text('O PREFEITO MUNICIPAL DE FRANCA, no uso de suas atribuições legais,');
    doc.text('FAÇO SABER que a Câmara Municipal aprovou e eu sanciono a seguinte Lei:');
    doc.moveDown();
    doc.text('Art. 1º Fica instituído o programa municipal de mobilidade cicloviária.');
    doc.text('Art. 2º O Poder Executivo regulamentará esta lei no prazo de 90 dias.');
    doc.text('Art. 3º Esta lei entra em vigor na data de sua publicação.');
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function rasterizeToScannedPdf() {
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
  const stream = fs.createWriteStream(outPdf);
  doc.pipe(stream);

  const document = await pdf(tempPdf, { scale: 2 });
  for await (const image of document) {
    doc.addPage({ size: 'A4', margin: 0 });
    doc.image(image, 0, 0, { width: 595.28, height: 841.89 });
  }
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

await createTextPdf();
await rasterizeToScannedPdf();
fs.unlinkSync(tempPdf);
console.log(`PDF de teste OCR gerado: ${outPdf}`);
