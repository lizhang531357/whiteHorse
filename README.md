# 白马AI

前端 React + TypeScript（Vite）+ 后端 Node（`backend/server.js`）+ MySQL 的 AI 聊天应用。

## 启动

```bash
yarn install
yarn start      # 同时起前端 3000 和后端 3001
```

打开 http://localhost:3000 → 注册/登录 → 在「我的 → 模型管理」填 API Key。

> 需要 Node 20+ 和 MySQL 5.7/8.0。先在 `.env` 里配置好 `MYSQL_*`，数据库和表会自动创建。
> 只在一个终端启动，别重复跑 `yarn start`，否则端口会被占用。

开发相关：

- `yarn typecheck` 类型检查
- `yarn build` 先类型检查，再打包
- 前端统一使用 TypeScript + 箭头函数

## 手机 / 外网访问（Cloudflare Tunnel）

```bash
# 一条命令：构建 + 启动 3011 + 开启 Tunnel
yarn share
```

它会打印 `https://xxx.trycloudflare.com`，手机/别的电脑打开即可；`Ctrl+C` 会一起停掉服务端和 Tunnel。
数据仍存在同一个 MySQL 数据库里，账号通用。
注意：电脑关机/休眠会断；每次重启 Tunnel 地址会变；固定地址需要 Cloudflare 账号 + 域名。

`yarn share` 会把当前公网地址写入 `data/public-url.txt`。页面里的「分享访问链接」按钮
（登录页底部、聊天页右上角）会读取它，点击即可复制发人。没启动时按钮会提示先运行 `yarn share`。

`yarn share` 已经包含构建、3011 服务和 Tunnel，不需要再单独开命令。

## 可选配置

在 `.env` 里：

```
# 关闭注册（公网长期暴露时建议设为 false）
ALLOW_REGISTER=false

# API Key 加密密钥（不填会自动生成 data/.settings-key）
SETTINGS_SECRET=换成一段随机长字符串

# MySQL 连接
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的密码
MYSQL_DATABASE=whitehorse
```

备份数据库（需要本机安装 `mysqldump`）：

```bash
yarn backup   # 生成 backups/mysql-时间.sql、加密密钥和附件目录
```

恢复时执行 `mysql -u 用户名 -p 数据库名 < backups/mysql-时间.sql`，把 `.settings-key-*` 重命名为 `data/.settings-key`，把 `uploads-*` 目录放回 `data/uploads`；否则已保存的 API Key 无法解密、附件也会缺失。

## 找回密码 / 邮件（可选）

登录页「忘记密码？」支持邮箱验证码重置，验证码 10 分钟有效。

- **不配置 SMTP 也能用**：验证码会打印到启动服务（`yarn start` / `yarn share`）的终端。
- **配置 SMTP 后自动发邮件**：个人使用基本免费，QQ/163 邮箱需要在邮箱设置里开启 SMTP，并使用「授权码」而不是登录密码。

在 `.env` 里加：

```
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的邮箱@qq.com
SMTP_PASS=邮箱授权码
SMTP_FROM=你的邮箱@qq.com
```

如果用的是 587 端口，把 `SMTP_SECURE` 设为 `false`。

## 目录结构

```
whiteHorse/
├── index.html              入口 HTML
├── config/
│   ├── vite.config.js      开发服务器 + /api 代理 + 打包分包
│   └── theme.config.js     项目主题色（唯一配置源）
├── tsconfig.json           TypeScript 配置
├── backend/
│   ├── server.js           后端入口：路由、登录鉴权、聊天流式、附件解析、SSRF 防护
│   ├── db.js               MySQL 建表与数据读写（用户/会话/设置/附件/重置码）
│   ├── auth.js             密码哈希、session、cookie、重置验证码
│   ├── crypto.js           API Key 加解密（AES-256-GCM）
│   └── mailer.js           找回密码邮件发送（SMTP，可选）
├── scripts/
│   ├── dev.js              本地开发：同时启动前端 3000 + 后端 3001
│   ├── share.js            一条命令：构建 + 3011 服务 + Tunnel
│   ├── tunnel.js           开 Tunnel 并写入 data/public-url.txt
│   └── backup-db.js        备份 MySQL 数据库、加密密钥、附件目录
├── data/
│   ├── .settings-key       API Key 加密密钥（自动创建，已 gitignore）
│   └── uploads/            上传的原始附件（已 gitignore）
├── backups/                备份输出目录（已 gitignore）
├── public/logo.svg         品牌图标
├── .env                    MySQL 连接；可选 ALLOW_REGISTER / SETTINGS_SECRET / SMTP_*
└── src/
    ├── main.tsx            React 挂载入口
    ├── App.tsx             登录门禁 + Provider 组装
    ├── constants.ts        默认系统提示、默认设置
    ├── types.ts            共享 TypeScript 类型
    ├── vite-env.d.ts       Vite / CSS Module 类型声明
    ├── context/
    │   ├── AuthContext.tsx 登录状态
    │   └── ChatContext.tsx 会话/设置/主题/发送流/消息队列的统一状态
    ├── hooks/
    │   ├── useAuth.ts          登录、注册、退出、改资料
    │   ├── useConversations.ts 会话 CRUD + 云端同步 + 本地缓存
    │   ├── useSettings.ts      模型/BASE_URL/温度/提示词/API Key
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
    │   └── UserModal/          系统设置弹窗：通用 / 模型 / 数据 / 账号
    ├── pages/chat/             聊天页
    ├── router/                 路由
    ├── styles/                 全局样式与主题变量
    └── utils/                  api/storage/stream/file/image/export/event-bus 等工具
```

## 已支持功能

- **账号**：注册、登录、退出、改资料、登录后修改密码、邮箱验证码找回密码；密码 scrypt 哈希、httpOnly cookie 会话、按用户隔离数据
- **会话**：新建、切换、重命名、删除、自动标题；存 MySQL，刷新/换天/换设备登录可恢复
- **聊天**：多轮上下文、流式输出、停止生成、生成中发送自动排队（回答完成后依次发送）、错误重试
- **渲染**：Markdown（表格/列表/引用）、代码高亮、一键复制代码
- **附件**：文本/PDF/Word(docx)/图片上传、网页链接抓取、拖拽/粘贴上传、图片缩略图预览；旧版 `.doc`、Excel、PPT 会提示不支持
- **消息操作**：复制、编辑后重发（二次确认）、重新生成（保留后续消息）、删除
- **搜索**：按会话标题、消息内容、附件名搜索
- **通用设置**（我的 → 通用设置）：主题、温度、系统提示词
- **模型管理**（我的 → 模型管理）：自定义接口地址、模型列表（添加/选择/删除，最多 20 个）、API Key（眼睛查看、复制）；「测试连接」用当前选中的模型发一条最小请求验证「地址+密钥+模型」整体可用，失败时给出语义化提示（密钥无效/模型不可用/额度不足等）
- **数据管理**（我的 → 数据管理）：导出所有历史对话、删除所有对话
- **账号管理**（我的 → 账号管理）：用户名/邮箱行内编辑、修改密码、注销账号（二次确认，删除账号全部数据）
- **账号菜单**：左下角点击头像可选择「系统设置 / 退出账号」；聊天页未配置模型时提示一键跳转模型管理
- **用量**：每条回答显示输入/输出/总 token（依赖模型返回 usage）
- **原附件**：上传的原始文件保存到 `data/uploads`，可在消息里下载；备份会一起带上
- **模型能力**：reasoner 思考过程展示、首轮成功后用模型自动生成会话标题
- **分享**：登录页底部 / 聊天页右上角可复制当前公网访问地址
- **其它**：语音输入（浏览器支持时）、会话导出 Markdown、移动端抽屉布局、全局事件总线（`src/utils/event-bus`，基于 mitt）
- **安全**：SSRF 防护、密码哈希、API Key 加密存储、注册开关、接口限流
