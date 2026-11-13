const INTAKE_HEADER = "【开号收集结果】";
const MATERIALS_HEADER = "【制作材料收集结果】";
const TOPICS_HEADER = "【前5期主题】";
const CALENDAR_HEADER = "【内容日历】";
const PLAN_HEADER = "【本期制作方案】";
const REVIEW_HEADER = "【成片审核】";

export const COLLECTION_KINDS = [
  "intake",
  "listing_materials",
  "deal_story",
  "bio",
  "topics",
  "calendar",
  "production_plan",
  "film_review"
];

const PLACEHOLDERS = new Set([
  "尚未填写，稍后接入",
  "暂未填写，方案里再判断",
  "暂未指定，方案中再建议",
  "未填写",
  "其他身份，待确认",
  "其他语言，待确认",
  "未提供，可后补",
  "未选择",
  "未勾选"
]);

const INTAKE_LABELS = [
  "运营平台",
  "运营账号",
  "身份",
  "服务地区",
  "当前目标",
  "内容语言",
  "其他要求",
  "服务客户",
  "房产侧重",
  "服务邮编",
  "目标方向",
  "传播范围",
  "制作偏好",
  "更新节奏",
  "对外姓名",
  "对外头衔",
  "对外电话",
  "对外邮箱",
  "对外头像"
];

const MATERIAL_LABELS = [
  "先做内容",
  "房源链接",
  "识别来源",
  "展示经纪人信息",
  "本次展示字段",
  "对外姓名",
  "对外头衔",
  "对外电话",
  "对外邮箱",
  "对外头像",
  "补充说明",
  "其他要求",
  "这笔是",
  "区域或社区",
  "成交时间或周期",
  "成交价格或区间",
  "案例简述",
  "相关链接",
  "上传文件",
  "补充信息",
  "介绍对象",
  "介绍文字"
];

const INTAKE_FIELD = {
  运营平台: "platform",
  运营账号: "account",
  身份: "identity",
  服务地区: "area",
  当前目标: "goals",
  内容语言: "language",
  其他要求: "note",
  服务客户: "audiences",
  房产侧重: "focuses",
  服务邮编: "zips",
  目标方向: "directions",
  传播范围: "coverage",
  制作偏好: "productionPrefs",
  更新节奏: "cadence",
  对外姓名: "displayName",
  对外头衔: "displayTitle",
  对外电话: "displayPhone",
  对外邮箱: "displayEmail",
  对外头像: "displayPhoto"
};

export function isPlaceholder(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return text === "" || PLACEHOLDERS.has(text);
}

export function filled(value) {
  return !isPlaceholder(value);
}

export function detectKind(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    if (input.kind) return normalizeKind(input.kind, input.record || input);
    return inferKindFromRecord(input.record || input);
  }
  const text = String(input || "");
  if (text.includes(INTAKE_HEADER)) return "intake";
  if (text.includes(TOPICS_HEADER) || text.includes("主题一：") || text.includes("第 1 期主题：")) return "topics";
  if (text.includes(CALENDAR_HEADER) || text.includes("预计发布：")) return "calendar";
  if (text.includes(PLAN_HEADER) || text.includes("讲什么：")) return "production_plan";
  if (text.includes(REVIEW_HEADER) || text.includes("发布文案：")) return "film_review";
  if (text.includes("先做内容：房源展示") || text.includes("房源链接：")) return "listing_materials";
  if (text.includes("先做内容：成交故事") || text.includes("这笔是：")) return "deal_story";
  if (text.includes("先做内容：个人或团队介绍") || text.includes("介绍对象：")) return "bio";
  if (text.includes(MATERIALS_HEADER)) return "listing_materials";
  return null;
}

function normalizeKind(kind, record) {
  if (COLLECTION_KINDS.includes(kind)) return kind;
  return inferKindFromRecord(record);
}

function inferKindFromRecord(record) {
  if (!record || typeof record !== "object") return null;
  if (Array.isArray(record.topics) && (record.batch || record.topics.some((item) => item && (item.title || item.corePoint)))) return "topics";
  if (Array.isArray(record.items) && (record.cadence != null || record.startDate != null)) return "calendar";
  if (record.corePoint != null && (record.opening != null || record.structure != null || record.form != null)) return "production_plan";
  if (record.caption != null || record.filmUrl != null || record.publishAuthorized != null) return "film_review";
  if (record.topic === "房源展示" || Array.isArray(record.urls)) return "listing_materials";
  if (record.topic === "成交故事" || record.dealType != null) return "deal_story";
  if (record.topic === "个人或团队介绍" || record.who != null || record.intro != null) return "bio";
  if (record.account != null || record.identity != null || record.platform != null || record.displayName != null) return "intake";
  return null;
}

export function parseCollection(input) {
  if (input == null) throw new Error("没有可解析的收集结果");
  if (typeof input === "object") return normalizeParsed(input);
  const text = String(input).trim();
  if (!text) throw new Error("没有可解析的收集结果");
  if (text.startsWith("{") || text.startsWith("[")) {
    return normalizeParsed(JSON.parse(text));
  }
  return parsePlaintext(text);
}

function stripParsedSecrets(record) {
  if (!record || typeof record !== "object") return record;
  const out = { ...record };
  delete out.password;
  delete out.accountPassword;
  delete out.account_password;
  delete out.passwd;
  delete out.secret;
  delete out.credentials;
  delete out.loginPassword;
  return out;
}

function normalizeParsed(raw) {
  if (raw.record && raw.kind) {
    return {
      kind: normalizeKind(raw.kind, raw.record),
      collectedAt: raw.collectedAt || raw.record.savedAt || null,
      record: stripParsedSecrets(raw.record),
      plaintext: raw.plaintext || "",
      id: raw.id || null,
      passwordStored: raw.passwordStored === true
    };
  }
  const kind = detectKind(raw);
  const record = stripParsedSecrets(raw.record || raw);
  return {
    kind,
    collectedAt: raw.collectedAt || raw.savedAt || null,
    record,
    plaintext: raw.plaintext || "",
    id: raw.id || null,
    passwordStored: raw.passwordStored === true
  };
}

function parsePlaintext(text) {
  const kind = detectKind(text);
  if (kind === "intake") {
    const fields = parseLabeled(text, INTAKE_LABELS);
    const record = {};
    for (const [label, key] of Object.entries(INTAKE_FIELD)) {
      if (fields[label] != null) record[key] = fields[label];
    }
    delete record.password;
    delete record.accountPassword;
    return { kind, collectedAt: null, record, plaintext: text, id: null };
  }
  const fields = parseLabeled(text, MATERIAL_LABELS);
  if (kind === "deal_story") {
    return {
      kind,
      collectedAt: null,
      record: {
        topic: fields["先做内容"] || "成交故事",
        dealType: fields["这笔是"] || "",
        area: fields["区域或社区"] || "",
        timing: fields["成交时间或周期"] || "",
        price: fields["成交价格或区间"] || "",
        brief: fields["案例简述"] || "",
        links: splitLines(fields["相关链接"]),
        files: parseFiles(fields["上传文件"]),
        note: fields["补充信息"] || "",
        skipped: /本次暂未提供成交故事材料/.test(text)
      },
      plaintext: text,
      id: null
    };
  }
  if (kind === "bio") {
    return {
      kind,
      collectedAt: null,
      record: {
        topic: fields["先做内容"] || "个人或团队介绍",
        who: fields["介绍对象"] || "",
        links: splitLines(fields["相关链接"]),
        files: parseFiles(fields["上传文件"]),
        intro: fields["介绍文字"] || "",
        note: fields["补充信息"] || "",
        skipped: /本次暂未提供介绍材料/.test(text)
      },
      plaintext: text,
      id: null
    };
  }
  return {
    kind: "listing_materials",
    collectedAt: null,
    record: parseListingRecord(fields, text),
    plaintext: text,
    id: null
  };
}

function parseListingRecord(fields, text) {
  const display = (label, keyLabel) => stripOverride(fields[label] || "");
  const overrides = ["对外姓名", "对外头衔", "对外电话", "对外邮箱", "对外头像"]
    .map((label) => {
      const value = fields[label] || "";
      return value.includes("本次更换") ? label.replace(/^对外/, "") : null;
    })
    .filter(Boolean);
  return {
    topic: fields["先做内容"] || "房源展示",
    urls: splitLines(fields["房源链接"]).filter((item) => item && item !== "未提供，可后补"),
    sources: splitList(fields["识别来源"]),
    showAgent: fields["展示经纪人信息"] || "",
    displayName: display("对外姓名"),
    displayTitle: display("对外头衔"),
    displayPhone: display("对外电话"),
    displayEmail: display("对外邮箱"),
    displayPhoto: display("对外头像"),
    shownLabels: splitList(fields["本次展示字段"]),
    overrides,
    note: fields["补充说明"] || "",
    extra: fields["其他要求"] || "",
    skipped: /本次暂未提供房源链接/.test(text)
  };
}

function parseLabeled(text, labels) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const known = new Set(labels);
  const fields = {};
  let current = null;
  for (const line of lines) {
    if (line.startsWith("【") || line.startsWith("请根据以上")) {
      current = null;
      continue;
    }
    const index = line.indexOf("：");
    if (index > 0) {
      const label = line.slice(0, index);
      if (known.has(label)) {
        current = label;
        fields[label] = line.slice(index + 1);
        continue;
      }
    }
    if (current) {
      fields[current] = (fields[current] ? fields[current] + "\n" : "") + line;
    }
  }
  for (const key of Object.keys(fields)) {
    fields[key] = fields[key].replace(/\n+$/, "").trim();
  }
  return fields;
}

function splitLines(value) {
  if (!value) return [];
  return String(value)
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFiles(value) {
  if (!value) return [];
  return String(value)
    .split(/、/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.*)（([^）]+)）$/);
      if (match) return { name: match[1], kind: match[2] };
      return { name: item, kind: "文件" };
    });
}

function stripOverride(value) {
  return String(value).replace(/（本次更换）/g, "").trim();
}
