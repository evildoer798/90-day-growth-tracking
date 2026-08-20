import { describe, expect, it } from "vitest";

import * as xlsx from "xlsx";

describe("SheetJS parser dependency", () => {
  it("uses the maintained SheetJS 0.20.3 parser for untrusted admin uploads", () => {
    expect(xlsx.version).toBe("0.20.3");
  });
});
