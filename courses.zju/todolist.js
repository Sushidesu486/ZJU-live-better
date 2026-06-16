/* 获取学在浙大 todo list */

import "../shared/load-env.js";

import dingTalk from "../shared/dingtalk-webhook.js";
import {
  formatDueLine,
  getCoursesApiTodos,
  todoSortTime,
} from "../shared/course-todos.js";

const MAX_NOTIFY_CHARS = 3000;

function activityUrl(todo) {
  return `https://courses.zju.edu.cn/course/${todo.course_id}/learning-activity#/${todo.id}`;
}

function chunkLines(header, lines, maxChars = MAX_NOTIFY_CHARS) {
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

function formatConsoleTodo(todo) {
  return `
  - ${todo.title} @ ${todo.course_name}
    ${formatDueLine(todo.end_time)}
    Go to ${activityUrl(todo)} to submit it.`;
}

function formatNotifyTodo(todo, index) {
  return `${index + 1}. ${todo.title} @ ${todo.course_name}\n   ${formatDueLine(todo.end_time)}`;
}

async function main() {
  const todos = (await getCoursesApiTodos()).sort(
    (a, b) => todoSortTime(a) - todoSortTime(b)
  );

  if (todos.length === 0) {
    const message = "[Todolist] 无待办任务";
    console.log("You have 0 things to do.");
    await dingTalk(message);
    return;
  }

  console.log(`You have ${todos.length} things to do:${todos.map(formatConsoleTodo).join("\n")}
`);

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const urgentCount = todos.filter((todo) => {
    if (!todo.end_time) return false;
    const delta = todo.end_time.getTime() - now;
    return delta >= 0 && delta < DAY;
  }).length;
  const header = `[Todolist] 你有 ${todos.length} 个待办任务`
    + (urgentCount > 0 ? `，其中 ${urgentCount} 个 24h 内到期:` : ":");

  await dingTalk(chunkLines(header, todos.map(formatNotifyTodo)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
