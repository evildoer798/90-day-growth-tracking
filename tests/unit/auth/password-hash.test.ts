import { hash } from "bcryptjs";
import { describe, expect, it } from "vitest";

import {
  selectPasswordHashForVerification,
  verifyPassword,
} from "@/server/auth/password-hash";

describe("password hash verification selection", () => {
  it("uses a stored bcrypt hash only when its format and cost are supported", async () => {
    const supportedHash = await hash("supported-password", 12);

    expect(selectPasswordHashForVerification(supportedHash)).toEqual({
      hash: supportedHash,
      usesStoredHash: true,
    });
  });

  it("selects the same cost-12 dummy work for missing, malformed, and unsupported-cost hashes", async () => {
    const unsupportedCostHash = await hash("unsupported-password", 4);
    const selections = [
      selectPasswordHashForVerification(undefined),
      selectPasswordHashForVerification("not-a-valid-bcrypt-hash"),
      selectPasswordHashForVerification(unsupportedCostHash),
    ];

    expect(selections.map(({ usesStoredHash }) => usesStoredHash)).toEqual([
      false,
      false,
      false,
    ]);
    expect(new Set(selections.map(({ hash: selectedHash }) => selectedHash)).size).toBe(1);
    expect(selections[0]?.hash).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
  });

  it("executes dummy comparison work for malformed and unsupported-cost hashes", async () => {
    const unsupportedCostHash = await hash("unsupported-password", 4);
    const comparedHashes: string[] = [];
    const recordComparison = async (_password: string, selectedHash: string) => {
      comparedHashes.push(selectedHash);
      return true;
    };

    await expect(
      verifyPassword("provided-password", "malformed", recordComparison),
    ).resolves.toBe(false);
    await expect(
      verifyPassword("provided-password", unsupportedCostHash, recordComparison),
    ).resolves.toBe(false);

    expect(comparedHashes).toHaveLength(2);
    expect(comparedHashes[0]).toBe(comparedHashes[1]);
    expect(comparedHashes[0]).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
  });

  it("falls back to dummy work when bcrypt rejects a supported-shape hash", async () => {
    const supportedShapeHash = await hash("stored-password", 12);
    const comparedHashes: string[] = [];
    const rejectStoredHash = async (_password: string, selectedHash: string) => {
      comparedHashes.push(selectedHash);
      if (selectedHash === supportedShapeHash) {
        throw new Error("stored hash rejected");
      }
      return false;
    };

    await expect(
      verifyPassword("provided-password", supportedShapeHash, rejectStoredHash),
    ).resolves.toBe(false);
    expect(comparedHashes).toHaveLength(2);
    expect(comparedHashes[0]).toBe(supportedShapeHash);
    expect(comparedHashes[1]).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
  });

  it("executes exactly one comparator call for a supported hash result", async () => {
    const supportedHash = await hash("stored-password", 12);

    for (const comparatorResult of [true, false]) {
      let comparisons = 0;
      const comparator = async () => {
        comparisons += 1;
        return comparatorResult;
      };

      await expect(
        verifyPassword("provided-password", supportedHash, comparator),
      ).resolves.toBe(comparatorResult);
      expect(comparisons).toBe(1);
    }
  });
});
