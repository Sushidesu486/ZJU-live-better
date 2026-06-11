#!/usr/bin/env node

import inquirer from 'inquirer';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dingTalk from './dingtalk-webhook.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BACK = '__back__';
const EXIT = '__exit__';

const categories = {
  '学在浙大': [
    { name: '生成作业待办 (todolist)', value: 'courses.zju/todolist.js' },
    { name: '可靠待办列表 (reliableTodolist)', value: 'courses.zju/reliableTodolist.js' },
    { name: '下载课件 (materialDown)', value: 'courses.zju/materialDown.js' },
    { name: '增量下载课件 (materialMaintainer)', value: 'courses.zju/materialMaintainer.js' },
    { name: '初始化课件配置 (materialMaintainer_init)', value: 'courses.zju/materialMaintainer_init.js' },
    { name: '自动签到 (autosign)', value: 'courses.zju/autosign.js' },
    { name: '测验答案 (quizanswer)', value: 'courses.zju/quizanswer.js' },
    { name: '观看视频 (watchVideo)', value: 'courses.zju/watchVideo.js' },
    { name: '查看作业和考试分数 (scores)', value: 'courses.zju/scores.js' },
  ],
  '智云课堂': [
    { name: '生成课程 Markdown (generateCourseMd)', value: 'classroom.zju/generateCourseMd.js' },
    { name: '获取视频链接 (getVideoURL)', value: 'classroom.zju/getVideoURL.js' },
  ],
  '图书馆': [
    { name: '查询已借阅图书并续借 (bookList)', value: 'lib.zju/bookList.js' },
  ],
  'Webplus': [
    { name: '保存通知及附件 (saveDoc)', value: 'webplus.zju/saveDoc.js' },
  ],
  '钉钉机器人': [
    { name: '发送消息', value: '__dingtalk_send__' },
    { name: '测试连接', value: '__dingtalk_test__' },
  ],
};

function runScript(scriptPath) {
  return new Promise((resolve) => {
    const child = fork(path.join(projectRoot, scriptPath), [], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.log(`\n\x1b[31mScript exited with error, exit code: ${code}\x1b[0m`);
      }
      resolve();
    });
  });
}

async function main() {
  while (true) {
    const { category } = await inquirer.prompt([
      {
        type: 'list',
        name: 'category',
        message: '请选择分类:',
        choices: [...Object.keys(categories), new inquirer.Separator(), '退出'],
        pageSize: 10,
      },
    ]);

    if (category === '退出') break;

    const scripts = categories[category];
    if (!scripts) break;

    // Sub-menu loop
    let stayInSubmenu = true;
    while (stayInSubmenu) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: `${category} >`,
          choices: [
            { name: '← 返回上级', value: BACK },
            new inquirer.Separator(),
            ...scripts,
          ],
          pageSize: 12,
        },
      ]);

      if (action === BACK) break;

      // DingTalk built-in actions
      if (action === '__dingtalk_send__') {
        const { msg } = await inquirer.prompt([
          { type: 'input', name: 'msg', message: '输入要发送的消息:' },
        ]);
        if (msg.trim()) {
          await dingTalk(msg.trim());
          console.log('\x1b[32m已发送\x1b[0m');
        }
        continue;
      }
      if (action === '__dingtalk_test__') {
        await dingTalk('[DingTalk] 连接测试成功！');
        console.log('\x1b[32m测试消息已发送\x1b[0m');
        continue;
      }

      // Run script, then return to sub-menu
      console.log(`\x1b[32mStarting ${action}...\x1b[0m`);
      await runScript(action);
      console.log('\n\x1b[2m按回车返回菜单...\x1b[0m');
    }
  }
}

main().catch((err) => {
  console.error('An error occurred:', err);
  process.exit(1);
});
