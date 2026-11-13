import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { scrubPlaintext, segregateSecrets } from "./sanitize.js";

export const COLLECTION_KINDS = new Set([
  "intake",
  "listing_materials",
  "deal_story",
  "bio",
  "topics",
  "calendar",
  "production_plan",
  "film_review"
]);

export function ensureDirs(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(secretsDir(dataDir), { recursive: true });
}

export function secretsDir(dataDir) {
  return path.join(dataDir, "secrets");
}

export function isCollectionId(id) {
  return typeof id === "string" && /^col_[A-Za-z0-9-]+$/.test(id);
}

export function recordPath(dataDir, id) {
  if (!isCollectionId(id)) return null;
  return path.join(dataDir, id + ".json");
}

export function secretPath(dataDir, id) {
  if (!isCollectionId(id)) return null;
  return path.join(secretsDir(dataDir), id + ".json");
}

function publicShape(raw, publicRecord, plaintext, passwordStored) {
  const saved = {
    id: raw.id,
    kind: raw.kind,
    collectedAt: raw.collectedAt || null,
    savedAt: raw.savedAt || null,
    record: publicRecord,
    plaintext: plaintext || ""
  };
  if (passwordStored) saved.passwordStored = true;
  return saved;
}

/** If a legacy public file still holds a secret, move it into data/secrets and rewrite the public file. */
export function sanitizeExisting(dataDir, raw, { rewrite = true } = {}) {
  const { publicRecord, secrets, passwordStored } = segregateSecrets(raw.record || {});
  const plaintext = scrubPlaintext(raw.plaintext || "");
  const stored = passwordStored || raw.passwordStored === true;
  if (passwordStored && raw.id && rewrite) {
    writeSecretFile(dataDir, raw.id, secrets);
    const cleaned = publicShape(raw, publicRecord, plaintext, true);
    const file = recordPath(dataDir, raw.id);
    if (file) fs.writeFileSync(file, JSON.stringify(cleaned, null, 2));
    return cleaned;
  }
  return publicShape(raw, publicRecord, plaintext, stored);
}

export function writeSecretFile(dataDir, id, secrets) {
  ensureDirs(dataDir);
  const file = secretPath(dataDir, id);
  if (!file) throw new Error("无效的收集记录编号");
  const payload = { id, ...secrets };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

export function saveCollection(dataDir, body) {
  if (!COLLECTION_KINDS.has(body.kind) || !body.record || typeof body.record !== "object") {
    const kinds = [...COLLECTION_KINDS].join(" | ");
    const error = new Error("需要 kind（" + kinds + "）和 record 对象");
    error.status = 400;
    throw error;
  }
  ensureDirs(dataDir);
  const { publicRecord, secrets, passwordStored } = segregateSecrets(body.record);
  const plaintext = scrubPlaintext(body.plaintext || "");
  const saved = publicShape({
    id: "col_" + randomUUID(),
    kind: body.kind,
    collectedAt: body.collectedAt || new Date().toISOString(),
    savedAt: new Date().toISOString()
  }, publicRecord, plaintext, passwordStored);
  fs.writeFileSync(path.join(dataDir, saved.id + ".json"), JSON.stringify(saved, null, 2));
  if (passwordStored) writeSecretFile(dataDir, saved.id, secrets);
  return saved;
}

export function listRecords(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const raw = JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
      return sanitizeExisting(dataDir, raw);
    })
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
}

export function readRecord(dataDir, id) {
  const file = recordPath(dataDir, id);
  if (!file || !fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return sanitizeExisting(dataDir, raw);
}

export function readSecret(dataDir, id) {
  const file = secretPath(dataDir, id);
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
