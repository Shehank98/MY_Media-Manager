import crypto from "crypto";

// Encrypts Facebook access tokens before storing them in the database,
// so a database dump alone never exposes usable tokens.
// Set APP_SECRET in your environment (any long random string).

const RAW_SECRET =
  process.env.APP_SECRET || "change-me-in-production-please-set-APP_SECRET";

// Derive a stable 32-byte key from whatever secret is provided.
const KEY = crypto.createHash("sha256").update(RAW_SECRET).digest();
const ALGO = "aes-256-gcm";

export function encrypt(plainText) {
  if (plainText == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Store as iv:tag:ciphertext, all base64
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decrypt(payload) {
  if (payload == null) return null;
  try {
    const [ivB64, tagB64, dataB64] = String(payload).split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    // If the value isn't in our encrypted format (e.g. legacy plaintext),
    // return it unchanged so nothing breaks.
    return payload;
  }
}

if (
  !process.env.APP_SECRET &&
  process.env.NODE_ENV === "production"
) {
  console.warn(
    "⚠️  APP_SECRET is not set. Set a long random APP_SECRET on Railway to protect stored tokens."
  );
}
