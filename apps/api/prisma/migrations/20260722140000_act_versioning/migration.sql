-- Permissões de versionamento e histórico interno
INSERT INTO "permissions" ("id", "chave")
SELECT gen_random_uuid()::text, v.chave
FROM (VALUES ('acts:version'), ('acts:history')) AS v(chave)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.chave = v.chave);

-- Concede ao admin_geral
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.nome = 'admin_geral'
  AND p.chave IN ('acts:version', 'acts:history')
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

ALTER TABLE "normative_acts"
  ADD COLUMN IF NOT EXISTS "edition_open" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "act_public_revisions" (
  "id" TEXT NOT NULL,
  "act_id" TEXT NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "is_current" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_by_id" TEXT,
  CONSTRAINT "act_public_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "act_public_revisions_act_id_revision_number_key"
  ON "act_public_revisions"("act_id", "revision_number");
CREATE INDEX IF NOT EXISTS "act_public_revisions_act_id_is_current_idx"
  ON "act_public_revisions"("act_id", "is_current");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'act_public_revisions_act_id_fkey'
  ) THEN
    ALTER TABLE "act_public_revisions"
      ADD CONSTRAINT "act_public_revisions_act_id_fkey"
      FOREIGN KEY ("act_id") REFERENCES "normative_acts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "act_internal_history" (
  "id" TEXT NOT NULL,
  "act_id" TEXT NOT NULL,
  "user_id" TEXT,
  "acao" TEXT NOT NULL,
  "resumo" TEXT,
  "snapshot" JSONB,
  "revision_number" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "act_internal_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "act_internal_history_act_id_created_at_idx"
  ON "act_internal_history"("act_id", "created_at");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'act_internal_history_act_id_fkey'
  ) THEN
    ALTER TABLE "act_internal_history"
      ADD CONSTRAINT "act_internal_history_act_id_fkey"
      FOREIGN KEY ("act_id") REFERENCES "normative_acts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'act_internal_history_user_id_fkey'
  ) THEN
    ALTER TABLE "act_internal_history"
      ADD CONSTRAINT "act_internal_history_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
