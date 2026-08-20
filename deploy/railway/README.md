# Railway 部署手册（用户授权后执行）

本仓库已包含 `railway.toml`、Dockerfile 和数据库健康路由。Railway CLI 使用放在 Git 忽略目录中的官方预编译程序，不进入 Node 依赖、锁文件或容器。**本次交付没有执行** `railway login/init/link/add/up/domain`，没有创建项目、数据库、公开域名或 GitHub 仓库；以下都是交接给仓库/账号所有者的命令。

Railway 使用 Dockerfile 最终 `railway` 阶段。发布前在临时容器运行 `/opt/migrate/.../prisma migrate deploy`，迁移成功后才启动 `node server.js`；`/api/health` 检查数据库连接，失败部署按配置重试。官方配置字段见 [Config as Code](https://docs.railway.com/config-as-code) 和 [Dockerfiles](https://docs.railway.com/builds/dockerfiles)。

## 1. 私有 GitHub

工作簿含内部链接，只允许私有仓库。推送前：

```powershell
git status --short
git diff --check
git grep -n -I -E "(AUTH_SECRET|DATABASE_URL|RAILWAY_TOKEN)=.+" -- . ":(exclude,glob)**/.env.example"
git log --oneline --decorate -15
git remote -v
```

在 GitHub UI 创建空的 **Private** repository，启用分支保护和 CI 必过；由所有者确认目标后再执行：

```powershell
git remote add origin git@github.com:OWNER/PRIVATE_REPOSITORY.git
git push -u origin feature/90-day-growth-tracking
```

随后在 GitHub 创建 Pull Request，等待 CI 通过并完成审查后合并到 `main`。首次发布前让本地 `main` 与远端已合并版本保持一致：

```powershell
git switch main
git pull --ff-only origin main
```

Railway 的 GitHub source 监听下文配置的 `main`；不要让生产服务直接跟踪尚未审查的 feature 分支。

不要把仓库改为 public；如需演示，先移除/替换内部工作簿并做历史清理审查。

## 2. 登录、项目与 PostgreSQL

先从 Railway 官方 GitHub Releases 下载适合当前操作系统/架构的预编译 CLI。Windows x64 可把版本固定为 `v5.41.2`；`railway-v5.41.2-x86_64-pc-windows-msvc.zip` 在官方发布页记录的 SHA-256 是 `37c7898834b6a5097fdd446d6d569624fef612ee7a9fb013c3ee266e6288ebff`，校验后解压到 `.tools\railway\railway.exe`。macOS/Linux 则下载对应的 Apple Darwin 或 unknown-linux-gnu 包，按该资产发布摘要校验，放在项目内 `.tools/railway/` 并赋予执行权限。版本升级必须重新核对官方发布页、摘要和本手册命令，不能把 `@railway/cli` 加回 `package.json`。

Windows PowerShell 下始终通过明确路径调用：

```powershell
pnpm install --frozen-lockfile
$railway = Join-Path (Get-Location) ".tools\railway\railway.exe"
& $railway --version
& $railway login
& $railway init --name growth-tracking
& $railway add --database postgres
& $railway add --service growth-tracking-web
```

也可在 Railway Dashboard 创建空项目、PostgreSQL 和 Web Service，再用 `& $railway link --project <PROJECT_ID> --environment production --service growth-tracking-web` 关联。不要在无法核对账号/工作区时使用自动默认值。

## 3. 变量与 GitHub source

给 Web Service 设置 PostgreSQL 引用变量；`Postgres` 必须与 Railway 数据库服务名完全一致：

```powershell
'${{Postgres.DATABASE_URL}}' | & $railway variable set DATABASE_URL --stdin `
  --service growth-tracking-web --skip-deploys
$authSecret = Read-Host "输入随机 AUTH_SECRET"
$authSecret | & $railway variable set AUTH_SECRET --stdin `
  --service growth-tracking-web --skip-deploys
& $railway variable set AUTH_TRUST_HOST=true `
  --service growth-tracking-web --skip-deploys
```

不要运行会显示原值的 `variable list --kv/--json` 并分享输出。连接私有 GitHub 的推荐方式是 Dashboard 的 Connect Repo；也可在已授权后：

```powershell
& $railway service source connect `
  --repo OWNER/PRIVATE_REPOSITORY --branch main `
  --service growth-tracking-web
```

Railway 的引用变量语法见 [Variables reference](https://docs.railway.com/variables/reference)。

## 4. 首次部署、健康与域名

从本地明确上传（或等待 GitHub source 自动部署）：

```powershell
& $railway up --service growth-tracking-web --environment production
& $railway logs --service growth-tracking-web --environment production
& $railway domain --service growth-tracking-web
```

`domain` 会创建 Railway 提供的域名；生成后设置 `AUTH_URL=https://实际域名` 并重新部署。访问 `https://实际域名/api/health`，必须是 200/connected。端口由 Railway `PORT` 注入，standalone server 绑定 `0.0.0.0`。

## 5. 初始管理员与 Excel

`railway run` 在本机执行项目命令并注入目标服务变量；它可能接触生产密钥，确认服务和环境后再运行。fresh clone 中 `src/generated/prisma` 未被 Git 跟踪，因此完成 `pnpm install --frozen-lockfile`、服务关联和变量设置后，必须先生成一次本地 Prisma Client：

```powershell
& $railway run --service growth-tracking-web --environment production -- pnpm db:generate
```

生成成功后再执行 seed/import：

```powershell
$env:SEED_ADMIN_USERNAME = "管理员工号"
$env:SEED_ADMIN_PASSWORD = "至少12位独立高强度密码"
& $railway run --service growth-tracking-web --environment production -- pnpm db:seed
Remove-Item Env:SEED_ADMIN_PASSWORD

& $railway run --service growth-tracking-web --environment production -- `
  pnpm import:training-plan --preview
```

推荐登录 `/admin/import` 完成最终应用。若命令行应用，使用 `--apply --actor "ADMIN_USER_DATABASE_ID"`；先保存 preview 输出中的计数，确认 90/80/23 与五维度验收。

## 6. 备份、升级与回滚

启用 Railway PostgreSQL 的可用备份/PITR 能力，并按公司策略将经过恢复验证的加密备份保存到独立位置。每次部署前记录数据库备份点和 Git SHA；观察健康、应用日志与迁移日志后再扩大使用。

失败部署优先在 Railway Dashboard 回滚到上一镜像。数据库迁移不自动回滚：只有 schema 向后兼容时才可只回退应用；否则维护窗口内恢复升级前数据库备份，并部署匹配旧 SHA。不要把 `prisma migrate reset` 用于生产。

## 7. 排障

- Build 找不到 standalone：确认 `next.config.ts` 的 `output: "standalone"` 和 Docker builder 日志。
- Pre-deploy 失败：不会切换新流量；检查 PostgreSQL 引用变量和迁移日志，不要跳过迁移强制启动。
- Healthcheck 503：数据库不可达或迁移/凭据异常；路由不会暴露异常细节。
- 域名可开但登录失败：设置准确 HTTPS `AUTH_URL`、`AUTH_TRUST_HOST=true` 后重部署。
- GitHub 自动部署不触发：确认 private repo 授权、source 分支与 branch protection。
- 需要支持时先去除日志中的 URL、token、cookie、工号和姓名。

官方依据：[Railway healthchecks](https://docs.railway.com/deployments/healthchecks)、[Build and start commands](https://docs.railway.com/builds/build-and-start-commands)、[Railway CLI](https://docs.railway.com/guides/cli)、[Railway CLI Releases](https://github.com/railwayapp/cli/releases)、[GitHub private repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)。
