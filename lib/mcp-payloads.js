import { filled, isPlaceholder, parseCollection } from "./parse.js";

const PLATFORMS = new Set(["Instagram", "TikTok"]);
const FORMATS = new Set(["图文", "轮播", "海报", "幻灯片视频", "视频"]);
const LANGUAGE_MAP = {
  英语: "English",
  English: "English",
  中文: "Chinese",
  普通话: "Chinese",
  汉语: "Chinese",
  Chinese: "Chinese",
  西班牙语: "Spanish",
  Spanish: "Spanish"
};

function compact(object) {
  if (Array.isArray(object)) return object;
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = compact(value);
      if (Object.keys(nested).length === 0) continue;
      out[key] = nested;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function parseAccountField(account, platformHint) {
  const result = {
    platform: PLATFORMS.has(platformHint) ? platformHint : undefined,
    handle: undefined,
    profile_url: undefined,
    pending_auth: /待授权/.test(account || "")
  };
  if (!filled(account)) return result;
  const cleaned = String(account).replace(/（待授权）/g, "").trim();
  const parts = cleaned.split(" · ").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const maybePlatform = parts[0];
    const rest = parts.slice(1);
    if (PLATFORMS.has(maybePlatform)) result.platform = maybePlatform;
    else if (!result.platform) {
      result.platform = maybePlatform;
    }
    const tokens = PLATFORMS.has(maybePlatform) || result.platform === maybePlatform ? rest : parts;
    for (const part of tokens) {
      if (/^https?:\/\//i.test(part)) result.profile_url = part;
      else if (!/^(尚未填写|稍后接入)/.test(part)) result.handle = part.replace(/^@/, "");
    }
  } else if (/^https?:\/\//i.test(cleaned)) {
    result.profile_url = cleaned;
  } else if (!/尚未填写，稍后接入/.test(cleaned)) {
    result.handle = cleaned.replace(/^@/, "");
  }
  if (result.platform && !PLATFORMS.has(result.platform)) {
    result.platform = undefined;
  }
  return result;
}

export function mapLanguage(value) {
  if (!filled(value)) return undefined;
  return LANGUAGE_MAP[value] || value;
}

export function displayProfile(record) {
  if (!record) return {};
  return compact({
    displayName: record.displayName,
    displayTitle: record.displayTitle,
    displayPhone: record.displayPhone,
    displayEmail: record.displayEmail,
    displayPhoto: record.displayPhoto
  });
}

export function toSubmitAccount(intake, options = {}) {
  const record = intake.record || intake;
  const parsed = parseAccountField(record.account, record.platform);
  const intakeFields = compact({
    region: filled(record.area) ? record.area : undefined,
    audience: filled(record.audiences) ? record.audiences : undefined,
    style: filled(record.directions) ? record.directions : undefined,
    experience: filled(record.identity) ? record.identity : undefined,
    cases: filled(record.focuses) ? record.focuses : undefined,
    clarification: filled(record.note) ? record.note : undefined
  });
  // 传播范围「全球不限」只表示分发覆盖，不写入 region / 服务地区。
  return compact({
    account_id: options.account_id,
    platform: parsed.platform,
    profile_url: parsed.profile_url,
    name: parsed.handle,
    language: mapLanguage(record.language),
    audience: filled(record.audiences) ? record.audiences : undefined,
    intake: intakeFields
  });
}

export function toEditSubmission(intake, accountId) {
  if (!accountId) throw new Error("edit_submission 需要 account_id");
  return compact({
    account_id: accountId,
    ...toSubmitAccount(intake)
  });
}

export function toRequestContent(collection, options = {}) {
  const parsed = collection.kind ? collection : parseCollection(collection);
  const record = parsed.record || collection;
  const customerWords = options.customer_words || parsed.plaintext || options.fallbackWords;
  if (!customerWords) {
    throw new Error("request_content 需要 customer_words（粘贴结果、JSON 里的 plaintext，或主持方提供的说明）");
  }
  const intent = options.intent || (record.skipped ? "recommend" : "produce");
  let format = options.format;
  if (!format) {
    if (parsed.kind === "deal_story") format = "轮播";
    else if (parsed.kind === "bio") format = "图文";
  }
  if (format && !FORMATS.has(format)) format = undefined;
  const links = record.urls || record.links || [];
  return compact({
    account_id: options.account_id,
    request_id: options.request_id,
    customer_words: customerWords,
    intent,
    format,
    channel: options.channel,
    audience: options.audience,
    source_url: options.source_url || links[0],
    idea: options.idea || record.topic,
    agent_summary: options.agent_summary || summarizeCollection(parsed)
  });
}

export function summarizeCollection(collection) {
  const parsed = collection.kind ? collection : parseCollection(collection);
  const record = parsed.record || {};
  if (parsed.kind === "intake") {
    return ["开号收集", record.identity, record.goals].filter(filled).join("，");
  }
  if (parsed.kind === "listing_materials") {
    const bits = ["房源展示"];
    if (record.urls && record.urls.length) bits.push(record.urls.length + " 条链接");
    if (record.showAgent === "是") bits.push("展示经纪人：" + (record.shownLabels || []).join("、"));
    else bits.push("不展示经纪人个人信息");
    if (record.skipped) bits.push("材料暂缺");
    return bits.join("，");
  }
  if (parsed.kind === "deal_story") {
    const bits = ["成交故事", record.dealType, record.area].filter(filled);
    if (record.files && record.files.length) bits.push("文件 " + record.files.length + " 个（需同时取得原文件）");
    if (record.skipped) bits.push("材料暂缺");
    return bits.join("，");
  }
  if (parsed.kind === "bio") {
    const bits = ["个人或团队介绍", record.who].filter(filled);
    if (record.files && record.files.length) bits.push("文件 " + record.files.length + " 个（需同时取得原文件）");
    if (record.skipped) bits.push("材料暂缺");
    return bits.join("，");
  }
  return parsed.kind || "";
}

export function toConfirmPositioning(options) {
  if (!options || !options.account_id) throw new Error("confirm_positioning 需要 account_id");
  if (options.version == null) throw new Error("confirm_positioning 需要 version");
  if (!options.decision) throw new Error("confirm_positioning 需要 decision");
  if (!options.customer_words) throw new Error("confirm_positioning 需要用户原话 customer_words，没有明确回复时不要调用");
  return compact({
    account_id: options.account_id,
    version: options.version,
    decision: options.decision,
    customer_words: options.customer_words,
    agent_summary: options.agent_summary,
    corrections: options.corrections,
    autonomy: options.autonomy
  });
}

export function toDecideRecommendations(options) {
  if (!options || !options.account_id || !options.round_id) {
    throw new Error("decide_recommendations 需要 account_id 和 round_id");
  }
  if (!Array.isArray(options.decisions) || options.decisions.length === 0) {
    throw new Error("decide_recommendations 需要 decisions");
  }
  return {
    account_id: options.account_id,
    round_id: options.round_id,
    decisions: options.decisions.map((item) =>
      compact({
        item_id: item.item_id,
        decision: item.decision,
        customer_words: item.customer_words,
        agent_summary: item.agent_summary,
        changes: item.changes
      })
    )
  };
}

export function toReviewWork(options) {
  if (!options || !options.account_id || !options.task_id || options.version == null || !options.decision) {
    throw new Error("review_work 需要 account_id、task_id、version 和 decision");
  }
  if (!options.customer_words) throw new Error("review_work 需要 customer_words");
  return compact({
    account_id: options.account_id,
    task_id: options.task_id,
    version: options.version,
    decision: options.decision,
    customer_words: options.customer_words,
    comment: options.comment,
    agent_summary: options.agent_summary
  });
}

export function toReportPublication(options) {
  if (!options || !options.account_id || !options.task_id) {
    throw new Error("report_publication 需要 account_id 和 task_id");
  }
  const url = options.url || "";
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("report_publication 只在已有对应渠道的真实公开链接时调用；交付不等于发布");
  }
  return compact({
    account_id: options.account_id,
    task_id: options.task_id,
    url,
    published_at: options.published_at
  });
}

export function toDeleteAccount(options) {
  if (!options || !options.account_id || !options.confirm_handle) {
    throw new Error("delete_account 需要用户明确同意，以及 account_id 和 confirm_handle");
  }
  return {
    account_id: options.account_id,
    confirm_handle: options.confirm_handle
  };
}

export function createHost(callTool) {
  if (typeof callTool !== "function") throw new Error("createHost 需要 callTool(name, args) 实现");
  return {
    callTool,
    listAccounts() {
      return callTool("list_accounts", {});
    },
    submitAccount(intake, options) {
      return callTool("submit_account", toSubmitAccount(intake, options));
    },
    editSubmission(intake, accountId) {
      return callTool("edit_submission", toEditSubmission(intake, accountId));
    },
    getDiagnosis(accountId) {
      return callTool("get_diagnosis", { account_id: accountId });
    },
    getPositioning(accountId) {
      return callTool("get_positioning", { account_id: accountId });
    },
    confirmPositioning(options) {
      return callTool("confirm_positioning", toConfirmPositioning(options));
    },
    requestContent(collection, options) {
      return callTool("request_content", toRequestContent(collection, options));
    },
    getRecommendations(accountId, options = {}) {
      return callTool("get_recommendations", compact({
        account_id: accountId,
        request_id: options.request_id,
        round_id: options.round_id
      }));
    },
    decideRecommendations(options) {
      return callTool("decide_recommendations", toDecideRecommendations(options));
    },
    getScript(accountId, scriptId) {
      return callTool("get_script", { account_id: accountId, script_id: scriptId });
    },
    getContentCalendar(accountId, days) {
      return callTool("get_content_calendar", compact({ account_id: accountId, days }));
    },
    getWork(accountId) {
      return callTool("get_work", { account_id: accountId });
    },
    reviewWork(options) {
      return callTool("review_work", toReviewWork(options));
    },
    reportPublication(options) {
      return callTool("report_publication", toReportPublication(options));
    },
    uploadMetrics(accountId, options = {}) {
      return callTool("upload_metrics", compact({
        account_id: accountId,
        daily: options.daily,
        posts: options.posts
      }));
    },
    platformWork(accountId, action, extra = {}) {
      return callTool("platform_work", compact({
        account_id: accountId,
        action,
        ...extra
      }));
    },
    expertHelp(accountId, action, extra = {}) {
      return callTool("expert_help", compact({
        account_id: accountId,
        action,
        ...extra
      }));
    },
    deleteAccount(options) {
      return callTool("delete_account", toDeleteAccount(options));
    }
  };
}

export { compact, isPlaceholder };
