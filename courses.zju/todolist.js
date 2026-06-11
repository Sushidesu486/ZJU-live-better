/* 获取学在浙大todo list */

import inquirer from "inquirer";
import { COURSES, ZJUAM } from "login-zju";

import "dotenv/config";
import dingTalk from "../shared/dingtalk-webhook.js";

const courses = new COURSES(
  new ZJUAM(process.env.ZJU_USERNAME, process.env.ZJU_PASSWORD)
);

function time_later(end){
    const delta = end.getTime() - new Date().getTime();
    // It returns string like '1 days' '23 mins' '1 hour'
    const units = ['days', 'hours','minutes'];
    let unit = units[0];
    let value = Math.floor(delta / (1000 * 60 * 60 * 24));
    if (value === 0) {
        unit = units[1];
        value = Math.floor(delta / (1000 * 60 * 60));
        if (value === 0) {
            unit = units[2];
            value = Math.floor(delta / (1000 * 60));
        }
    }
    return `${value} ${unit}`;
}


courses.fetch("https://courses.zju.edu.cn/api/todos").then((v) => v.json()).then(/*things like {
    "todo_list": [
        {
            "course_code": "(2024-2025-1)-MARX1002GH-0097194-1",
            "course_id": 76325,
            "course_name": "中国近现代史纲要（H）",
            "course_type": 1,
            "end_time": "2024-12-24T06:30:00Z",
            "id": 932577,
            "is_locked": false,
            "is_student": true,
            "prerequisites": [],
            "title": "冬季论文作业提交",
            "type": "homework"
        }
    ]
}*/ ({todo_list}) => {

    console.log(`You have ${todo_list.length} things to do:${todo_list.map((todo) =>`
  - ${todo.title} @ ${todo.course_name}
    Remains ${ time_later(new Date(todo.end_time)) } (DDL ${new Date(todo.end_time).toLocaleString()})
    Go to https://courses.zju.edu.cn/course/${ todo.course_id }/learning-activity#/${ todo.id } to submit it.`).join("\n")}
`);

    // DingTalk notification
    const urgent = todo_list.filter(t => new Date(t.end_time) - new Date() < 24 * 60 * 60 * 1000);
    let notification = `[Todolist] 你有 ${todo_list.length} 个待办任务`;
    if (urgent.length > 0) {
      notification += `\n其中 ${urgent.length} 个即将到期（24h内）:\n`;
      notification += urgent.map(t => `- ${t.title} @ ${t.course_name} (${time_later(new Date(t.end_time))})`).join('\n');
    }
    dingTalk(notification);
    
})
