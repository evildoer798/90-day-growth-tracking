import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  E2E_RESET_OPT_IN,
  E2E_RESET_OPT_IN_ENV,
} from "./fixtures/database-safety";

const forwarded = process.argv.slice(2);
const args = forwarded[0] === "--" ? forwarded.slice(1) : forwarded;
const result = spawnSync(
  process.execPath,
  [resolve(process.cwd(), "node_modules/@playwright/test/cli.js"), "test", ...args],
  {
    env: {
      ...process.env,
      [E2E_RESET_OPT_IN_ENV]: E2E_RESET_OPT_IN,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
