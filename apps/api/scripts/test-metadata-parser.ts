/** Smoke test: ../../node_modules/.bin/ts-node --transpile-only scripts/test-metadata-parser.ts */
import { extractActMetadata } from '../src/import/metadata.parser';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const text1 = `LEI Nº 4.987, DE 15 DE MARÇO DE 2026

EMENTA: Dispõe sobre o ISS municipal e dá outras providências.

Art. 1º Fica instituído...`;

const m1 = extractActMetadata(text1, 'lei-4987-2026.docx');
assert(m1.tipo === 'lei', 'tipo lei');
assert(m1.numero === 4987, 'numero 4987');
assert(m1.ano === 2026, 'ano 2026');
assert(m1.ementa?.includes('ISS'), 'ementa');

const text2 = `LEI COMPLEMENTAR Nº 312, DE 15 DE MARÇO DE 2024
EMENTA: Institui o Código Tributário.`;

const m2 = extractActMetadata(text2);
assert(m2.tipo === 'lei_complementar', 'lc');
assert(m2.numero === 312, 'lc numero');

const m3 = extractActMetadata('', 'decreto-12450-2026.pdf');
assert(m3.tipo === 'decreto', 'decreto filename');
assert(m3.numero === 12450, 'decreto numero');
assert(m3.ano === 2026, 'decreto ano');
assert(m3.requerConferencia === true, 'filename-only requer conferencia');

const text3 = `DECRETO Nº 10.208, DE 29 DE AGOSTO DE 2014

EMENTA: Altera o Decreto nº 5.000 e a Lei Nº 3.000, DE 1 DE JANEIRO DE 2010.

Art. 1º Fica alterado...`;

const m4 = extractActMetadata(text3, 'decreto-10208-2014.pdf');
assert(m4.tipo === 'decreto', 'decreto header tipo');
assert(m4.numero === 10208, 'decreto header numero');
assert(m4.ano === 2014, 'decreto header ano');
assert(m4.titleFromHeader === true, 'title from header not ementa cite');

console.log('metadata.parser OK', { m1, m3, m4 });
