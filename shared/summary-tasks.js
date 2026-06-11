import { COURSES, ZJUAM, APILIB } from "login-zju";
import dingTalk from "./dingtalk-webhook.js";

/**
 * 获取作业待办汇总
 * @param {boolean} urgentOnly - true: 仅24h内到期的任务
 * @returns {{ log: string, notify: string | null }}
 */
export async function todoSummary(urgentOnly = false) {
  const courses = new COURSES(
    new ZJUAM(process.env.ZJU_USERNAME, process.env.ZJU_PASSWORD)
  );

  const resp = await courses
    .fetch("https://courses.zju.edu.cn/api/todos")
    .then((v) => v.json());

  const { todo_list } = resp;

  if (!todo_list || todo_list.length === 0) {
    return { log: "[Todolist] 无待办任务", notify: null };
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const urgent = todo_list.filter((t) => new Date(t.end_time) - now < DAY);

  function fmt(t) {
    const delta = new Date(t.end_time) - now;
    if (delta < 0) return "已过期";
    const hours = Math.floor(delta / (1000 * 60 * 60));
    if (hours < 24) return `${hours}小时`;
    return `${Math.floor(hours / 24)}天`;
  }

  if (urgentOnly) {
    if (urgent.length === 0) {
      return { log: "[Todolist] 无紧急任务", notify: null };
    }
    const notify =
      `[Todolist 紧急] ${urgent.length} 个任务即将到期(24h内):\n` +
      urgent
        .map((t) => `- ${t.title} @ ${t.course_name} (剩余${fmt(t)})`)
        .join("\n");
    return { log: notify, notify };
  }

  const notify =
    `[Todolist] 你有 ${todo_list.length} 个待办任务` +
    (urgent.length > 0
      ? `\n其中 ${urgent.length} 个即将到期(24h内):\n` +
        urgent
          .map((t) => `- ${t.title} @ ${t.course_name} (剩余${fmt(t)})`)
          .join("\n")
      : "");
  return { log: notify, notify };
}

/**
 * 获取图书馆借阅汇总
 * @param {boolean} urgentOnly - true: 仅3天内到期的图书
 * @returns {{ log: string, notify: string | null }}
 */
export async function bookSummary(urgentOnly = false) {
  const am = new ZJUAM(process.env.ZJU_USERNAME, process.env.ZJU_PASSWORD);
  const apilib = new APILIB(am);

  await apilib
    .fetch("http://api.lib.zju.edu.cn/aleph/bor-auth?CON_LNG=chi")
    .catch(() => {});
  const borId = apilib.bor_id;
  if (!borId) {
    return { log: "[图书馆] 登录失败", notify: null };
  }

  const borResp = await apilib.fetch(
    `http://api.lib.zju.edu.cn/aleph/bor_info?bor_id=${borId}`
  );
  const borJson = await borResp.json();
  const borInfo = borJson.data?.["bor-info"];
  if (!borInfo || borInfo.error) {
    return {
      log: `[图书馆] 获取借阅信息失败: ${borInfo?.error || "unknown"}`,
      notify: null,
    };
  }

  const loanItems = borInfo["item-l"];
  const loans = Array.isArray(loanItems)
    ? loanItems
    : loanItems
      ? [loanItems]
      : [];

  if (loans.length === 0) {
    return { log: "[图书馆] 当前无借阅图书", notify: null };
  }

  const now = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );

  function getDueInfo(item) {
    const ds = item.z36?.["z36-due-date"];
    if (!ds) return { days: null, status: "unknown" };
    const fmt = ds.length === 8 ? `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}` : ds;
    const due = new Date(fmt + "T00:00:00");
    const days = Math.round((due - now) / (1000 * 60 * 60 * 24));
    if (days < 0) return { days, status: "overdue" };
    if (days <= 7) return { days, status: "soon" };
    return { days, status: "ok" };
  }

  const overdue = [];
  const dueSoon = [];

  for (const item of loans) {
    const title = item.z13?.["z13-title"] || "未知";
    const { days, status } = getDueInfo(item);
    if (status === "overdue") overdue.push({ title, days });
    else if (status === "soon") dueSoon.push({ title, days });
  }

  if (urgentOnly) {
    // 紧急模式：仅 3 天内到期或已逾期
    const critical = [
      ...overdue,
      ...dueSoon.filter((b) => b.days <= 3),
    ];
    if (critical.length === 0) {
      return { log: "[图书馆] 无紧急归还任务", notify: null };
    }
    const notify =
      `[图书馆 紧急] ${critical.length} 本图书需尽快处理:\n` +
      critical
        .map((b) => `- ${b.title} (${b.days < 0 ? `已逾期${-b.days}天` : `${b.days}天后到期`})`)
        .join("\n");
    return { log: notify, notify };
  }

  if (overdue.length === 0 && dueSoon.length === 0) {
    return {
      log: `[图书馆] 共 ${loans.length} 本在借，均未到期`,
      notify: null,
    };
  }

  let notify = `[图书馆] 共 ${loans.length} 本在借`;
  if (overdue.length > 0) {
    notify +=
      `\n${overdue.length} 本已逾期:\n` +
      overdue.map((b) => `- ${b.title} (逾期${-b.days}天)`).join("\n");
  }
  if (dueSoon.length > 0) {
    notify +=
      `\n${dueSoon.length} 本即将到期:\n` +
      dueSoon.map((b) => `- ${b.title} (${b.days}天后到期)`).join("\n");
  }
  return { log: notify, notify };
}
