export type IdentifiedTextOrigin = 'pdf_text' | 'docx' | 'ocr';

export function identifiedTextOriginLabel(origem: IdentifiedTextOrigin | string | null | undefined): string {
  switch (origem) {
    case 'pdf_text':
      return 'Extração direta do PDF';
    case 'docx':
      return 'Extração do Word (DOCX)';
    case 'ocr':
      return 'Reconhecimento óptico (OCR)';
    default:
      return 'Origem desconhecida';
  }
}
