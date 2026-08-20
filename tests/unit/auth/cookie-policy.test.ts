import { describe, expect, it } from "vitest";

import { secureCookieOverrideForUrl } from "@/server/auth/cookie-policy";

describe("Auth.js cookie protocol policy", () => {
  it("allows a production LAN HTTP origin without forcing Secure cookies", () => {
    expect(secureCookieOverrideForUrl("http://192.168.10.20:3000")).toBe(false);
  });

  it("keeps Secure cookies enabled for HTTPS", () => {
    expect(secureCookieOverrideForUrl("https://growth.example.com")).toBe(true);
  });

  it("leaves missing or malformed origins to Auth.js request-protocol defaults", () => {
    expect(secureCookieOverrideForUrl(undefined)).toBeUndefined();
    expect(secureCookieOverrideForUrl("not-a-url")).toBeUndefined();
  });
});
