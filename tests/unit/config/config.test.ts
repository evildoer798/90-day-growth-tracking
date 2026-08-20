import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "@/config/app.config";
import { DIMENSIONS } from "@/config/dimensions.config";

describe("central product configuration", () => {
  it("defines 90 days and all five dimensions", () => {
    expect(APP_CONFIG.trainingDays).toBe(90);
    expect(Object.keys(DIMENSIONS)).toEqual(["Dall", "D1", "D2", "D3", "D4"]);
  });
});
