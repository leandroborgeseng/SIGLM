-- Novo tipo de unidade: texto simples
DO $$ BEGIN
  ALTER TYPE "UnitType" ADD VALUE 'texto_simples';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "normative_units"
  ADD COLUMN IF NOT EXISTS "formatacao" JSONB;
