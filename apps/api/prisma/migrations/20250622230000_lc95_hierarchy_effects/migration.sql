-- LC 95/98: novos tipos de unidade e efeitos legislativos integrados

ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'parte';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'subtitulo';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'subcapitulo';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'paragrafo_unico';

ALTER TYPE "UnitStatus" ADD VALUE IF NOT EXISTS 'revogada_parcialmente';

ALTER TYPE "ChangeType" ADD VALUE IF NOT EXISTS 'renumeracao';

CREATE TYPE "EffectType" AS ENUM (
  'alteracao_redacao',
  'inclusao',
  'revogacao_total',
  'revogacao_parcial',
  'renumeracao'
);

CREATE TYPE "InclusaoPosicionamento" AS ENUM ('antes_de', 'apos', 'dentro_de');

CREATE TABLE "legislative_effects" (
  "id" TEXT NOT NULL,
  "source_unit_id" TEXT NOT NULL,
  "norma_alterada_act_id" TEXT NOT NULL,
  "target_unit_id" TEXT,
  "tipo_efeito" "EffectType" NOT NULL,
  "data_vigencia" DATE NOT NULL,
  "observacoes" TEXT,
  "tipo_dispositivo_incluido" "UnitType",
  "posicionamento" "InclusaoPosicionamento",
  "referencia_unit_id" TEXT,
  "texto_novo" TEXT,
  "redacao_unit_id" TEXT,
  "nova_identificacao" TEXT,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "legislative_effects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legislative_effects_source_unit_id_idx" ON "legislative_effects"("source_unit_id");
CREATE INDEX "legislative_effects_norma_alterada_act_id_idx" ON "legislative_effects"("norma_alterada_act_id");

ALTER TABLE "legislative_effects"
  ADD CONSTRAINT "legislative_effects_source_unit_id_fkey"
  FOREIGN KEY ("source_unit_id") REFERENCES "normative_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legislative_effects"
  ADD CONSTRAINT "legislative_effects_norma_alterada_act_id_fkey"
  FOREIGN KEY ("norma_alterada_act_id") REFERENCES "normative_acts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legislative_effects"
  ADD CONSTRAINT "legislative_effects_target_unit_id_fkey"
  FOREIGN KEY ("target_unit_id") REFERENCES "normative_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "legislative_effects"
  ADD CONSTRAINT "legislative_effects_referencia_unit_id_fkey"
  FOREIGN KEY ("referencia_unit_id") REFERENCES "normative_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "legislative_effects"
  ADD CONSTRAINT "legislative_effects_redacao_unit_id_fkey"
  FOREIGN KEY ("redacao_unit_id") REFERENCES "normative_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
