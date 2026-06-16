import { APILIB } from "login-zju";
import { formatDateTime, getReliableTodos, timeLeft } from "./course-todos.js";
import { createZjuam } from "./zju-auth.js";

const TODO_NOTIFY_CHARS = 3000;

function chunkLines(header, lines, maxChars = TODO_NOTIFY_CHARS) {
  if (lines.length === 0) return [header];

  const chunks = [];
  let current = [];
  for (const line of lines) {
    const candidate = [header, ...current, line].join("\n");
    if (candidate.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current);

  if (chunks.length === 1) return [`${header}\n${chunks[0].join("\n")}`];
  return chunks.map((chunk, index) => (
    `${header} (${index + 1}/${chunks.length})\n${chunk.join("\n")}`
  ));
}

function todoLine(todo, index, now = new Date()) {
  const source = todo.source === "pintia" ? "[pintia] " : "";
  const due = todo.end_time
    ? `${formatDateTime(todo.end_time)}，${timeLeft(todo.end_time, now)}`
    : "No DDL";
  return `${index + 1}. ${source}${todo.title} @ ${todo.course_name}\n   DDL: ${due}`;
}

function messagesToLog(messages) {
  return Array.isArray(messages) ? messages.join("\n\n") : messages;
}

/**
 * 获取作业待办汇总
 * @param {boolean} urgentOnly - true: 仅24h内到期的任务
 * @returns {{ log: string, notify: string | string[] | null }}
 */
export async function todoSummary(urgentOnly = false) {
  const { todos, errors } = await getReliableTodos();

  if (todos.length === 0) {
    if (errors.length > 0) {
      const notify = `[Todolist] 获取待办失败，未确认是否有作业:\n${errors.map((error) => `- ${error}`).join("\n")}`;
      return { log: notify, notify };
    }
    return { log: "[Todolist] 无待办任务", notify: null };
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const urgent = todos.filter((todo) => todo.end_time && todo.end_time.getTime() - now < DAY);
  const warningLines = errors.map((error) => `! 获取异常: ${error}`);

  if (urgentOnly) {
    if (urgent.length === 0) {
      return { log: "[Todolist] 无紧急任务", notify: null };
    }
    const notify = chunkLines(
      `[Todolist 紧急] ${urgent.length} 个任务即将到期(24h内):`,
      [...urgent.map((todo, index) => todoLine(todo, index, new Date(now))), ...warningLines]
    );
    return { log: messagesToLog(notify), notify };
  }

  const header = `[Todolist] 你有 ${todos.length} 个待办任务`
    + (urgent.length > 0 ? `，其中 ${urgent.length} 个 24h 内到期:` : ":");
  const notify = chunkLines(
    header,
    [...todos.map((todo, index) => todoLine(todo, index, new Date(now))), ...warningLines]
  );
  return { log: messagesToLog(notify), notify };
}

/**
 * 获取图书馆借阅汇总
 * @param {boolean} urgentOnly - true: 仅3天内到期的图书
 * @returns {{ log: string, notify: string | null }}
 */
export async function bookSummary(urgentOnly = false) {
  const apilib = new APILIB(createZjuam());

  try {
    await apilib.fetch("http://api.lib.zju.edu.cn/aleph/bor-auth?CON_LNG=chi");
  } catch (error) {
    return {
      log: `[图书馆] 登录失败: ${error.message}`,
      notify: null,
    };
  }
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
