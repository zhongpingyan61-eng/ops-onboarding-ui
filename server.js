import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTION_KINDS, listRecords, readRecord, readSecret, saveCollection } from "./lib/store.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const PORT = Number(process.env.PORT || 8787);
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

function isLocalRequest(req) {
  const addr = req.socket && req.socket.remoteAddress;
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function homePage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>运营开号与流程界面</title>
  <style>
    :root{--bg:#fafafa;--text:#18181b;--muted:#71717a;--subtle:#a1a1aa;--primary:#3072f6;--card:#fff;--line:#ececee}
    body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .wrap{max-width:600px;margin:auto;padding:30px 20px 56px}
    .brand{text-align:center;font-size:18px;font-weight:650;margin-bottom:5px}
    .lead{text-align:center;font-size:13px;color:var(--muted);margin:0 0 20px}
    .card{background:var(--card);border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:18px 18px 8px;margin:0 0 12px}
    .card-label{font-size:12px;font-weight:650;color:var(--muted);padding:0 0 8px}
    a.item{display:block;padding:12px 0;border-top:1px solid var(--line);color:var(--text);text-decoration:none}
    a.item:first-of-type{border-top:0}
    a.item strong{display:block;font-size:15px}
    a.item span{display:block;font-size:13px;color:var(--muted);margin-top:2px}
    .note{font-size:13px;color:var(--muted);margin:16px 2px 0}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="brand">运营开号与流程界面</div>
    <p class="lead">Personal Agent 是主要入口。界面只在集中填写、批量选择和作品预览时出现。提交后会自动保存，我会自行读取，你不必把结果粘贴回对话。</p>
    <section class="card">
      <div class="card-label">主流程界面</div>
      <a class="item" href="/ops-intake.html"><strong>前置信息收集</strong><span>一页填写平台、账号、密码和基本运营需求</span></a>
      <a class="item" href="/ops-topics.html"><strong>前 5 期主题</strong><span>集中修改、替换、调整顺序并确认</span></a>
      <a class="item" href="/ops-calendar.html"><strong>内容日历</strong><span>按已确认主题和更新节奏自动排期，日期可调整</span></a>
      <a class="item" href="/ops-plan-preview.html"><strong>本期制作方案</strong><span>制作前确认讲什么、怎么做、用什么、需要配合什么</span></a>
      <a class="item" href="/ops-review.html"><strong>成片审核</strong><span>查看成片和发布文案，确认或提出修改</span></a>
    </section>
    <section class="card">
      <div class="card-label">以往的材料页（已不在主流程里）</div>
      <a class="item" href="/ops-materials.html"><strong>房源展示</strong><span>以房源链接为主的制作材料</span></a>
      <a class="item" href="/ops-story.html"><strong>成交故事</strong><span>案例、链接和不限形式的文件</span></a>
      <a class="item" href="/ops-bio.html"><strong>个人或团队介绍</strong><span>介绍对象、链接、文件和介绍文字</span></a>
    </section>
    <p class="note">页面本身不调用运营 MCP。密码单独保存在 data/secrets/，不会出现在普通档案或列表接口里。查看已保存记录：<a href="/api/collections">/api/collections</a>。真实接口和自动交接仍需逐项落地验证。</p>
  </main>
</body>
</html>`;
}

export function createServer(options = {}) {
  const root = options.root || ROOT;
  const dataDir = options.dataDir || DATA_DIR;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/api/collections") {
        return sendJson(res, 200, { collections: listRecords(dataDir) });
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/secrets/")) {
        if (!isLocalRequest(req)) return sendJson(res, 403, { error: "只能从本机读取密钥" });
        const id = url.pathname.slice("/api/secrets/".length);
        const secret = readSecret(dataDir, id);
        if (!secret) return sendJson(res, 404, { error: "找不到这条密钥" });
        return sendJson(res, 200, secret);
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/collections/")) {
        const id = url.pathname.slice("/api/collections/".length);
        const record = readRecord(dataDir, id);
        if (!record) return sendJson(res, 404, { error: "找不到这条收集记录" });
        return sendJson(res, 200, record);
      }
      if (req.method === "POST" && url.pathname === "/api/collections") {
        let body;
        try {
          body = JSON.parse(await readBody(req) || "{}");
        } catch (err) {
          return sendJson(res, 400, { error: "请求体需要是 JSON" });
        }
        try {
          const saved = saveCollection(dataDir, body);
          return sendJson(res, 201, saved);
        } catch (err) {
          if (err.status === 400) return sendJson(res, 400, { error: err.message });
          throw err;
        }
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJson(res, 405, { error: "方法不被支持" });
      }
      if (url.pathname === "/") {
        return send(res, 200, homePage(), { "Content-Type": "text/html; charset=utf-8" });
      }
      const relative = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(root, relative);
      if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return sendJson(res, 404, { error: "找不到文件" });
      }
      const ext = path.extname(filePath).toLowerCase();
      send(res, 200, fs.readFileSync(filePath), { "Content-Type": MIME[ext] || "application/octet-stream" });
    } catch (err) {
      sendJson(res, 500, { error: "服务出错了" });
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  createServer().listen(PORT, "127.0.0.1", () => {
    console.log("Ops collection service http://127.0.0.1:" + PORT);
  });
}

export { COLLECTION_KINDS, PORT, ROOT, DATA_DIR };
