# ZJU-live-better

A collection of useful scripts helping you live better in ZJU.

## 配置

创建文件`.env`，配置你的学号和密码

运行`npm install`安装依赖

如果你要使用 `courses.zju/reliableTodolist.js` 里的 Pintia 待办抓取，需要先在浏览器登录 Pintia，然后从 DevTools 中复制请求的 `Cookie` 头，配置到 `.env` 的 `PINTIA_COOKIE`。

使用时，在working dir下运行`node path/to/script`，其中`path/to/script`是指向脚本的路径，例如`classroom.zju/generateCourseMd`

也可以运行`npm link`将本项目链接到全局，然后可以直接在任意目录下运行`zlb`进入脚本选择。兼容别名 `zbl` 也指向同一个入口。

## 统一入口

`zlb` 现在同时负责脚本选择、daemon 管理和钉钉相关操作：

```bash
zlb menu              # 进入功能选择菜单
zlb tui               # 打开 daemon 管理 TUI
zlb start             # 后台启动 daemon
zlb stop              # 停止 daemon
zlb restart           # 重启 daemon
zlb status            # 查看 daemon 状态
zlb logs              # 追踪 daemon 日志
zlb actions           # 查看已登记功能
zlb run todolist      # 执行某个功能
zlb full              # 手动执行全量汇总并推送
zlb urgent            # 手动执行紧急汇总并推送
```

`./start.sh <command>` 保留为兼容入口，内部会转发到 `zlb` 的同一套 Node 实现。

## 钉钉 Bot 交互

原有 `DINGTALK_WEBHOOK` 仍用于主动推送。若要让钉钉机器人接收指令，需要让 daemon 暴露一个可被钉钉访问的 HTTP 回调：

```env
ENABLE_DINGTALK=true
DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=...
DINGTALK_SECRET=可选

ENABLE_DINGTALK_BOT=true
DINGTALK_BOT_HOST=0.0.0.0
DINGTALK_BOT_PORT=8787
DINGTALK_BOT_PATH=/dingtalk/callback
DINGTALK_BOT_TOKEN=自定义token
```

在钉钉开放平台/机器人配置中填写回调地址，例如：

```text
https://your-domain.example/dingtalk/callback?token=自定义token
```

支持的文本命令：

```text
help
status
full
urgent
actions
run todolist
run reliable-todolist
run webplus-save-doc -u https://example.zju.edu.cn/...
test
stop
```

目前无需终端输入的功能可以直接由 bot 后台执行；仍依赖 `inquirer` 多步选择的功能会在 bot 中提示为 terminal-only，需要后续继续拆成参数化或会话式交互。

## 功能列表

### 学在浙大相关（`courses.zju/`）

| 功能 | 说明 |
| --- | --- |
| `todolist` | 生成作业待办事项列表 |
| `materialDown` | 下载课程所有素材 |
| `materialMaintainer` | 可以基于配置文件增量下载课程素材 |

* \* 部分脚本未列出 \* * 

### 智云课堂相关（`classroom.zju/`）

| 功能 | 说明 |
| --- | --- |
| ☆`generateCourseMd` | 将智云课堂语音识别&PPT图片生成Markdown文件 |
| `getVideoURL` | 获取指定课程视频链接 |

### 图书馆相关（`lib.zju/`）

| 功能 | 说明 |
| --- | --- |
| ☆`bookList` | 查询已借阅图书并操作续借 |


## 反馈

反馈使用问题可以添加QQ群：1042563780

## 免责声明

本项目仅供学习交流使用，请勿用于任何商业用途，请勿用于任何非法或违规用途。使用本项目前请务必了解并遵守浙江大学相关政策和规定。作者不对因使用本项目而导致的任何后果负责。

## Star History

<a href="https://www.star-history.com/?repos=5dbwat4%2FZJU-live-better&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=5dbwat4/ZJU-live-better&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=5dbwat4/ZJU-live-better&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=5dbwat4/ZJU-live-better&type=date&legend=top-left" />
 </picture>
</a>
