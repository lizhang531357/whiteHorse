# 白马AI

前端 React（Vite）+ 后端 Node（`server.js`）+ SQLite 的 AI 聊天应用。

## 启动

```bash
yarn install
yarn start      # 同时起前端 3000 和后端 3001
```

打开 http://localhost:3000 → 注册/登录 → 在「我的 → 系统配置」填 API Key。

> 只在一个终端启动，别重复跑 `yarn start`，否则端口会被占用。

## 目录结构

```
ai-react/
├── index.html              入口 HTML
├── vite.config.js          开发服务器 + /api 代理 + 打包分包
├── start.sh                一键同时启动前后端
├── server.js               后端入口：路由、登录鉴权、聊天流式、附件解析、SSRF 防护
├── server/
│   ├── db.js               SQLite 建表与数据读写（用户/会话/设置）
│   └── auth.js             密码哈希、session、cookie
├── data/baima.db           SQLite 数据库文件（自动创建，已 gitignore）
├── public/logo.svg         品牌图标
├── .env                    只放 BASE_URL / MODEL（API Key 改为页面配置）
└── src/
    ├── main.jsx            React 挂载入口
    ├── App.jsx             登录门禁 + Provider 组装
    ├── constants.js        默认系统提示、模型预设、默认设置
    ├── context/
    │   ├── AuthContext.jsx 登录状态
    │   └── ChatContext.jsx 会话/设置/主题/发送流的统一状态
    ├── hooks/
    │   ├── useAuth.js          登录、注册、退出、改资料
    │   ├── useConversations.js 会话 CRUD + 云端同步 + 本地缓存
    │   ├── useSettings.js      模型/温度/提示词/API Key
    │   ├── useTheme.js         深色模式
    │   ├── useSpeech.js        语音输入
    │   └── useMediaQuery.js    移动端判断
    ├── components/
    │   ├── AppLayout/          侧边栏 + 顶栏布局
    │   ├── LoginPage/          登录/注册
    │   ├── ConversationList/   会话列表
    │   ├── Composer/           输入框、附件、拖拽/粘贴、语音
    │   ├── MessageItem/        单条消息与操作
    │   ├── MarkdownRenderer/   Markdown + 代码高亮
    │   └── UserModal/          我的：个人信息 / 系统配置
    ├── pages/chat/             聊天页
    ├── router/                 路由
    ├── styles/                 全局样式与主题变量
    └── utils/                  api/storage/stream/file/image/export 等工具
```

## 已支持功能

- **账号**：注册、登录、退出、改资料；密码 scrypt 哈希、httpOnly cookie 会话、按用户隔离数据
- **会话**：新建、切换、重命名、删除、自动标题；存 SQLite，刷新/换天/换设备登录可恢复
- **聊天**：多轮上下文、流式输出、停止生成、错误重试
- **渲染**：Markdown（表格/列表/引用）、代码高亮、一键复制代码
- **附件**：文本/PDF/Word/图片上传、网页链接抓取、拖拽/粘贴上传、图片缩略图预览
- **消息操作**：复制、编辑后重发、重新生成、删除
- **配置**（我的 → 系统配置）：模型、API Key、温度、系统提示词、浅色/深色主题
- **模型能力**：reasoner 思考过程展示
- **其它**：语音输入、导出 Markdown、移动端抽屉布局
- **安全**：SSRF 防护（重定向逐跳校验 + DNS 内网校验）
