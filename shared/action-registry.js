const actionCategories = [
  {
    id: "summary",
    name: "汇总",
    actions: [
      {
        id: "summary-full",
        aliases: ["full", "todo-full", "全量", "汇总"],
        name: "手动推送 - 全量汇总",
        description: "获取待办和图书馆借阅汇总。",
        type: "summary",
        urgentOnly: false,
        botRunnable: true,
      },
      {
        id: "summary-urgent",
        aliases: ["urgent", "todo-urgent", "紧急"],
        name: "手动推送 - 紧急汇总",
        description: "只获取即将到期的待办和图书。",
        type: "summary",
        urgentOnly: true,
        botRunnable: true,
      },
    ],
  },
  {
    id: "courses-zju",
    name: "学在浙大",
    actions: [
      {
        id: "todolist",
        aliases: ["todo"],
        name: "生成作业待办",
        script: "courses.zju/todolist.js",
        description: "调用 /api/todos 输出待办列表。",
        type: "script",
        botRunnable: true,
      },
      {
        id: "reliable-todolist",
        aliases: ["reliable-todo"],
        name: "可靠待办列表",
        script: "courses.zju/reliableTodolist.js",
        description: "遍历课程和 Pintia 获取更完整的待办。",
        type: "script",
        botRunnable: true,
      },
      {
        id: "material-down",
        aliases: ["materialDown"],
        name: "下载课件",
        script: "courses.zju/materialDown.js",
        description: "选择课程并下载全部课件。",
        type: "script",
        interactive: true,
        botRunnable: false,
      },
      {
        id: "material-maintainer",
        aliases: ["materialMaintainer"],
        name: "增量下载课件",
        script: "courses.zju/materialMaintainer.js",
        description: "基于 .cache.json 增量下载课程素材。",
        type: "script",
        interactive: true,
        botRunnable: false,
        usage: "zlb run material-maintainer path/to/.cache.json",
      },
      {
        id: "material-maintainer-init",
        aliases: ["materialMaintainer_init"],
        name: "初始化课件配置",
        script: "courses.zju/materialMaintainer_init.js",
        description: "为课件维护器生成 .cache.json。",
        type: "script",
        interactive: true,
        botRunnable: false,
      },
      {
        id: "autosign",
        aliases: ["auto-sign"],
        name: "自动签到",
        script: "courses.zju/autosign.js",
        description: "持续轮询并尝试处理签到。",
        type: "script",
        longRunning: true,
        botRunnable: false,
      },
      {
        id: "quizanswer",
        aliases: ["quiz-answer"],
        name: "测验答案",
        script: "courses.zju/quizanswer.js",
        description: "选择课程和互动测验并输出答案。",
        type: "script",
        interactive: true,
        botRunnable: false,
      },
      {
        id: "watch-video",
        aliases: ["watchVideo"],
        name: "观看视频",
        script: "courses.zju/watchVideo.js",
        description: "选择课程并标记可完成的学习活动。",
        type: "script",
        interactive: true,
        botRunnable: false,
      },
      {
        id: "scores",
        name: "查看作业和考试分数",
        script: "courses.zju/scores.js",
        description: "选择课程并输出作业/考试分数。",
        type: "script",
        interactive: true,
        botRunnable: false,
      },
    ],
  },
  {
    id: "classroom-zju",
    name: "智云课堂",
    actions: [
      {
        id: "generate-course-md",
        aliases: ["generateCourseMd"],
        name: "生成课程 Markdown",
        script: "classroom.zju/generateCourseMd.js",
        description: "选择智云课堂视频并导出字幕/PPT Markdown。",
        type: "script",
        interactive: true,
        botRunnable: false,
      },
      {
        id: "get-video-url",
        aliases: ["getVideoURL"],
        name: "获取视频链接",
        script: "classroom.zju/getVideoURL.js",
        description: "选择课程视频并输出播放地址。",
        type: "script",
        interactive: true,
        botRunnable: false,
      },
    ],
  },
  {
    id: "lib-zju",
    name: "图书馆",
    actions: [
      {
        id: "book-list",
        aliases: ["bookList", "books"],
        name: "查询已借阅图书并续借",
        script: "lib.zju/bookList.js",
        description: "查询借阅信息，并可在终端选择续借。",
        type: "script",
        interactive: true,
        botRunnable: false,
      },
    ],
  },
  {
    id: "zhihuishu",
    name: "智慧树/知到",
    actions: [
      {
        id: "zhihuishu-install",
        aliases: ["zhs-install"],
        name: "安装智慧树 Python 依赖",
        script: "zhihuishu/install.js",
        description: "创建 zhihuishu/.venv 并安装 Python 依赖。",
        type: "script",
        botRunnable: false,
      },
      {
        id: "zhihuishu-help",
        aliases: ["zhs-help"],
        name: "查看智慧树参数帮助",
        script: "zhihuishu/cli.js",
        args: ["--help"],
        description: "显示 fuckZHS main.py 支持的参数。",
        type: "script",
        botRunnable: true,
      },
      {
        id: "zhihuishu-fetch",
        aliases: ["zhs-fetch"],
        name: "拉取智慧树课程清单",
        script: "zhihuishu/cli.js",
        args: ["--fetch", "--show_in_terminal"],
        description: "登录智慧树并生成 zhihuishu/execution.json。",
        type: "script",
        botRunnable: true,
        botTimeoutMs: 0,
      },
      {
        id: "zhihuishu",
        aliases: ["zhs"],
        name: "执行智慧树工具",
        script: "zhihuishu/cli.js",
        description: "透传参数给 zhihuishu/main.py，例如 -c <courseId>。",
        type: "script",
        botRunnable: true,
        botTimeoutMs: 0,
        usage: "run zhihuishu [main.py args], e.g. run zhihuishu -c 114514 --show_in_terminal",
      },
    ],
  },
  {
    id: "webplus-zju",
    name: "Webplus",
    actions: [
      {
        id: "webplus-save-doc",
        aliases: ["saveDoc"],
        name: "保存通知及附件",
        script: "webplus.zju/saveDoc.js",
        description: "保存 Webplus 通知正文和附件。",
        type: "script",
        botRunnable: true,
        requiresArgs: true,
        usage: "run webplus-save-doc -u <url> [-o <dir>]",
      },
    ],
  },
  {
    id: "dingtalk",
    name: "钉钉机器人",
    actions: [
      {
        id: "dingtalk-test",
        aliases: ["test", "测试"],
        name: "测试连接",
        description: "发送一条钉钉测试消息。",
        type: "dingtalk-test",
        botRunnable: true,
      },
    ],
  },
];

const actionMap = new Map();

for (const category of actionCategories) {
  for (const action of category.actions) {
    action.category = category.name;
    actionMap.set(action.id.toLowerCase(), action);
    for (const alias of action.aliases || []) {
      actionMap.set(alias.toLowerCase(), action);
    }
  }
}

function getAction(id) {
  if (!id) return null;
  return actionMap.get(String(id).toLowerCase()) || null;
}

function getActionCategories() {
  return actionCategories;
}

function getActions() {
  return actionCategories.flatMap((category) => category.actions);
}

function formatActionList({ botOnly = false, terminalOnly = false } = {}) {
  const lines = [];
  for (const category of actionCategories) {
    const actions = category.actions.filter((action) => {
      if (botOnly) return action.botRunnable;
      if (terminalOnly) return !action.botRunnable;
      return true;
    });
    if (actions.length === 0) continue;
    lines.push(`${category.name}:`);
    for (const action of actions) {
      const botFlag = action.botRunnable ? "" : " (terminal only)";
      const usage = action.usage ? `; ${action.usage}` : "";
      lines.push(`- ${action.id}: ${action.name}${botFlag}${usage}`);
    }
  }
  return lines.join("\n");
}

export { formatActionList, getAction, getActionCategories, getActions };
