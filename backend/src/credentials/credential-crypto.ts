import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Encryption for the values in the Credential table: AES-256-GCM, a fresh random IV for every value, and the credential's own name bound in as
 * additional authenticated data, so a ciphertext copied from one row to another (a page-token into the X secret, say) is refused rather than
 * accepted. Stored as `enc:v1:<iv>:<tag>:<ciphertext>`, all base64url.
 *
 * The key is CREDENTIALS_ENCRYPTION_KEY, in the server's environment and nowhere in the database: the key that opens the database cannot live in it.
 */

const PREFIX = 'enc:v1:';

/** The master key from its text form: 32 bytes as base64 or as 64 hex characters. Anything else is not a usable key. */
export function parseMasterKey(raw: string | undefined | null): Buffer | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, 'hex');
  const decoded = Buffer.from(text, 'base64');
  return decoded.length === 32 ? decoded : null;
}

export const isEncrypted = (stored: string) => stored.startsWith(PREFIX);

export function encryptValue(plain: string, name: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(name));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${body.toString('base64url')}`;
}

/** Throws when the key is wrong, the value was changed, or it belongs to another name. */
export function decryptValue(stored: string, name: string, key: Buffer): string {
  if (!isEncrypted(stored)) throw new Error('The stored value is not encrypted');
  const [iv, tag, body] = stored.slice(PREFIX.length).split(':');
  if (!iv || !tag || body === undefined) throw new Error('The stored value is malformed');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(name));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}
