-- CreateEnum
CREATE TYPE "EditorialStage" AS ENUM (
  'somente_arquivo_original',
  'em_estruturacao',
  'aguardando_revisao',
  'estruturado'
);

-- CreateEnum
CREATE TYPE "ArchiveImportBatchStatus" AS ENUM (
  'processando',
  'conferencia',
  'concluido',
  'erro_parcial'
);

-- CreateEnum
CREATE TYPE "ArchiveImportItemStatus" AS ENUM (
  'processando',
  'pronto',
  'baixa_confianca',
  'duplicata',
  'erro',
  'confirmado',
  'ignorado',
  'vinculado'
);

-- AlterTable
ALTER TABLE "normative_acts"
  ADD COLUMN "etapa_editorial" "EditorialStage" NOT NULL DEFAULT 'em_estruturacao';

-- Atos já publicados com unidades → estruturado; publicados sem unidades → somente arquivo
UPDATE "normative_acts" na
SET "etapa_editorial" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "normative_units" nu WHERE nu."act_id" = na.id
  ) THEN 'estruturado'::"EditorialStage"
  WHEN na."status_publicacao" = 'publicado' THEN 'somente_arquivo_original'::"EditorialStage"
  ELSE 'em_estruturacao'::"EditorialStage"
END;

CREATE INDEX "normative_acts_etapa_editorial_idx" ON "normative_acts"("etapa_editorial");

-- CreateTable
CREATE TABLE "archive_import_batches" (
  "id" TEXT NOT NULL,
  "status" "ArchiveImportBatchStatus" NOT NULL DEFAULT 'processando',
  "criado_por" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluido_em" TIMESTAMP(3),
  CONSTRAINT "archive_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archive_import_items" (
  "id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "arquivo" TEXT NOT NULL,
  "nome_arquivo" TEXT NOT NULL,
  "formato" "ImportFormat" NOT NULL,
  "status" "ArchiveImportItemStatus" NOT NULL DEFAULT 'processando',
  "tipo" "ActType",
  "numero" INTEGER,
  "ano" INTEGER,
  "data_ato" DATE,
  "ementa" TEXT,
  "confianca" INTEGER NOT NULL DEFAULT 0,
  "erro_mensagem" TEXT,
  "existing_act_id" TEXT,
  "act_id" TEXT,
  "resolucao" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "archive_import_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "archive_import_batches_criado_por_criado_em_idx"
  ON "archive_import_batches"("criado_por", "criado_em");

CREATE INDEX "archive_import_items_batch_id_status_idx"
  ON "archive_import_items"("batch_id", "status");

ALTER TABLE "archive_import_batches"
  ADD CONSTRAINT "archive_import_batches_criado_por_fkey"
  FOREIGN KEY ("criado_por") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archive_import_items"
  ADD CONSTRAINT "archive_import_items_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "archive_import_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "archive_import_items"
  ADD CONSTRAINT "archive_import_items_existing_act_id_fkey"
  FOREIGN KEY ("existing_act_id") REFERENCES "normative_acts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archive_import_items"
  ADD CONSTRAINT "archive_import_items_act_id_fkey"
  FOREIGN KEY ("act_id") REFERENCES "normative_acts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
