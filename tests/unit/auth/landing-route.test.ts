import { describe, expect, it } from "vitest";

import { ROLE_CODES } from "@/config/roles.config";
import { landingRouteForActor } from "@/server/auth/landing-route";

describe("fresh actor landing route", () => {
  it.each([
    [[ROLE_CODES.ADMIN], null, "/admin/trainees"],
    [[ROLE_CODES.SUPERVISOR], null, "/supervisor"],
    [[ROLE_CODES.MENTOR], null, "/mentor"],
    [[ROLE_CODES.TRAINEE], "trainee-1", "/progress/trainee-1"],
  ] as const)("routes %j to an implemented landing", (roles, traineeId, expected) => {
    expect(landingRouteForActor({ userId: "user-1", roles, traineeId, enabled: true })).toBe(expected);
  });

  it("uses the highest-authority implemented landing for a multi-role actor", () => {
    expect(landingRouteForActor({
      userId: "user-1",
      roles: [ROLE_CODES.TRAINEE, ROLE_CODES.MENTOR, ROLE_CODES.ADMIN],
      traineeId: "trainee-1",
      enabled: true,
    })).toBe("/admin/trainees");
  });

  it("keeps an unlinked trainee on an explanatory role landing without inventing an id", () => {
    expect(landingRouteForActor({
      userId: "user-1",
      roles: [ROLE_CODES.TRAINEE],
      traineeId: null,
      enabled: true,
    })).toBe("/role/trainee");
  });
});
