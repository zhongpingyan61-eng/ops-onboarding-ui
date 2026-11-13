import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { containsPasswordLeak, scrubPlaintext, segregateSecrets } from "../lib/sanitize.js";
import { listRecords, readRecord, readSecret, saveCollection } from "../lib/store.js";
import { parseCollection } from "../lib/parse.js";
import { parseAccountField, toSubmitAccount } from "../lib/mcp-payloads.js";
import { createServer } from "../server.js";

const PASSWORD = "s3cret-demo-pass";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ops-col-"));
}

test("segregateSecrets strips password from the public record and plaintext", () => {
  const { publicRecord, secrets, passwordStored } = segregateSecrets({
    account: "Instagram · demo_realtor",
    password: PASSWORD,
    note: "多讲本地生活"
  });
  assert.equal(passwordStored, true);
  assert.equal(publicRecord.passwordStored, true);
  assert.equal(publicRecord.password, undefined);
  assert.equal(secrets.password, PASSWORD);
  assert.equal(scrubPlaintext("运营账号：demo_realtor\n密码：" + PASSWORD + "\n身份：房产经纪人"), "运营账号：demo_realtor\n身份：房产经纪人");
  assert.equal(containsPasswordLeak({ record: { password: PASSWORD } }), true);
  assert.equal(containsPasswordLeak({ record: { passwordStored: true, account: "demo" } }), false);
});

test("saved public JSON and collections API never include the raw password", async () => {
  const dataDir = tmpDir();
  const saved = saveCollection(dataDir, {
    kind: "intake",
    record: {
      platform: "Instagram",
      account: "Instagram · demo_realtor",
      password: PASSWORD,
      goals: "帮我推荐"
    },
    plaintext: "【开号收集结果】\n运营账号：Instagram · demo_realtor\n密码：" + PASSWORD + "\n当前目标：帮我推荐"
  });
  assert.equal(saved.passwordStored, true);
  assert.equal(saved.record.password, undefined);
  assert.equal(saved.record.passwordStored, true);
  assert.doesNotMatch(saved.plaintext, /s3cret-demo-pass/);
  assert.equal(saved.plaintext.includes("密码："), false);

  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, saved.id + ".json"), "utf8"));
  assert.equal(JSON.stringify(onDisk).includes(PASSWORD), false);
  const secretFile = path.join(dataDir, "secrets", saved.id + ".json");
  assert.equal(fs.existsSync(secretFile), true);
  const mode = fs.statSync(secretFile).mode & 0o777;
  assert.equal(mode, 0o600);
  assert.equal(readSecret(dataDir, saved.id).password, PASSWORD);

  const listed = listRecords(dataDir);
  assert.equal(listed.length, 1);
  assert.equal(JSON.stringify(listed).includes(PASSWORD), false);
  assert.equal(readRecord(dataDir, saved.id).record.password, undefined);

  const server = createServer({ dataDir });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const listRes = await fetch("http://127.0.0.1:" + port + "/api/collections");
    const listBody = await listRes.json();
    assert.equal(JSON.stringify(listBody).includes(PASSWORD), false);
    assert.equal(listBody.collections[0].passwordStored, true);
    const detail = await (await fetch("http://127.0.0.1:" + port + "/api/collections/" + saved.id)).json();
    assert.equal(JSON.stringify(detail).includes(PASSWORD), false);
    const secret = await (await fetch("http://127.0.0.1:" + port + "/api/secrets/" + saved.id)).json();
    assert.equal(secret.password, PASSWORD);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("legacy public files with a password are scrubbed on read", () => {
  const dataDir = tmpDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const id = "col_legacy-test-id";
  fs.writeFileSync(path.join(dataDir, id + ".json"), JSON.stringify({
    id,
    kind: "intake",
    savedAt: "2026-11-12T00:00:00.000Z",
    record: { account: "Instagram · demo_realtor", password: PASSWORD },
    plaintext: "密码：" + PASSWORD
  }));
  const read = readRecord(dataDir, id);
  assert.equal(read.record.password, undefined);
  assert.equal(read.passwordStored, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, id + ".json"), "utf8")).record.password, undefined);
  assert.equal(readSecret(dataDir, id).password, PASSWORD);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("parseCollection drops password fields from structured JSON", () => {
  const parsed = parseCollection({
    kind: "intake",
    record: { account: "Instagram · demo_realtor", password: PASSWORD, platform: "Instagram" },
    plaintext: "密码：" + PASSWORD
  });
  assert.equal(parsed.record.password, undefined);
  assert.equal(parsed.record.platform, "Instagram");
});

test("submit_account and other MCP payloads never include a password", () => {
  const args = toSubmitAccount({
    kind: "intake",
    record: {
      platform: "Instagram",
      account: "Instagram · demo_realtor",
      password: PASSWORD,
      language: "英语",
      goals: "帮我推荐"
    }
  });
  assert.equal(args.platform, "Instagram");
  assert.equal(args.name, "demo_realtor");
  assert.equal(JSON.stringify(args).includes(PASSWORD), false);
  assert.equal(args.password, undefined);
  assert.equal(args.intake && args.intake.password, undefined);
});

test("custom and unrestricted platforms are preserved", () => {
  const xiaohongshu = parseAccountField("小红书 · shop_home", "小红书");
  assert.equal(xiaohongshu.platform, "小红书");
  assert.equal(xiaohongshu.handle, "shop_home");
  const youtube = parseAccountField("YouTube · riverside_homes · https://www.youtube.com/@riverside_homes");
  assert.equal(youtube.platform, "YouTube");
  assert.equal(youtube.handle, "riverside_homes");
  assert.equal(youtube.profile_url, "https://www.youtube.com/@riverside_homes");
  const linked = toSubmitAccount({
    record: { platform: "LinkedIn", account: "LinkedIn · sarah-chen-demo", language: "英语" }
  });
  assert.equal(linked.platform, "LinkedIn");
  assert.equal(linked.name, "sarah-chen-demo");
});
