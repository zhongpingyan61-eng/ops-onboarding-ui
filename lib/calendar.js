/** Arrange a content calendar from confirmed topics, order, and update cadence. */

const CADENCE_RE = /每周\s*([0-9一二两三四五六七八九十]+)\s*期/;
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

export function parseCadence(value, fallbackPerWeek = 1) {
  if (value && typeof value === "object") {
    const perWeek = Number(value.perWeek || value.per_week || fallbackPerWeek) || fallbackPerWeek;
    return { label: value.label || `每周${perWeek}期`, perWeek: Math.max(1, perWeek) };
  }
  const text = String(value || "").trim();
  const match = text.match(CADENCE_RE);
  if (match) {
    const raw = match[1];
    const perWeek = Number(raw) || CN_NUM[raw] || fallbackPerWeek;
    return { label: `每周${perWeek}期`, perWeek: Math.max(1, perWeek) };
  }
  if (/每天|每日/.test(text)) return { label: text || "每天1期", perWeek: 7 };
  if (/隔周|每两周/.test(text)) return { label: text || "每两周1期", perWeek: 0.5 };
  return { label: text || `每周${fallbackPerWeek}期`, perWeek: Math.max(0.5, fallbackPerWeek) };
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function intervalDays(perWeek) {
  if (perWeek <= 0) return 14;
  return Math.max(1, Math.round(7 / perWeek));
}

/**
 * Build calendar items for confirmed topics only.
 * Each item has adjustable dates for asset prep, production, review, and expected publish.
 */
export function arrangeCalendar(options = {}) {
  const cadence = parseCadence(options.cadence, options.perWeek || 1);
  const start = options.startDate ? new Date(options.startDate + "T00:00:00") : new Date();
  if (Number.isNaN(start.getTime())) throw new Error("开始日期无效");
  const timezone = options.timezone || "";
  const topics = (options.topics || [])
    .filter((topic) => topic && topic.confirmed)
    .map((topic, index) => ({
      ...topic,
      order: topic.order != null ? topic.order : index
    }))
    .sort((a, b) => a.order - b.order);

  const step = intervalDays(cadence.perWeek);
  const items = topics.map((topic, index) => {
    const publish = addDays(start, index * step);
    const review = addDays(publish, -1);
    const production = addDays(publish, -3);
    const assetPrep = addDays(publish, -5);
    return {
      topicId: topic.id || `topic-${index + 1}`,
      title: topic.title || `第 ${index + 1} 期`,
      source: topic.source || "recommended",
      order: index + 1,
      assetPrepOn: ymd(assetPrep < start ? start : assetPrep),
      productionOn: ymd(production < start ? start : production),
      reviewOn: ymd(review < start ? start : review),
      publishOn: ymd(publish),
      status: topic.progress || "planned"
    };
  });

  return {
    kind: "calendar",
    cadence: cadence.label,
    perWeek: cadence.perWeek,
    startDate: ymd(start),
    timezone,
    items,
    // 与外部平台日历的实时同步尚未验证；本地保存后，制作方案和进度变化应写回这里。
    platformSync: "unverified"
  };
}

export function applyCalendarAdjustments(calendar, updates = []) {
  if (!calendar || !Array.isArray(calendar.items)) return calendar;
  const items = calendar.items.map((item) => {
    const patch = updates.find((row) => row.topicId === item.topicId || row.order === item.order);
    if (!patch) return item;
    return {
      ...item,
      assetPrepOn: patch.assetPrepOn || item.assetPrepOn,
      productionOn: patch.productionOn || item.productionOn,
      reviewOn: patch.reviewOn || item.reviewOn,
      publishOn: patch.publishOn || item.publishOn,
      status: patch.status || item.status
    };
  });
  return { ...calendar, items, updatedAt: new Date().toISOString() };
}
