import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { readValidatedWorkbookFile } from "@/server/services/admin-import.service";

const officialMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Day", "Task"], [1, "安全入门"]]), "计划");
const validWorkbook = Buffer.from(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
const upload = (overrides: Partial<{ name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }> = {}) => ({
  name: "计划.xlsx",
  type: officialMime,
  size: validWorkbook.length,
  arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(validWorkbook).buffer),
  ...overrides,
});

describe("ADMIN workbook upload boundary", () => {
  it("rejects an oversized file before reading its body", async () => {
    const file = upload({ size: 10 * 1024 * 1024 + 1 });
    await expect(readValidatedWorkbookFile(file)).rejects.toThrow("超过 10 MB");
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects a wrong MIME type before reading its body", async () => {
    const file = upload({ type: "text/plain" });
    await expect(readValidatedWorkbookFile(file)).rejects.toThrow("文件类型");
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects an XLSX name and MIME with an invalid ZIP signature", async () => {
    const file = upload({ arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4]).buffer), size: 4 });
    await expect(readValidatedWorkbookFile(file)).rejects.toThrow("文件签名");
  });

  it("returns a buffer only for an allowed MIME and XLSX ZIP signature", async () => {
    const result = await readValidatedWorkbookFile(upload());
    expect([...result.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
