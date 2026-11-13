import { parseCollection } from "./parse.js";
import {
  toConfirmPositioning,
  toDecideRecommendations,
  toDeleteAccount,
  toEditSubmission,
  toReportPublication,
  toRequestContent,
  toReviewWork,
  toSubmitAccount
} from "./mcp-payloads.js";

function call(name, args) {
  return { name, args };
}

function skip(note, extra = {}) {
  return { skipped: true, note, ...extra };
}

/** Step 1. 接入 MCP — conversation only. Do not invent a live authorize HTTP API. */
export function planConnectMcp(options = {}) {
  return [skip(
    "用户通过 Personal Agent 完成 Topmoon 服务授权。复用已有工作空间和资料，不重复注册或询问已知信息。此步在对话中完成，不提供新界面。真实授权接口仍需落地验证。",
    { surface: "conversation", step: "connect_mcp", workspace: options.workspace || "reuse-existing" }
  )];
}

/** After intake is saved, map verified non-secret fields to existing ops tools. Password is never submitted. */
export function planIntakeHandoff(intake, options = {}) {
  const parsed = intake && intake.kind ? intake : parseCollection(intake);
  const calls = [call("list_accounts", {})];
  const submit = toSubmitAccount(parsed, { account_id: options.account_id });
  if (Object.keys(submit).length) calls.push(call("submit_account", submit));
  if (options.account_id) calls.push(call("get_diagnosis", { account_id: options.account_id }));
  else {
    calls.push({
      name: "get_diagnosis",
      args: { account_id: "<submit_account 返回的 account_id>" },
      note: "account_id 在 submit_account 成功后再填入，不要编造。密码不得写入此工具或其他 MCP 参数。"
    });
  }
  return calls;
}

export const planStep1Onboarding = planIntakeHandoff;

export function planLongTermPlan(options = {}) {
  if (!options.account_id) {
    return [skip("提出长期运营方案在对话中完成。先根据已保存的开号资料和必要分析给出一版草案，不要让用户从空白开始写。事实、建议和待验证判断分开表达。读取平台定位建议仍需 account_id。", { surface: "conversation" })];
  }
  const calls = [call("get_positioning", { account_id: options.account_id })];
  calls.push(skip("先把长期目标、近期重点、受众、地区、内容主线、表达方式、渠道与更新节奏整理成可审阅方案。只有用户明确确认后，才保存正式版本并进入前 5 期主题讨论。", {
    name: "confirm_positioning",
    args: null,
    surface: "conversation"
  }));
  return calls;
}

export function planConfirmLongTermPlan(options = {}) {
  return planStep2Positioning(options);
}

export function planStep2Positioning(options = {}) {
  if (!options.account_id) throw new Error("定位方案需要 account_id");
  const calls = [call("get_positioning", { account_id: options.account_id })];
  if (options.decision && options.customer_words) {
    calls.push(call("confirm_positioning", toConfirmPositioning({
      account_id: options.account_id,
      version: options.version ?? 0,
      decision: options.decision,
      customer_words: options.customer_words,
      agent_summary: options.agent_summary,
      corrections: options.corrections,
      autonomy: options.autonomy || "confirm_each"
    })));
  } else {
    calls.push({
      name: "confirm_positioning",
      args: null,
      skipped: true,
      surface: "conversation",
      note: "长期方案在对话里修改，直到用户明确确认。没有明确回复时不要调用 confirm_positioning，customer_words 必填。确认后保存正式版本，再进入前 5 期主题。"
    });
  }
  return calls;
}

function topicCollections(options) {
  const fromList = (options.collections || []).map((item) =>
    item && item.kind ? item : parseCollection(item)
  );
  if (options.topics) {
    const parsed = options.topics.kind ? options.topics : parseCollection(options.topics);
    fromList.push(parsed);
  }
  return fromList;
}

function confirmedTopicsFrom(options) {
  const collections = topicCollections(options);
  const topicDocs = collections.filter((item) => item.kind === "topics");
  const topics = [];
  for (const doc of topicDocs) {
    for (const topic of doc.record?.topics || []) {
      if (topic) topics.push(topic);
    }
  }
  const owned = topics.filter((topic) => topic.source === "user" || topic.owned);
  const rest = topics.filter((topic) => !(topic.source === "user" || topic.owned));
  const ordered = [...owned, ...rest];
  return {
    all: ordered,
    confirmed: ordered.filter((topic) => topic.confirmed),
    unconfirmed: ordered.filter((topic) => !topic.confirmed)
  };
}

export function planTopics(options = {}) {
  const { confirmed, unconfirmed, all } = confirmedTopicsFrom(options);
  const calls = [];
  if (unconfirmed.length) {
    calls.push(skip(
      "未确认的主题不能直接开做，也不进入制作任务。请在 ops-topics.html 中集中修改、替换、调整顺序并确认。用户自己的内容优先，已有选题先采用并完善，缺少的部分再推荐。",
      { surface: "ui+conversation", page: "ops-topics.html", unconfirmedCount: unconfirmed.length, total: all.length }
    ));
  }
  if (confirmed.length && options.account_id) {
    for (const topic of confirmed) {
      calls.push(call("request_content", {
        account_id: options.account_id,
        customer_words: options.customer_words || topic.title || topic.corePoint,
        intent: "produce",
        idea: topic.title,
        format: topic.format,
        audience: topic.audience,
        agent_summary: [topic.corePoint, topic.opening, topic.rationale].filter(Boolean).join("；")
      }));
    }
  } else if (!confirmed.length && options.account_id && options.round_id) {
    calls.push(call("get_recommendations", {
      account_id: options.account_id,
      request_id: options.request_id,
      round_id: options.round_id
    }));
    if (options.decisions) {
      calls.push(call("decide_recommendations", toDecideRecommendations({
        account_id: options.account_id,
        round_id: options.round_id,
        decisions: options.decisions
      })));
    }
  } else if (!confirmed.length && options.account_id) {
    calls.push(call("request_content", {
      account_id: options.account_id,
      customer_words: options.customer_words || "请按已确认的长期方案推荐前 5 期主题。",
      intent: "recommend"
    }));
  } else if (!all.length) {
    calls.push(skip("按已确认的长期方案检索并核查信息源，推荐前 5 期主题。每期说明讲给谁、核心观点、开场、形式、推荐理由及必要素材。用户可在轻量界面里集中修改后确认。", {
      surface: "conversation+ui",
      page: "ops-topics.html"
    }));
  }
  return calls;
}

export function planStep3Production(options = {}) {
  if (!options.account_id) throw new Error("开始制作需要 account_id");
  const collections = (options.collections || []).map((item) =>
    item && item.kind ? item : parseCollection(item)
  );
  const chosen = collections.filter((item) =>
    item.kind !== "intake" &&
    item.kind !== "topics" &&
    item.kind !== "calendar" &&
    item.kind !== "production_plan" &&
    item.kind !== "film_review" &&
    item.record &&
    !item.record.skipped
  );
  const calls = [];
  if (chosen.length) {
    for (const item of chosen) {
      calls.push(call("request_content", toRequestContent(item, {
        account_id: options.account_id,
        intent: "produce",
        customer_words: options.customer_words || item.plaintext,
        format: options.format
      })));
    }
    return calls;
  }
  const topicPlan = planTopics(options);
  if (topicPlan.length) return topicPlan;
  if (options.customer_direction) {
    return [call("request_content", {
      account_id: options.account_id,
      customer_words: options.customer_direction,
      intent: "produce",
      idea: options.idea
    })];
  }
  return [call("request_content", {
    account_id: options.account_id,
    customer_words: options.customer_words || "请按已确认的定位推荐这一轮选题。",
    intent: "recommend"
  }), {
    name: "get_recommendations",
    args: { account_id: options.account_id, request_id: options.request_id },
    note: "request_content(intent=recommend) 之后，用返回的 request_id 再取推荐。"
  }];
}

export function planCalendar(options = {}) {
  const calls = [];
  if (options.account_id) {
    calls.push({
      name: "get_content_calendar",
      args: { account_id: options.account_id, days: options.days },
      note: "运营平台日历接口尚未逐项验证，不要假定已自动写入外部日历。本地日历根据已确认主题、顺序和更新节奏自动排布，日期可调整；制作方案和实际进度变化应同步回本地日历。"
    });
  } else {
    calls.push(skip(
      "根据已确认的主题、顺序和更新节奏自动安排素材准备、制作、审核及预计发布节点，不让客户从空白日历手动排期。必要的时间、时区或配合条件在聊天中问清。与外部平台日历的实时同步尚未验证。",
      { surface: "ui", page: "ops-calendar.html" }
    ));
  }
  if (options.script_id && options.account_id) {
    calls.unshift(call("get_script", { account_id: options.account_id, script_id: options.script_id }));
  }
  return calls;
}

export const planStep4ScriptAndCalendar = function planStep4ScriptAndCalendar(options = {}) {
  if (!options.account_id) throw new Error("脚本和日历需要 account_id");
  const calls = [call("get_content_calendar", { account_id: options.account_id, days: options.days })];
  if (options.script_id) {
    calls.unshift(call("get_script", { account_id: options.account_id, script_id: options.script_id }));
  } else {
    calls.unshift({
      name: "get_script",
      args: null,
      skipped: true,
      note: "接受选题并生成任务后，再用返回的 script_id 读取脚本。内容日历以本地自动排期为准；平台日历接口尚未逐项验证。"
    });
  }
  return calls;
};

export function planEpisodeGaps(options = {}) {
  return [skip(
    "补齐本期必要信息只在对话里进行，不使用表单。只询问真正影响制作的缺项。若尚未明确个人信息展示偏好，应主动询问是否展示，并推荐适合本期的信息（例如姓名、经纪公司、服务地区或联系方式）。需要则确认具体内容；不需要则跳过。已有且适用的授权不重复问。",
    { surface: "conversation", episode: options.episode || null }
  )];
}

export function planProductionPlan(options = {}) {
  const plan = options.plan && (options.plan.kind ? options.plan : parseCollection(options.plan));
  const confirmed = plan?.record?.confirmed === true;
  if (!confirmed) {
    return [skip(
      "实际制作前，须在 ops-plan-preview.html 展示本期制作方案（讲什么、怎么做、用什么、需要配合什么），并由客户明确确认。不展示个人信息只省去信息补充，不跳过这次方案确认。确认前不要开始实际制作。",
      { surface: "ui+conversation", page: "ops-plan-preview.html" }
    )];
  }
  if (options.account_id) {
    return [call("request_content", {
      account_id: options.account_id,
      customer_words: options.customer_words || plan.plaintext || plan.record.title,
      intent: "produce",
      idea: plan.record.title,
      format: plan.record.form,
      agent_summary: "本期制作方案已确认"
    })];
  }
  return [skip("本期制作方案已确认，可以开始实际制作。", { confirmed: true, surface: "ui+conversation" })];
}

export function planProductionQa(options = {}) {
  if (options.account_id) return [call("get_work", { account_id: options.account_id })];
  return [skip(
    "Agent 把确认后的方案变成明确制作任务，协调制作、跟进进度、检查结果并推动返修。确需真实素材时才请客户提供；素材不足则说明影响和替代方案。内部事实、表达、素材使用及渠道适配检查，不全部转交客户承担。",
    { surface: "agent" }
  )];
}

export const planStep5Work = function planStep5Work(accountId) {
  if (!accountId) throw new Error("查询制作进度需要 account_id");
  return [call("get_work", { account_id: accountId })];
};

export function planFilmReview(options = {}) {
  const review = options.review && (options.review.kind ? options.review : parseCollection(options.review));
  const decision = review?.record?.decision || options.decision;
  const calls = [];
  if (!decision) {
    calls.push(skip(
      "在 ops-review.html 集中展示成片和发布文案，客户确认或提出具体修改。返修不重新走整套定位和选题流程。成片确认与发布授权分开。",
      { surface: "ui+conversation", page: "ops-review.html" }
    ));
    return calls;
  }
  if (options.account_id && options.task_id && options.version != null && options.customer_words) {
    calls.push(call("review_work", toReviewWork({
      account_id: options.account_id,
      task_id: options.task_id,
      version: options.version,
      decision: options.decision || (decision === "approve" ? "approve" : "revise"),
      customer_words: options.customer_words,
      comment: options.comment || review?.record?.revisionNotes,
      agent_summary: options.agent_summary
    })));
  }
  const url = options.url || review?.record?.publicUrl;
  if (!url) {
    calls.push({
      name: "report_publication",
      args: null,
      skipped: true,
      note: "成片确认不等于发布授权。当前按约定由人完成发布。只有作品真正发出、并有对应渠道的真实公开链接后，才记录发布结果。不要编造一次成功的发布。"
    });
  } else if (options.account_id && options.task_id) {
    calls.push(call("report_publication", toReportPublication({
      account_id: options.account_id,
      task_id: options.task_id,
      url,
      published_at: options.published_at
    })));
  }
  return calls;
}

export function planStep6Review(options = {}) {
  return [call("review_work", toReviewWork(options))];
}

export function planStep7Publication(options = {}) {
  if (!options.url) {
    return [{
      name: "report_publication",
      args: null,
      skipped: true,
      note: "交付不等于发布。成片确认与发布授权分开。用户确认发布方式后，只有作品已在对应渠道公开、并有真实链接时才调用 report_publication。不要编造一次成功的发布。"
    }];
  }
  return [call("report_publication", toReportPublication(options))];
}

export function planReviewCycle(options = {}) {
  const calls = [];
  if (options.account_id) {
    calls.push(call("get_content_calendar", { account_id: options.account_id, days: options.days }));
    if (options.daily || options.posts) {
      calls.push(call("upload_metrics", {
        account_id: options.account_id,
        daily: options.daily,
        posts: options.posts
      }));
    }
  } else {
    calls.push(skip(
      "按约定周期复盘，结合可用的发布记录、表现数据和客户反馈，调整后续主题、形式和节奏。首批完成后，继续讨论下一批主题并更新日历；长期方案仍有效时不从头重做，确需调整时只重新核对受影响的内容。下一期重复「补齐必要信息 → 制作方案确认 → 制作 → 成片审核」。",
      { surface: "conversation" }
    ));
  }
  return calls;
}

export function planStep8FollowUp(options = {}) {
  if (!options.account_id) throw new Error("发布后跟进需要 account_id");
  const calls = [call("get_content_calendar", { account_id: options.account_id, days: options.days })];
  if (options.daily || options.posts) {
    calls.push(call("upload_metrics", {
      account_id: options.account_id,
      daily: options.daily,
      posts: options.posts
    }));
  }
  if (options.start_next && options.collections) {
    calls.push(...planStep3Production({
      account_id: options.account_id,
      collections: options.collections,
      customer_words: options.customer_words
    }));
  }
  return calls;
}

export function planStep9Exception(options = {}) {
  if (!options.account_id) throw new Error("异常处理需要 account_id");
  const calls = [];
  if (options.expert) {
    calls.push(call("expert_help", {
      account_id: options.account_id,
      action: options.expert.action || "request",
      target: options.expert.target,
      reference: options.expert.reference,
      change: options.expert.change,
      request_id: options.expert.request_id,
      request_key: options.expert.request_key
    }));
  }
  if (options.delete) {
    calls.push(call("delete_account", toDeleteAccount({
      account_id: options.account_id,
      confirm_handle: options.delete.confirm_handle
    })));
  }
  if (!calls.length) {
    calls.push({
      name: "expert_help",
      args: null,
      skipped: true,
      note: "验证码、2FA、身份验证或封号申诉只能用户本人在对应平台完成。需要专家协助或用户明确要求删除账号时再调用相应工具。密码不得写入对话或日志。"
    });
  }
  return calls;
}

export function planEdit(intake, accountId) {
  return [call("edit_submission", toEditSubmission(intake, accountId))];
}

export const STEPS = [
  { id: 1, name: "接入 MCP", plan: planConnectMcp, surface: "conversation" },
  { id: 2, name: "前置信息收集", plan: planIntakeHandoff, surface: "ui", page: "ops-intake.html" },
  { id: 3, name: "提出长期运营方案", plan: planLongTermPlan, surface: "conversation" },
  { id: 4, name: "修改并确认长期方案", plan: planConfirmLongTermPlan, surface: "conversation" },
  { id: 5, name: "讨论并确认前 5 期主题", plan: planTopics, surface: "conversation+ui", page: "ops-topics.html" },
  { id: 6, name: "自动建立内容日历", plan: planCalendar, surface: "ui", page: "ops-calendar.html" },
  { id: 7, name: "补齐本期必要信息", plan: planEpisodeGaps, surface: "conversation" },
  { id: 8, name: "展示本期制作方案", plan: planProductionPlan, surface: "ui+conversation", page: "ops-plan-preview.html" },
  { id: 9, name: "制作与内部质检", plan: planProductionQa, surface: "agent" },
  { id: 10, name: "成片审核与交付", plan: planFilmReview, surface: "ui+conversation", page: "ops-review.html" },
  { id: 11, name: "复盘并推进下一轮", plan: planReviewCycle, surface: "conversation" }
];
