# 白马AI

前端 React + TypeScript（Vite）+ 后端 Node（`server.js`）+ SQLite 的 AI 聊天应用。

## 启动

```bash
yarn install
yarn start      # 同时起前端 3000 和后端 3001
```

打开 http://localhost:3000 → 注册/登录 → 在「我的 → 系统配置」填 API Key。

> 需要 Node 20+（`better-sqlite3` 11.x 适配 Node 20）。
> 只在一个终端启动，别重复跑 `yarn start`，否则端口会被占用。

开发相关：

- `yarn typecheck` 类型检查
- `yarn build` 先类型检查，再打包
- 前端统一使用 TypeScript + 箭头函数

## 手机 / 外网访问（Cloudflare Tunnel）

```bash
# 终端 1：构建并在 3011 端口提供页面 + API
yarn share

# 终端 2：生成一个临时公网地址
yarn tunnel
```

终端 2 会打印 `https://xxx.trycloudflare.com`，手机/别的电脑打开即可。
数据仍在本地 `data/baima.db`，账号通用。
注意：电脑关机/休眠会断；每次重启 Tunnel 地址会变；固定地址需要 Cloudflare 账号 + 域名。

## 可选配置

在 `.env` 里：

```
# 关闭注册（公网长期暴露时建议设为 false）
ALLOW_REGISTER=false

# API Key 加密密钥（不填会自动生成 data/.settings-key）
SETTINGS_SECRET=换成一段随机长字符串
```

备份数据库：

```bash
yarn backup   # 生成 backups/baima-时间.db、加密密钥和附件目录
```

恢复时把备份的 `.db` 放回 `data/baima.db`，把 `.settings-key-*` 重命名为 `data/.settings-key`，把 `uploads-*` 目录放回 `data/uploads`；否则已保存的 API Key 无法解密、附件也会缺失。

## 目录结构

```
whiteHorse/
├── index.html              入口 HTML
├── vite.config.js          开发服务器 + /api 代理 + 打包分包
├── tsconfig.json           TypeScript 配置
├── start.sh                一键同时启动前后端
├── server.js               后端入口：路由、登录鉴权、聊天流式、附件解析、SSRF 防护
├── server/
│   ├── db.js               SQLite 建表与数据读写（用户/会话/设置/附件）
│   ├── auth.js             密码哈希、session、cookie
│   └── crypto.js           API Key 加解密（AES-256-GCM）
├── scripts/
│   └── backup-db.js        备份数据库、加密密钥、附件目录
├── data/
│   ├── baima.db            SQLite 数据库（自动创建，已 gitignore）
│   └── uploads/            上传的原始附件（已 gitignore）
├── backups/                备份输出目录（已 gitignore）
├── public/logo.svg         品牌图标
├── .env                    BASE_URL / MODEL；可选 ALLOW_REGISTER / SETTINGS_SECRET（旧的 DEEPSEEK_API_KEY 已不再读取）
└── src/
    ├── main.tsx            React 挂载入口
    ├── App.tsx             登录门禁 + Provider 组装
    ├── constants.ts        默认系统提示、模型预设、默认设置
    ├── types.ts            共享 TypeScript 类型
    ├── vite-env.d.ts       Vite / CSS Module 类型声明
    ├── context/
    │   ├── AuthContext.tsx 登录状态
    │   └── ChatContext.tsx 会话/设置/主题/发送流的统一状态
    ├── hooks/
    │   ├── useAuth.ts          登录、注册、退出、改资料
    │   ├── useConversations.ts 会话 CRUD + 云端同步 + 本地缓存
    │   ├── useSettings.ts      模型/温度/提示词/API Key
    │   ├── useTheme.ts         深色模式
    │   ├── useSpeech.ts        语音输入
    │   └── useMediaQuery.ts    移动端判断
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
- **附件**：文本/PDF/Word(docx)/图片上传、网页链接抓取、拖拽/粘贴上传、图片缩略图预览；旧版 `.doc`、Excel、PPT 会提示不支持
- **消息操作**：复制、编辑后重发（二次确认）、重新生成、删除
- **搜索**：按会话标题、消息内容、附件名搜索
- **配置**（我的 → 系统配置）：模型、API Key、温度、系统提示词、浅色/深色主题
- **用量**：每条回答显示输入/输出/总 token（依赖模型返回 usage）
- **原附件**：上传的原始文件保存到 `data/uploads`，可在消息里下载；备份会一起带上
- **模型能力**：reasoner 思考过程展示、首轮成功后用模型自动生成会话标题
- **其它**：语音输入（浏览器支持时）、导出 Markdown / 导出账号数据 JSON、移动端抽屉布局
- **安全**：SSRF 防护、密码哈希、API Key 加密存储、注册开关、接口限流
