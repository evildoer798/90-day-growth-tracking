export const E2E_DATABASE_URL =
  "postgresql://postgres@127.0.0.1:55432/growth_tracking_task13_e2e?schema=public";
export const E2E_RESET_OPT_IN_ENV = "TASK13_E2E_RESET_OPT_IN";
export const E2E_RESET_OPT_IN = "ALLOW_DEDICATED_LOCAL_TASK13_E2E_RESET";

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

const unsafeDatabase = (reason: string): never => {
  throw new Error(`Task 13 E2E database safety check failed: ${reason}`);
};

const parseDatabaseUrl = (value: string | undefined): URL => {
  try {
    return new URL(value ?? "");
  } catch {
    return unsafeDatabase("DATABASE_URL is not a valid URL");
  }
};

export const assertE2EDatabaseSafety = (environment: DatabaseEnvironment): void => {
  if (environment[E2E_RESET_OPT_IN_ENV] !== E2E_RESET_OPT_IN) {
    unsafeDatabase("explicit reset opt-in is missing");
  }

  const databaseUrl = parseDatabaseUrl(environment.DATABASE_URL);

  if (databaseUrl.protocol !== "postgresql:") {
    unsafeDatabase("protocol is not the dedicated PostgreSQL protocol");
  }
  if (databaseUrl.hostname !== "127.0.0.1") {
    unsafeDatabase("host is not the exact dedicated loopback address");
  }
  if (databaseUrl.port !== "55432") {
    unsafeDatabase("port is not the dedicated project-local port");
  }
  if (databaseUrl.username !== "postgres" || databaseUrl.password !== "") {
    unsafeDatabase("credentials are not the expected passwordless local test user");
  }
  if (databaseUrl.pathname !== "/growth_tracking_task13_e2e") {
    unsafeDatabase("database name is not the exact dedicated E2E database");
  }
  if (databaseUrl.search !== "?schema=public") {
    unsafeDatabase("schema parameters are not exactly the public test schema");
  }
  if (databaseUrl.hash !== "") {
    unsafeDatabase("URL fragments are not allowed");
  }
};

export const runE2EDatabaseLifecycle = async <T>(
  setup: () => Promise<T>,
  use: (data: T) => Promise<void>,
  cleanup: () => Promise<void>,
): Promise<void> => {
  try {
    const data = await setup();
    await use(data);
  } finally {
    await cleanup();
  }
};
