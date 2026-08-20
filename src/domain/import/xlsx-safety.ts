export const XLSX_LIMITS = {
  maxEntries: 1_000,
  maxEntryUncompressedBytes: 16 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
  maxWorksheetRows: 1_000,
  maxWorksheetColumns: 64,
  maxWorksheetCells: 50_000,
  maxCellTextChars: 10_000,
} as const;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_EOCD_SEARCH = 65_557;

const findEndOfCentralDirectory = (buffer: Buffer): number => {
  const start = Math.max(0, buffer.length - MAX_EOCD_SEARCH);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
};

export function assertSafeXlsxArchive(buffer: Buffer): void {
  if (buffer.length < 22) throw new Error("XLSX ZIP 中央目录缺失");
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error("XLSX ZIP 中央目录缺失");

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);
  if (
    diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount ||
    entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
  ) {
    throw new Error("XLSX ZIP 不支持分卷或 ZIP64 格式");
  }
  if (entryCount > XLSX_LIMITS.maxEntries) {
    throw new Error(`XLSX ZIP 文件数量超过 ${XLSX_LIMITS.maxEntries} 限制`);
  }
  if (
    eocdOffset + 22 + commentLength > buffer.length ||
    centralOffset + centralSize > eocdOffset
  ) {
    throw new Error("XLSX ZIP 中央目录边界无效");
  }

  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error("XLSX ZIP 中央目录条目无效");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const entryCommentLength = buffer.readUInt16LE(offset + 32);
    if ((flags & 0x1) !== 0) throw new Error("XLSX ZIP 不支持加密条目");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error("XLSX ZIP 不支持 ZIP64 条目");
    }
    if (uncompressedSize > XLSX_LIMITS.maxEntryUncompressedBytes) {
      throw new Error(`XLSX ZIP 单个文件解压大小超过 ${XLSX_LIMITS.maxEntryUncompressedBytes} 字节限制`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > XLSX_LIMITS.maxTotalUncompressedBytes) {
      throw new Error(`XLSX ZIP 解压总量超过 ${XLSX_LIMITS.maxTotalUncompressedBytes} 字节限制`);
    }
    offset += 46 + fileNameLength + extraLength + entryCommentLength;
  }
  if (offset !== centralOffset + centralSize) {
    throw new Error("XLSX ZIP 中央目录大小不一致");
  }
}
