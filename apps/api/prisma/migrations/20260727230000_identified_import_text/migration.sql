-- CreateEnum
CREATE TYPE "IdentifiedTextOrigin" AS ENUM ('pdf_text', 'docx', 'ocr');

-- AlterTable
ALTER TABLE "normative_acts"
ADD COLUMN "texto_identificado_importacao" TEXT,
ADD COLUMN "texto_identificado_origem" "IdentifiedTextOrigin";

-- AlterTable
ALTER TABLE "archive_import_items"
ADD COLUMN "texto_identificado_importacao" TEXT,
ADD COLUMN "texto_identificado_origem" "IdentifiedTextOrigin",
ADD COLUMN "texto_identificado_ausente" BOOLEAN NOT NULL DEFAULT false;

-- Refresh search vectors to include import text where applicable
UPDATE normative_acts na
SET search_vector = (
  setweight(to_tsvector('portuguese', coalesce(na.ementa, '')), 'A') ||
  setweight(to_tsvector('portuguese', coalesce(na.assunto, '')), 'B') ||
  setweight(to_tsvector('portuguese', coalesce(array_to_string(na.palavras_chave, ' '), '')), 'C') ||
  setweight(to_tsvector('portuguese', coalesce((
    SELECT string_agg(nu.texto, ' ')
    FROM normative_units nu
    WHERE nu.act_id = na.id
  ), '')), 'D') ||
  setweight(
    to_tsvector('portuguese', coalesce(na.texto_identificado_importacao, '')),
    CASE
      WHEN EXISTS (
        SELECT 1 FROM normative_units nu
        WHERE nu.act_id = na.id AND length(trim(nu.texto)) > 0
      ) THEN 'C'
      ELSE 'D'
    END
  )
);
