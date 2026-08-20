import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DockerfileParser } from "dockerfile-ast";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const fromRoot = (path: string) => readFile(resolve(process.cwd(), path), "utf8");

type ComposeService = {
  build?: { context?: string; target?: string };
  image?: string;
  options?: string;
  command?: string | string[];
  profiles?: string[];
  depends_on?: Record<string, { condition?: string }>;
  healthcheck?: { test?: string | string[] };
  volumes?: string[];
};

describe("deployment configuration", () => {
  it("builds a locked, multi-stage standalone image and runs it as non-root", async () => {
    const source = await fromRoot("Dockerfile");
    const dockerfile = DockerfileParser.parse(source);
    const froms = dockerfile.getFROMs();
    const instructions = dockerfile.getInstructions();
    const values = instructions.map((instruction) => ({
      keyword: instruction.getKeyword(),
      value: instruction.getArgumentsContent() ?? "",
    }));

    expect(froms.length).toBeGreaterThanOrEqual(4);
    expect(froms.every((instruction) => !instruction.getArgumentsContent()?.includes(":latest"))).toBe(true);
    expect(values).toContainEqual(expect.objectContaining({
      keyword: "RUN",
      value: expect.stringContaining("pnpm install --frozen-lockfile"),
    }));
    expect(values).toContainEqual(expect.objectContaining({
      keyword: "COPY",
      value: expect.stringContaining(".next/standalone"),
    }));
    expect(values).toContainEqual(expect.objectContaining({
      keyword: "COPY",
      value: expect.stringContaining(".next/static"),
    }));
    expect(values).toContainEqual(expect.objectContaining({
      keyword: "USER",
      value: expect.not.stringMatching(/^(root|0)$/),
    }));
    expect(dockerfile.getHEALTHCHECKs()).toHaveLength(1);
    expect(dockerfile.getCMDs().at(-1)?.getArgumentsContent()).toContain("server.js");
  });

  it("waits for PostgreSQL and a one-shot migration before accepting app traffic", async () => {
    const compose = parseYaml(await fromRoot("docker-compose.yml")) as {
      services: Record<string, ComposeService>;
      volumes: Record<string, unknown>;
    };
    const { app, db, migrate } = compose.services;

    expect(db.image).toMatch(/^postgres:(1[6-9]|[2-9]\d)(?:\.|-|$)/);
    expect(db.healthcheck?.test).toBeDefined();
    expect(db.volumes).toContain("postgres_data:/var/lib/postgresql/data");
    expect(compose.volumes).toHaveProperty("postgres_data");
    expect(migrate.command).toEqual([
      "node_modules/.bin/prisma",
      "migrate",
      "deploy",
      "--config",
      "prisma.config.ts",
    ]);
    expect(migrate.depends_on?.db?.condition).toBe("service_healthy");
    expect(app.depends_on?.migrate?.condition).toBe("service_completed_successfully");
    expect(JSON.stringify(app.command ?? "")).not.toMatch(/seed|import/i);
  });

  it("runs Railway migrations before start and checks the database-backed health route", async () => {
    const railway = parseToml(await fromRoot("railway.toml")) as {
      build: { builder: string; dockerfilePath: string };
      deploy: {
        preDeployCommand: string[];
        startCommand: string;
        healthcheckPath: string;
        restartPolicyType: string;
      };
    };

    expect(railway.build).toEqual(expect.objectContaining({
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    }));
    expect(railway.deploy.preDeployCommand).toEqual([
      "/opt/migrate/node_modules/.bin/prisma migrate deploy --config /opt/migrate/prisma.config.ts",
    ]);
    expect(railway.deploy.startCommand).toContain("server.js");
    expect(railway.deploy.healthcheckPath).toBe("/api/health");
    expect(railway.deploy.restartPolicyType).toBe("ON_FAILURE");
  });

  it("uses a frozen toolchain and migrates the CI database before checks", async () => {
    const workflow = parseYaml(await fromRoot(".github/workflows/ci.yml")) as {
      jobs: {
        verify: {
          services: { postgres: ComposeService };
          steps: Array<{ name?: string; uses?: string; with?: Record<string, unknown>; run?: string }>;
        };
      };
    };
    const verify = workflow.jobs.verify;
    const commands = verify.steps.flatMap((step) => step.run ? [step.run] : []);
    const installIndex = commands.findIndex((command) => command.includes("pnpm install --frozen-lockfile"));
    const generateIndex = commands.findIndex((command) => command.trim() === "pnpm db:generate");
    const validateIndex = commands.findIndex((command) => command.trim() === "pnpm prisma validate");
    const migrationIndex = commands.findIndex((command) => command.includes("prisma migrate deploy"));
    const typecheckIndex = commands.findIndex((command) => command.trim() === "pnpm typecheck");
    const testIndex = commands.findIndex((command) => command.trim() === "pnpm test");
    const buildIndex = commands.findIndex((command) => command.trim() === "pnpm build");

    expect(verify.services.postgres.image).toMatch(/^postgres:16(?:\.|-|$)/);
    expect(verify.services.postgres.options).toContain("--health-cmd");
    expect(verify.steps).toContainEqual(expect.objectContaining({
      uses: "pnpm/action-setup@v4",
      with: expect.objectContaining({ version: "11.21.0" }),
    }));
    expect(verify.steps).toContainEqual(expect.objectContaining({
      uses: "actions/setup-node@v4",
      with: expect.objectContaining({ "node-version": "24.15.0", cache: "pnpm" }),
    }));
    expect(commands).toContain("pnpm install --frozen-lockfile");
    expect(generateIndex).toBeGreaterThan(installIndex);
    expect(validateIndex).toBeGreaterThan(generateIndex);
    expect(typecheckIndex).toBeGreaterThan(generateIndex);
    expect(buildIndex).toBeGreaterThan(generateIndex);
    expect(migrationIndex).toBeGreaterThan(-1);
    expect(testIndex).toBeGreaterThan(migrationIndex);
    expect(commands).toEqual(expect.arrayContaining([
      "pnpm prisma validate",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
    ]));
  });

  it("ignores every local environment override and TypeScript build cache but keeps templates", () => {
    const candidates = [
      ".env",
      ".env.production",
      ".env.test",
      ".env.staging",
      ".env.example",
      "deploy/intranet/.env.example",
      ".tools/railway/railway.exe",
      "tsconfig.tsbuildinfo",
    ];
    const ignored = execFileSync(
      "git",
      ["check-ignore", "--no-index", "--stdin"],
      { cwd: process.cwd(), encoding: "utf8", input: candidates.join("\n") },
    ).trim().split(/\r?\n/);

    expect(ignored).toEqual([
      ".env",
      ".env.production",
      ".env.test",
      ".env.staging",
      ".tools/railway/railway.exe",
      "tsconfig.tsbuildinfo",
    ]);
  });

  it("documents publishing the feature through main before Railway tracks main", async () => {
    const guide = await fromRoot("deploy/railway/README.md");
    const pushFeature = guide.indexOf("git push -u origin feature/90-day-growth-tracking");
    const openPullRequest = guide.indexOf("Pull Request");
    const switchMain = guide.indexOf("git switch main");
    const pullMain = guide.indexOf("git pull --ff-only origin main");
    const railwayMain = guide.indexOf("--repo OWNER/PRIVATE_REPOSITORY --branch main");

    expect(pushFeature).toBeGreaterThan(-1);
    expect(openPullRequest).toBeGreaterThan(pushFeature);
    expect(switchMain).toBeGreaterThan(openPullRequest);
    expect(pullMain).toBeGreaterThan(switchMain);
    expect(railwayMain).toBeGreaterThan(pullMain);
  });

  it("generates the untracked Prisma Client before Railway maintenance commands", async () => {
    const guide = await fromRoot("deploy/railway/README.md");
    const install = guide.indexOf("pnpm install --frozen-lockfile");
    const generate = guide.indexOf("pnpm db:generate", install);
    const seed = guide.indexOf("pnpm db:seed", install);
    const previewImport = guide.indexOf("pnpm import:training-plan --preview", install);

    expect(install).toBeGreaterThan(-1);
    expect(generate).toBeGreaterThan(install);
    expect(seed).toBeGreaterThan(generate);
    expect(previewImport).toBeGreaterThan(generate);
  });

  it("runs backup and restore tools with the database container's configured identity", async () => {
    const guide = await fromRoot("deploy/intranet/README.md");
    const operations = guide.slice(
      guide.indexOf("## 5. 备份、恢复与恢复演练"),
      guide.indexOf("## 6. 升级与回滚"),
    );

    expect(operations).toContain("sh -lc");
    expect(operations).toContain('pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"');
    expect(operations).toContain('createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" growth_tracking_restore_drill');
    expect(operations).toContain('pg_restore -U "$POSTGRES_USER" -d growth_tracking_restore_drill');
    expect(operations).toContain('psql -U "$POSTGRES_USER" -d growth_tracking_restore_drill');
    expect(operations).toContain('dropdb -U "$POSTGRES_USER" growth_tracking_restore_drill');
    expect(operations).not.toMatch(/(?:-U|-O)\s+growth_app\b/);
    expect(operations).not.toMatch(/pg_dump[^\r\n]*\s-d\s+growth_tracking\b/);
  });

  it("keeps lint deterministic by excluding generated and project-local tool output", async () => {
    const eslintConfig = await fromRoot("eslint.config.mjs");

    expect(eslintConfig).toContain('".superpowers/**"');
    expect(eslintConfig).toContain('".playwright-cli/**"');
    expect(eslintConfig).toContain('"output/**"');
  });

  it("keeps Railway CLI outside Node dependencies and ships only a minimal migration workspace", async () => {
    const manifest = JSON.parse(await fromRoot("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const migrator = JSON.parse(await fromRoot("deploy/migrator/package.json")) as {
      name: string;
      dependencies: Record<string, string>;
    };
    const dockerfile = await fromRoot("Dockerfile");
    const railwayGuide = await fromRoot("deploy/railway/README.md");

    expect(manifest.dependencies).not.toHaveProperty("@railway/cli");
    expect(manifest.devDependencies).not.toHaveProperty("@railway/cli");
    expect(migrator.name).toBe("@growth-tracking/migrator");
    expect(Object.keys(migrator.dependencies).sort()).toEqual(["dotenv", "prisma"]);
    expect(dockerfile).toContain("pnpm --filter @growth-tracking/migrator deploy --prod /opt/migrate");
    expect(dockerfile).toContain("FROM node:24.15.0-alpine3.23 AS migrator");
    expect(dockerfile).not.toContain("FROM migration-deps AS migrator");
    expect(dockerfile).not.toMatch(/COPY --from=deps[^\r\n]*\/app\/node_modules/);
    expect(railwayGuide).toContain(".tools\\railway\\railway.exe");
    expect(railwayGuide).not.toContain("pnpm exec railway");
  });

  it("keeps the migrator manifest inside the real Docker build context", async () => {
    const dockerignore = (await fromRoot(".dockerignore")).split(/\r?\n/).map((line) => line.trim());
    const dockerfile = await fromRoot("Dockerfile");

    expect(dockerignore).not.toContain("deploy");
    expect(dockerignore).not.toContain("deploy/");
    expect(dockerignore).toContain(".tools");
    expect(dockerfile).toContain("COPY deploy/migrator/package.json ./deploy/migrator/package.json");
  });

  it("omits root test-runner configs when their imported test tree is outside the Docker context", async () => {
    const dockerignore = (await fromRoot(".dockerignore")).split(/\r?\n/).map((line) => line.trim());

    expect(dockerignore).toContain("tests");
    expect(dockerignore).toContain("playwright.config.ts");
    expect(dockerignore).toContain("vitest.config.ts");
  });

  it("uses a profiled full-source ops image for seed and import without expanding migrator or Railway", async () => {
    const dockerfile = await fromRoot("Dockerfile");
    const compose = parseYaml(await fromRoot("docker-compose.yml")) as {
      services: Record<string, ComposeService>;
    };
    const guide = await fromRoot("deploy/intranet/README.md");
    const ops = compose.services.ops;
    const migratorSection = dockerfile.slice(
      dockerfile.indexOf("FROM node:24.15.0-alpine3.23 AS migrator"),
      dockerfile.indexOf("FROM node:24.15.0-alpine3.23 AS runner"),
    );

    expect(dockerfile).toContain("FROM deps AS ops");
    expect(dockerfile).toMatch(/FROM deps AS ops[\s\S]*COPY \. \.[\s\S]*RUN pnpm db:generate/);
    expect(dockerfile).not.toMatch(/FROM node:24\.15\.0-alpine3\.23 AS migrator[\s\S]*COPY --from=ops/);
    expect(dockerfile).not.toMatch(/FROM runner AS railway[\s\S]*COPY --from=ops/);
    expect(migratorSection).not.toMatch(/COPY (?:src|scripts|data)(?:\/|\s)/);
    expect(migratorSection).not.toMatch(/(?:db:seed|import:training-plan|tsx)/);
    expect(ops.build).toEqual({ context: ".", target: "ops" });
    expect(ops.profiles).toEqual(["ops"]);
    expect(ops.depends_on?.db?.condition).toBe("service_healthy");
    expect(ops.depends_on?.migrate?.condition).toBe("service_completed_successfully");
    expect(guide).toMatch(/run --rm[\s\S]{0,160}\bops pnpm db:seed/);
    expect(guide).toMatch(/run --rm ops[\s\S]{0,80}pnpm import:training-plan --preview/);
    expect(guide).not.toMatch(/run --rm[^\r\n]*migrate[^\r\n]*(?:db:seed|import:training-plan)/);
  });
});
