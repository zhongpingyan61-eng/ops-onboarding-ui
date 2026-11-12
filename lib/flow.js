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

export function planStep1Onboarding(intake, options = {}) {
  const parsed = intake && intake.kind ? intake : parseCollection(intake);
  const calls = [call("list_accounts", {})];
  const submit = toSubmitAccount(parsed, { account_id: options.account_id });
  if (Object.keys(submit).length) calls.push(call("submit_account", submit));
  if (options.account_id) calls.push(call("get_diagnosis", { account_id: options.account_id }));
  else {
    calls.push({
      name: "get_diagnosis",
      args: { account_id: "<submit_account 返回的 account_id>" },
      note: "account_id 在 submit_account 成功后再填入，不要编造。"
    });
  }
  return calls;
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
      note: "先把定位整理成可审阅方案。只有用户明确回复后才调用 confirm_positioning，customer_words 必填。"
    });
  }
  return calls;
}

export function planStep3Production(options = {}) {
  if (!options.account_id) throw new Error("开始制作需要 account_id");
  const collections = (options.collections || []).map((item) =>
    item && item.kind ? item : parseCollection(item)
  );
  const chosen = collections.filter((item) => item.kind !== "intake" && item.record && !item.record.skipped);
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
  } else if (options.customer_direction) {
    calls.push(call("request_content", {
      account_id: options.account_id,
      customer_words: options.customer_direction,
      intent: "produce",
      idea: options.idea
    }));
  } else if (options.round_id) {
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
  } else {
    calls.push(call("request_content", {
      account_id: options.account_id,
      customer_words: options.customer_words || "请按已确认的定位推荐这一轮选题。",
      intent: "recommend"
    }));
    calls.push({
      name: "get_recommendations",
      args: { account_id: options.account_id, request_id: options.request_id },
      note: "request_content(intent=recommend) 之后，用返回的 request_id 再取推荐。"
    });
  }
  return calls;
}

export function planStep4ScriptAndCalendar(options = {}) {
  if (!options.account_id) throw new Error("脚本和日历需要 account_id");
  const calls = [call("get_content_calendar", { account_id: options.account_id, days: options.days })];
  if (options.script_id) {
    calls.unshift(call("get_script", { account_id: options.account_id, script_id: options.script_id }));
  } else {
    calls.unshift({
      name: "get_script",
      args: null,
      skipped: true,
      note: "接受选题并生成任务后，再用返回的 script_id 读取脚本。若缺展示材料，回到对应收集页，不要在界面里生成文案。"
    });
  }
  return calls;
}

export function planStep5Work(accountId) {
  if (!accountId) throw new Error("查询制作进度需要 account_id");
  return [call("get_work", { account_id: accountId })];
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
      note: "交付不等于发布。用户确认发布方式后，只有作品已在对应渠道公开、并有真实链接时才调用 report_publication。"
    }];
  }
  return [call("report_publication", toReportPublication(options))];
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
      note: "验证码、2FA、身份验证或封号申诉只能用户本人在对应平台完成。需要专家协助或用户明确要求删除账号时再调用相应工具。"
    });
  }
  return calls;
}

export function planEdit(intake, accountId) {
  return [call("edit_submission", toEditSubmission(intake, accountId))];
}

export const STEPS = [
  { id: 1, name: "开号接入", plan: planStep1Onboarding },
  { id: 2, name: "定位方案", plan: planStep2Positioning },
  { id: 3, name: "选题与开始制作", plan: planStep3Production },
  { id: 4, name: "脚本、日历和材料", plan: planStep4ScriptAndCalendar },
  { id: 5, name: "制作与交付", plan: planStep5Work },
  { id: 6, name: "验收与修改", plan: planStep6Review },
  { id: 7, name: "发布前确认", plan: planStep7Publication },
  { id: 8, name: "发布后跟进", plan: planStep8FollowUp },
  { id: 9, name: "异常与停运", plan: planStep9Exception }
];
