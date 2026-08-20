import { describe, expect, it, vi } from "vitest";

import { runE2EDatabaseLifecycle } from "../../../tests/e2e/fixtures/database-safety";

describe("Task 13 database lifecycle", () => {
  it("cleans partial data when setup fails before the browser test starts", async () => {
    let dirty = false;
    const setup = vi.fn(async () => {
      dirty = true;
      throw new Error("forced workbook setup failure");
    });
    const use = vi.fn(async () => undefined);
    const cleanup = vi.fn(async () => {
      dirty = false;
    });

    await expect(runE2EDatabaseLifecycle(setup, use, cleanup)).rejects.toThrow(
      "forced workbook setup failure",
    );
    expect(use).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(dirty).toBe(false);
  });

  it("cleans after a successful setup even when test use fails", async () => {
    const cleanup = vi.fn(async () => undefined);

    await expect(
      runE2EDatabaseLifecycle(
        async () => "seeded",
        async () => {
          throw new Error("forced browser failure");
        },
        cleanup,
      ),
    ).rejects.toThrow("forced browser failure");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
