/* 获取待完成作业列表（可靠版本）
 * courses.zju.edu.cn: 遍历所有课程获取作业，避免 /api/todos 的 bug
 * pintia.cn: 获取近期未截止的 problem sets
 */

import "../shared/load-env.js";

import { formatDueLine, getReliableTodos } from "../shared/course-todos.js";

function formatTodo(todo) {
  if (todo.source === "pintia") {
    return `
  - [pintia] ${todo.title} @ ${todo.course_name}
    ${formatDueLine(todo.end_time)}
    Go to https://pintia.cn/problem-sets/${todo.id}/exam/problems to submit it.`;
  }
  if (todo.type === "interaction") {
    return `
  - ${todo.title} @ ${todo.course_name}
    ${formatDueLine(todo.end_time)}
    Go to https://courses.zju.edu.cn/course/${todo.course_id}/content#/ to finish it.`;
  }
  return `
  - ${todo.title} @ ${todo.course_name}
    ${formatDueLine(todo.end_time)}
    Go to https://courses.zju.edu.cn/course/${todo.course_id}/learning-activity#/${todo.id} to submit it.`;
}

(async () => {
  console.log("正在获取作业列表...\n");

  const { todos, errors } = await getReliableTodos();
  for (const error of errors) {
    console.error("[!] 获取失败:", error);
  }

  if (todos.length === 0) {
    console.log("没有待完成的作业！");
    return;
  }

  console.log(`You have ${todos.length} things to do:${todos.map(formatTodo).join("\n")}
`);
})();
