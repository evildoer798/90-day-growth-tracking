import { describe, expect, it } from "vitest";

import { assertSafeXlsxArchive, XLSX_LIMITS } from "@/domain/import/xlsx-safety";
import { buildImportPreview } from "@/domain/import/build-import-preview";
import { parseTrainingPlan } from "@/domain/import/parse-training-plan";

const fakeZip = (entries: readonly { name: string; compressed: number; uncompressed: number }[]) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(entry.compressed, 18);
    local.writeUInt32LE(entry.uncompressed, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(entry.compressed, 20);
    central.writeUInt32LE(entry.uncompressed, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
};

describe("XLSX archive resource limits", () => {
  it("rejects one oversized uncompressed ZIP entry before SheetJS reads it", () => {
    const archive = fakeZip([{ name: "xl/sharedStrings.xml", compressed: 1, uncompressed: XLSX_LIMITS.maxEntryUncompressedBytes + 1 }]);
    expect(() => assertSafeXlsxArchive(archive)).toThrow(/单个文件/);
  });

  it("rejects excessive total uncompressed bytes", () => {
    const size = Math.floor(XLSX_LIMITS.maxTotalUncompressedBytes / 5) + 1;
    const archive = fakeZip(Array.from({ length: 5 }, (_, index) => ({
      name: `xl/${index}.xml`, compressed: 1, uncompressed: size,
    })));
    expect(() => assertSafeXlsxArchive(archive)).toThrow(/解压总量/);
  });

  it("rejects excessive entry counts and malformed central directories", () => {
    const entries = Array.from({ length: XLSX_LIMITS.maxEntries + 1 }, (_, index) => ({
      name: `xl/${index}.xml`, compressed: 0, uncompressed: 0,
    }));
    expect(() => assertSafeXlsxArchive(fakeZip(entries))).toThrow(/文件数量/);
    expect(() => assertSafeXlsxArchive(Buffer.from("PK\u0003\u0004"))).toThrow(/目录/);
  });

  it("turns an unsafe archive into a non-applicable import preview", () => {
    const archive = fakeZip([{ name: "xl/sharedStrings.xml", compressed: 1, uncompressed: XLSX_LIMITS.maxEntryUncompressedBytes + 1 }]);
    const parsed = parseTrainingPlan(archive);
    const preview = buildImportPreview(parsed, []);
    expect(parsed.rows).toEqual([]);
    expect(preview.canApply).toBe(false);
    expect(preview.counts.error).toBeGreaterThan(0);
  });
});
