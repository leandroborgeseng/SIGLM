import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function encryptionKey(): Buffer {
  const material =
    process.env.S3_BACKUP_CRYPTO_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'siglm-dev-only-change-me';
  return createHash('sha256').update(material).digest();
}

/** AES-256-GCM → base64(iv || tag || ciphertext) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 28) {
    throw new Error('Segredo criptografado inválido');
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
