import { describe, expect, it } from "vitest";

import { THEME } from "@/config/theme.config";

const channel = (hexPair: string): number => {
  const value = Number.parseInt(hexPair, 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const normalized = hex.replace("#", "");
  return (
    0.2126 * channel(normalized.slice(0, 2)) +
    0.7152 * channel(normalized.slice(2, 4)) +
    0.0722 * channel(normalized.slice(4, 6))
  );
};

const contrastRatio = (foreground: string, background: string): number => {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
};

describe("small semantic badge colors", () => {
  it("meets WCAG AA 4.5:1 contrast for every foreground/background pair", () => {
    for (const [name, pair] of Object.entries(THEME.badges)) {
      expect(
        contrastRatio(pair.foreground, pair.background),
        `${name} badge contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
