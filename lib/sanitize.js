/** Password / secret segregation helpers. Never map secrets into MCP payloads or public archives. */

export const SECRET_FIELD_KEYS = new Set([
  "password",
  "accountPassword",
  "account_password",
  "passwd",
  "secret",
  "credentials",
  "loginPassword"
]);

const SECRET_LABEL_RE = /^(密码|账号密码|登录密码|password|passwd)\s*[：:]/im;

/**
 * Deep-clone and strip known secret fields from a record.
 * Returns { publicRecord, secrets, passwordStored }.
 */
export function segregateSecrets(record) {
  const secrets = {};
  const publicRecord = scrubValue(record, secrets);
  const passwordStored = Object.keys(secrets).length > 0;
  if (passwordStored && publicRecord && typeof publicRecord === "object" && !Array.isArray(publicRecord)) {
    publicRecord.passwordStored = true;
  }
  return { publicRecord, secrets, passwordStored };
}

function scrubValue(value, secrets, path = "") {
  if (Array.isArray(value)) {
    return value.map((item, index) => scrubValue(item, secrets, path ? `${path}.${index}` : String(index)));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_FIELD_KEYS.has(key)) {
        if (child != null && String(child).trim() !== "") {
          secrets[key] = child;
        }
        continue;
      }
      out[key] = scrubValue(child, secrets, path ? `${path}.${key}` : key);
    }
    return out;
  }
  return value;
}

/** Remove password lines from Chinese plaintext export. */
export function scrubPlaintext(text) {
  if (!text) return "";
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !SECRET_LABEL_RE.test(line.trim()))
    .join("\n");
}

/** True if a string/object still contains an obvious password. */
export function containsPasswordLeak(value) {
  if (value == null) return false;
  if (typeof value === "string") {
    if (SECRET_LABEL_RE.test(value)) return true;
    try {
      const parsed = JSON.parse(value);
      return containsPasswordLeak(parsed);
    } catch {
      return false;
    }
  }
  if (Array.isArray(value)) return value.some(containsPasswordLeak);
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_FIELD_KEYS.has(key) && child != null && String(child).trim() !== "") return true;
      if (containsPasswordLeak(child)) return true;
    }
  }
  return false;
}
