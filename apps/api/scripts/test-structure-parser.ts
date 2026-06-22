/** Smoke test manual: npx ts-node --transpile-only scripts/test-structure-parser.ts */
import { parseStructure, preprocessLegalText } from '../src/import/structure.parser';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const text1 = `EMENTA: Lei de teste.

Art. 1º Este é o artigo primeiro.
Art. 2º Este é o artigo segundo.
§ 1º Parágrafo do artigo 2.
§ 2º Outro parágrafo.
Art. 3º Com incisos:
I - primeiro inciso;
II - segundo inciso;
a) alínea a;
b) alínea b.`;

const r1 = parseStructure(text1);
assert(r1.blocos.some((b) => b.tipo === 'ementa'), 'ementa');
assert(
  r1.blocos.filter((b) => b.tipo === 'artigo').map((b) => b.tag).join() === 'Art. 1º,Art. 2º,Art. 3º',
  'artigos',
);
assert(!r1.blocos.some((b) => b.tag.startsWith('Bloco')), 'sem bloco genérico');

const text2 =
  'Art. 1º Primeiro dispositivo da lei. Art. 2º Segundo dispositivo. Art. 3º Terceiro dispositivo.';
const r2 = parseStructure(text2);
assert(r2.blocos.length === 3, '3 artigos inline');
assert(r2.blocos.every((b) => b.tipo === 'artigo'), 'todos artigos');

const processed = preprocessLegalText(text2);
assert(processed.includes('\nArt. 2º'), 'preprocess quebra artigos');

console.log('structure.parser OK', {
  sample: r1.blocos.map((b) => `${b.tipo}:${b.tag}`),
});
