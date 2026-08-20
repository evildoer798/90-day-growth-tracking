# 内网 Docker 部署与运维

本方案在同一 Compose 项目中运行 PostgreSQL 16、一次性迁移服务和非 root Next.js standalone 应用。启动顺序为：数据库健康 → `prisma migrate deploy` 成功退出 → 应用接收流量。Seed 与 Excel 导入只通过 `ops` profile 的临时完整工具镜像执行，不进入迁移或 Railway 运行镜像，也不会随重启自动执行。

> 2026-08-15 已在 Windows Docker Desktop 4.86.0（Linux/WSL 2 后端）完成真实验证：Compose 配置解析、runner/migrator/ops 镜像构建、PostgreSQL 健康等待、两条迁移、管理员 seed、90 天 Excel 预览与应用、应用健康检查和管理员浏览器登录均成功。不同目标服务器仍必须独立执行下文“上线前硬门禁”。

## 1. 服务器和密钥

安装 Docker Engine/Desktop 与 Compose v2，将私有仓库克隆到仅管理员可读目录。复制模板：

```powershell
Copy-Item deploy/intranet/.env.example .env.docker
```

填写 URL-safe 随机 `POSTGRES_PASSWORD`、至少 32 随机字节的 `AUTH_SECRET`。仅本机使用时保持 `APP_BIND_ADDRESS=127.0.0.1`。内网开放时改为：

```dotenv
APP_BIND_ADDRESS=0.0.0.0
APP_PORT=3000
AUTH_URL=http://192.168.10.25:3000
```

不要提交 `.env.docker`。数据库没有映射到宿主端口，只在 Compose 内部网络可达。

## 2. 上线前硬门禁

在目标 Docker 主机执行；任何一步失败都不要开放端口：

```powershell
docker version
docker compose version
docker compose --env-file .env.docker config --quiet
docker build --target runner -t growth-tracking:local .
docker compose --env-file .env.docker --profile ops build ops
docker compose --env-file .env.docker up -d db
docker compose --env-file .env.docker run --rm migrate
docker compose --env-file .env.docker up -d app
docker compose --env-file .env.docker ps
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

期望健康响应为 `{"status":"ok","database":"connected"}`。查看日志时避免复制环境变量：

```powershell
docker compose --env-file .env.docker logs --tail 100 migrate app
```

## 3. 初始管理员与 Excel

迁移成功后，手工 seed 一次。下面的变量只在该临时容器中存在；密码至少 12 位：

```powershell
$env:SEED_ADMIN_USERNAME = "管理员工号"
$env:SEED_ADMIN_PASSWORD = "独立的高强度初始密码"
docker compose --env-file .env.docker run --rm `
  -e SEED_ADMIN_USERNAME -e SEED_ADMIN_PASSWORD `
  ops pnpm db:seed
Remove-Item Env:SEED_ADMIN_PASSWORD
```

随后登录 `/admin/import` 做 Excel 预览和应用。也可在临时运维容器预览：

```powershell
docker compose --env-file .env.docker run --rm ops `
  pnpm import:training-plan --preview
```

应用时追加 `--apply --actor "ADMIN_USER_DATABASE_ID"`。不要把 seed/import 写入 `app` 的启动命令；重启不应重复导入。

## 4. 内网 IP、防火墙与访问

查找服务器 IPv4：

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "169.254*" }
```

Windows 管理员 PowerShell 仅对域/专用网络放行应用端口：

```powershell
New-NetFirewallRule -DisplayName "Growth Tracking 3000" `
  -Direction Inbound -Protocol TCP -LocalPort 3000 `
  -Action Allow -Profile Domain,Private
```

客户端访问 `http://服务器IPv4:3000`。若有反向代理，请让代理执行 TLS，并将 `AUTH_URL` 改为用户实际访问的 HTTPS 地址。不要开放 PostgreSQL 5432。

## 5. 备份、恢复与恢复演练

先建立被 Git 忽略且受限的 `backups/`，定期生成 PostgreSQL custom-format 备份：

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
docker compose --env-file .env.docker exec db sh -lc `
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/growth_tracking.dump'
docker compose --env-file .env.docker cp `
  db:/tmp/growth_tracking.dump "backups/growth_tracking-$stamp.dump"
docker compose --env-file .env.docker exec db rm /tmp/growth_tracking.dump
```

外层 PowerShell 单引号会把 `$POSTGRES_USER`/`$POSTGRES_DB` 原样交给容器，再由容器内 `sh -lc` 使用 `.env.docker` 的实际值；命令行不会展开或打印密码。将加密副本移到独立受控存储；备份只有通过恢复演练才可信。季度演练到固定名称的临时数据库，不覆盖生产；临时库 owner 仍使用容器配置的用户：

```powershell
$backup = "backups/growth_tracking-YYYYMMDD-HHMMSS.dump"
docker compose --env-file .env.docker cp $backup db:/tmp/restore-drill.dump
docker compose --env-file .env.docker exec db sh -lc `
  'createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" growth_tracking_restore_drill'
docker compose --env-file .env.docker exec db sh -lc `
  'pg_restore -U "$POSTGRES_USER" -d growth_tracking_restore_drill --exit-on-error /tmp/restore-drill.dump'
docker compose --env-file .env.docker exec db sh -lc `
  'psql -U "$POSTGRES_USER" -d growth_tracking_restore_drill -c "SELECT COUNT(*) FROM \"TrainingTask\";"'
docker compose --env-file .env.docker exec db sh -lc `
  'dropdb -U "$POSTGRES_USER" growth_tracking_restore_drill'
docker compose --env-file .env.docker exec db rm /tmp/restore-drill.dump
```

真实恢复前：停应用、备份当前库、验证目标文件、由两人复核数据库名，再执行 `pg_restore --clean --if-exists`。不要对未知库名运行清理恢复。

## 6. 升级与回滚

```powershell
git fetch --tags
git status --short
# 先完成备份与恢复抽查，再切换已审核版本
git switch --detach <reviewed-commit-or-tag>
docker compose --env-file .env.docker --profile ops build --pull app migrate ops
docker compose --env-file .env.docker run --rm migrate
docker compose --env-file .env.docker up -d app
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Prisma 生产迁移是向前执行，不提供自动 schema 回滚。应用回退只适用于数据库向后兼容；若迁移有破坏性变化，应停流量并从升级前备份恢复整个数据库，再启动匹配的旧应用版本。记录提交 SHA、迁移、备份文件和操作者。

## 7. 故障排查

- `db` 不健康：`docker compose ... logs db`，核对磁盘空间、卷权限和 `.env.docker`；不要删除卷尝试“修复”。
- `migrate` 失败：应用不会启动。查看迁移日志，修正后重新运行一次性服务；不要手改迁移历史表。
- `/api/health` 为 503：应用进程存活但数据库探针失败；检查内部网络、连接密码和数据库状态。响应不会给出连接详情。
- 登录循环/Host 错误：`AUTH_URL` 必须与浏览器实际地址一致，并保留 `AUTH_TRUST_HOST=true`。
- 手机横向滚动：清缓存后复现并记录页面/视口；不要用浏览器缩放掩盖布局问题。
- 磁盘增长：检查数据库卷、Docker build cache 和受控备份留存；先备份再清理，不执行 `docker compose down -v`。

官方依据：[Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)、[Compose services reference](https://docs.docker.com/reference/compose-file/services/)、[Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)。
