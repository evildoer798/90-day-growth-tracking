# 机台集成团队新员工 90 天成长追踪系统

[![CI](https://github.com/evildoer798/90-day-growth-tracking/actions/workflows/ci.yml/badge.svg)](https://github.com/evildoer798/90-day-growth-tracking/actions/workflows/ci.yml)

一个中文优先的新员工培养协作系统，用来管理 90 天“学、练、干”任务、导师确认、双向留言、主管总览和管理员配置。系统采用 Next.js 模块化单体、Auth.js、Prisma 与 PostgreSQL，可在公司内网 Docker 环境或常规 Node.js 服务器部署。

当前需求基线见 [产品需求文档](docs/REQUIREMENTS.md)。该文档是业务范围、角色权限和验收规则的唯一当前来源。

## 已实现能力

- 新人在登录页使用工号、姓名和密码自助注册，也可由管理员创建账号。
- 所有新人均能查看 D1、D2、D3、D4、Dall 五个维度的全部启用任务；重点分组只影响标识和辅助统计。
- 新人可独立完成 Learn，并分别提交 Action、Drill；未提交的实践不会进入导师待确认队列。
- 导师只查看管理员分配给自己的新人，可确认其已提交的 Action/Drill，并写导师留言。
- 新人和导师可在同一任务中互相查看留言；确认和撤销确认均保留历史。
- 主管只读查看全部新人，支持按姓名或工号搜索，不承担导师确认或任务编辑职责。
- 管理员维护培养总天数、新人、账号、角色、导师关系、任务库、Excel 导入和审计日志。
- 管理员与主管新人列表均支持搜索；已完成任务使用独立完成状态和视觉层级。
- 数据写入采用服务端权限复核、输入校验、事务与审计，不依赖前端隐藏按钮保障安全。

## 角色权限

| 能力 | 新人 | 导师 | 主管 | 管理员 |
| --- | :---: | :---: | :---: | :---: |
| 查看新人 | 仅自己 | 仅分配对象 | 全部新人 | 全部新人 |
| Learn 完成/撤回 | 自己 | — | — | 可代操作 |
| 提交 Action/Drill | 自己 | — | — | 可代操作 |
| 确认 Action/Drill | — | 分配对象 | — | 全部新人 |
| 新人留言 | 自己 | 可查看 | 可查看 | 可查看 |
| 导师留言 | 可查看 | 分配对象 | 可查看 | 可写 |
| 搜索新人 | — | — | 姓名/工号 | 姓名/工号 |
| 人员、账号、关系、任务与导入 | — | — | — | 管理 |
| 审计日志 | — | — | — | 查看 |

新人角色与管理员、主管、导师角色互斥，避免一个账号同时拥有自助打卡与管理权限。多角色员工账号可在其非新人角色之间切换视角。

## 核心流程

```text
管理员导入任务并分配导师
        ↓
新人查看全部任务，完成 Learn
        ↓
新人分别提交 Action / Drill
        ↓
仅负责该新人的导师收到对应待确认
        ↓
导师确认或撤销确认，双方可查看留言和确认历史
        ↓
主管按姓名/工号查看所有新人的整体进度
```

## 技术栈

- Node.js 24.15.0、pnpm 11.21.0
- Next.js 16 App Router、React 19、严格 TypeScript
- Auth.js 5、bcrypt、Zod、React Hook Form
- Prisma 7、PostgreSQL 16+
- Tailwind CSS、Radix UI、Lucide React、Recharts
- Vitest、Testing Library、Playwright
- Docker Compose、GitHub Actions、Railway 配置

## 项目结构

```text
src/app/                 路由、页面和 API
src/config/              标题、角色、菜单、规则、主题和文案
src/domain/              日期、进度、权限和导入等纯业务逻辑
src/server/              数据库、鉴权、repository、service、action、审计
src/features/            登录、新人、导师、主管、管理员和导入界面
prisma/                  数据模型、迁移与管理员种子
data/imports/            本地私有工作簿说明（.xlsx 被 Git 忽略）
tests/                   单元、集成与端到端测试
deploy/intranet/         Docker 内网部署手册
deploy/railway/          Railway 部署手册
docs/REQUIREMENTS.md     当前产品需求与验收标准
docs/CUSTOMIZATION.md    定制入口与修改边界
```

## 本地启动

### 1. 准备环境

需要 Node.js `24.15.0`、Corepack、pnpm `11.21.0` 和 PostgreSQL 16+。

```powershell
corepack enable
corepack prepare pnpm@11.21.0 --activate
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

编辑 `.env`，至少设置：

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/growth_tracking?schema=public"
AUTH_SECRET="使用密码管理器生成的至少32字节随机值"
AUTH_URL="http://127.0.0.1:3000"
```

`.env` 已被 Git 忽略，禁止将真实连接串或密钥复制到文档、提交或工单。

### 2. 初始化数据库

```powershell
pnpm db:generate
pnpm db:migrate

$env:SEED_ADMIN_USERNAME = "管理员工号"
$env:SEED_ADMIN_PASSWORD = "至少12位的独立初始密码"
pnpm db:seed
Remove-Item Env:SEED_ADMIN_PASSWORD
```

`db:seed` 会创建四种角色，并创建或重置指定管理员；系统不内置生产账号或默认密码。自助注册依赖 TRAINEE 角色已经存在，因此新环境必须先执行一次 seed。

### 3. 导入 90 天任务

原始培养工作簿不进入 Git 仓库。将授权使用的文件放到 `data/imports/新人90天学习计划_网站导入版.xlsx`，再启动系统，由管理员在 `/admin/import` 上传、预览并确认。也可以使用命令行：

```powershell
pnpm import:training-plan --preview
pnpm import:training-plan --apply --actor "ADMIN_USER_DATABASE_ID"
```

必须先检查预览结果。应用导入需要数据库中的管理员 User ID，并会写入导入批次和审计日志。

### 4. 启动开发服务器

```powershell
pnpm dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。新注册账号默认使用 D1 重点分组、注册当天作为培养开始日期，管理员可随后在人员管理中调整。

## 验证

常规提交前检查：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm prisma validate
pnpm build
```

CI 会启动隔离 PostgreSQL 服务，执行依赖安装、Prisma Client 生成、全部迁移、Lint、类型检查、单元/集成测试和生产构建。

端到端测试带有强制数据库安全门禁，只接受 `127.0.0.1:55432/growth_tracking_task13_e2e` 这一专用本地测试库和显式清理授权。不要修改测试夹具去连接生产数据库：

```powershell
pnpm test:e2e
```

## 部署

- [Docker 内网部署与运维](deploy/intranet/README.md)：数据库、迁移、应用、管理员初始化、端口、备份、恢复和升级。
- [Railway 部署](deploy/railway/README.md)：私有 GitHub 仓库、PostgreSQL 引用变量、预部署迁移、健康检查和回滚。

生产环境必须使用 HTTPS 或受信内网；不要将 PostgreSQL 端口暴露到公网。健康检查为 `GET /api/health`，数据库可用时返回：

```json
{"status":"ok","database":"connected"}
```

## 数据与安全

- 本项目仓库保持私有；原始工作簿可能包含公司内部资料链接，`data/imports/*.xlsx` 已被 Git 忽略。
- 不提交 `.env*`、真实账号密码、数据库转储、备份、部署包、截图、测试产物和生成的 Prisma Client。
- 上传的 Excel 先执行 ZIP 结构、文件大小、行列数、单元格长度和业务字段校验；错误预览不能应用。
- 密码使用 bcrypt 哈希；会话与每个服务端写操作都检查账号启用状态和实时角色/关系。
- 导入、确认、关系和管理操作写入审计；生产备份必须进入独立受控存储并定期恢复演练。

## 文档

- [产品需求与验收标准](docs/REQUIREMENTS.md)
- [定制指南](docs/CUSTOMIZATION.md)
- [Docker 内网部署手册](deploy/intranet/README.md)
- [Railway 部署手册](deploy/railway/README.md)

本仓库为内部业务项目，当前未附加开源许可证；未经授权不得公开分发代码、工作簿或业务数据。
