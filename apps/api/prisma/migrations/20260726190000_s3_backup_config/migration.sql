-- Configuração de backup S3 editável pela interface admin
CREATE TABLE "s3_backup_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "bucket" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "access_key_id" TEXT NOT NULL DEFAULT '',
    "secret_access_key_enc" TEXT,
    "endpoint" TEXT,
    "force_path_style" BOOLEAN NOT NULL DEFAULT true,
    "prefix" TEXT NOT NULL DEFAULT 'siglm/backups',
    "hour" INTEGER NOT NULL DEFAULT 3,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "keep_daily" INTEGER NOT NULL DEFAULT 7,
    "keep_weekly" INTEGER NOT NULL DEFAULT 5,
    "keep_monthly" INTEGER NOT NULL DEFAULT 12,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "s3_backup_config_pkey" PRIMARY KEY ("id")
);
