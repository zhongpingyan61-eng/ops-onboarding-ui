import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const PORT = Number(process.env.PORT || 8787);
const KINDS = new Set(["intake", "listing_materials", "deal_story", "bio"]);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data, null, 2), {
    "Content-Type": "application/json; charset=utf-8"
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function listRecords() {
  return fs.readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const raw = fs.readFileSync(path.join(DATA_DIR, name), "utf8");
      return JSON.parse(raw);
    })
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
}

function recordPath(id) {
  if (!/^col_[A-Za-z0-9-]+$/.test(id)) return null;
  return path.join(DATA_DIR, id + ".json");
}

function homePage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>运营开号与素材收集</title>
  <style>
    :root{--bg:#fafafa;--text:#18181b;--muted:#71717a;--subtle:#a1a1aa;--primary:#3072f6;--card:#fff;--line:#ececee}
    body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .wrap{max-width:600px;margin:auto;padding:30px 20px 56px}
    .brand{text-align:center;font-size:18px;font-weight:650;margin-bottom:5px}
    .lead{text-align:center;font-size:13px;color:var(--muted);margin:0 0 20px}
    .card{background:var(--card);border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:18px 18px 8px;margin:0 0 12px}
    a.item{display:block;padding:12px 0;border-top:1px solid var(--line);color:var(--text);text-decoration:none}
    a.item:first-child{border-top:0}
    a.item strong{display:block;font-size:15px}
    a.item span{display:block;font-size:13px;color:var(--muted);margin-top:2px}
    .note{font-size:13px;color:var(--muted);margin:16px 2px 0}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="brand">运营开号与素材收集</div>
    <p class="lead">本地收集服务已启动。完成收集后，结果会写入 data/ 并自动复制，把文本粘贴回对话即可。</p>
    <section class="card">
      <a class="item" href="/ops-intake.html"><strong>开号收集</strong><span>基础信息、想做什么，以及对外展示信息</span></a>
      <a class="item" href="/ops-materials.html"><strong>房源展示</strong><span>以房源链接为主的制作材料</span></a>
      <a class="item" href="/ops-story.html"><strong>成交故事</strong><span>案例、链接和不限形式的文件</span></a>
      <a class="item" href="/ops-bio.html"><strong>个人或团队介绍</strong><span>介绍对象、链接、文件和介绍文字</span></a>
    </section>
    <p class="note">本页只收集，不生成运营方案或成片。浏览器不能直接调用运营 MCP；保存后的 JSON 由运营 Agent 在服务端映射为工具参数。查看已保存记录：<a href="/api/collections">/api/collections</a>。</p>
  </main>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/collections") {
      return sendJson(res, 200, { collections: listRecords() });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/collections/")) {
      const id = url.pathname.slice("/api/collections/".length);
      const file = recordPath(id);
      if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: "找不到这条收集记录" });
      return sendJson(res, 200, JSON.parse(fs.readFileSync(file, "utf8")));
    }
    if (req.method === "POST" && url.pathname === "/api/collections") {
      let body;
      try {
        body = JSON.parse(await readBody(req) || "{}");
      } catch (err) {
        return sendJson(res, 400, { error: "请求体需要是 JSON" });
      }
      if (!KINDS.has(body.kind) || !body.record || typeof body.record !== "object") {
        return sendJson(res, 400, { error: "需要 kind（intake | listing_materials | deal_story | bio）和 record 对象" });
      }
      const saved = {
        id: "col_" + randomUUID(),
        kind: body.kind,
        collectedAt: body.collectedAt || new Date().toISOString(),
        savedAt: new Date().toISOString(),
        record: body.record,
        plaintext: body.plaintext || ""
      };
      fs.writeFileSync(path.join(DATA_DIR, saved.id + ".json"), JSON.stringify(saved, null, 2));
      return sendJson(res, 201, saved);
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { error: "方法不被支持" });
    }
    if (url.pathname === "/") {
      return send(res, 200, homePage(), { "Content-Type": "text/html; charset=utf-8" });
    }
    const relative = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(ROOT, relative);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return sendJson(res, 404, { error: "找不到文件" });
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, fs.readFileSync(filePath), { "Content-Type": MIME[ext] || "application/octet-stream" });
  } catch (err) {
    sendJson(res, 500, { error: "服务出错了" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Ops collection service http://127.0.0.1:" + PORT);
});
