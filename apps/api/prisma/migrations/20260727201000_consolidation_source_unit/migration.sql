-- CreateEnum
CREATE TYPE "ChangeOrigin" AS ENUM ('interna', 'externa');

-- CreateTable
CREATE TABLE "external_legislative_sources" (
    "id" TEXT NOT NULL,
    "tipo" "ActType",
    "numero" TEXT,
    "ano" INTEGER,
    "emissor" TEXT NOT NULL,
    "data" DATE,
    "descricao" TEXT NOT NULL,
    "url" TEXT,
    "arquivo_url" TEXT,
    "processo" TEXT,
    "tribunal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_legislative_sources_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "normative_changes" ADD COLUMN "source_unit_id" TEXT;
ALTER TABLE "normative_changes" ADD COLUMN "origem" "ChangeOrigin" NOT NULL DEFAULT 'interna';
ALTER TABLE "normative_changes" ADD COLUMN "external_source_id" TEXT;
ALTER TABLE "normative_changes" ADD COLUMN "incomplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "normative_changes" ALTER COLUMN "norma_alteradora_act_id" DROP NOT NULL;

-- Mark legacy internal links without source element as incomplete
UPDATE "normative_changes"
SET "incomplete" = true
WHERE "source_unit_id" IS NULL AND "origem" = 'interna';

-- AddForeignKey
ALTER TABLE "normative_changes" ADD CONSTRAINT "normative_changes_source_unit_id_fkey"
    FOREIGN KEY ("source_unit_id") REFERENCES "normative_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "normative_changes" ADD CONSTRAINT "normative_changes_external_source_id_fkey"
    FOREIGN KEY ("external_source_id") REFERENCES "external_legislative_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "normative_changes_source_unit_id_idx" ON "normative_changes"("source_unit_id");
CREATE INDEX "normative_changes_origem_idx" ON "normative_changes"("origem");
CREATE INDEX "normative_changes_incomplete_idx" ON "normative_changes"("incomplete");
