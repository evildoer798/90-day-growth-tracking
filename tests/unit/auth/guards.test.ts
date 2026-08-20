import { describe, expect, it } from "vitest";

import { ROLE_CODES } from "@/config/roles.config";
import {
  actorFromSession,
  UnauthorizedError,
} from "@/server/auth/get-actor";
import {
  ForbiddenError,
  requireConfirmProgress,
  requireEditTask,
  requireManageUsers,
  requireToggleLearn,
  requireViewTrainee,
  requireWriteMentorNote,
} from "@/server/auth/require-permission";

const evaluatedAt = new Date("2026-08-14T00:00:00.000Z");
const trainee = { id: "trainee-1" };
const mentor = {
  userId: "mentor-user",
  roles: [ROLE_CODES.MENTOR],
  traineeId: null,
  enabled: true,
};
const mentorRelation = {
  userId: mentor.userId,
  traineeId: trainee.id,
  role: ROLE_CODES.MENTOR,
  enabled: true,
  startsAt: null,
  expiresAt: null,
};

describe("session actor mapping", () => {
  it("maps authenticated session claims to the permission actor shape", () => {
    expect(
      actorFromSession({
        expires: "2026-08-15T00:00:00.000Z",
        user: {
          id: mentor.userId,
          employeeId: "employee-1",
          roles: [ROLE_CODES.MENTOR],
          traineeId: null,
          enabled: true,
        },
      }),
    ).toEqual(mentor);
  });

  it.each([null, { expires: "2026-08-15T00:00:00.000Z" }])(
    "throws a typed unauthorized error for a missing identity: %j",
    (session) => {
      expect(() => actorFromSession(session)).toThrow(UnauthorizedError);
      try {
        actorFromSession(session);
      } catch (error) {
        expect(error).toMatchObject({ code: "UNAUTHORIZED", status: 401 });
      }
    },
  );
});

describe("server permission guards", () => {
  it("returns the actor when the corresponding Task 3 policy allows access", () => {
    expect(requireViewTrainee(mentor, trainee, [mentorRelation], evaluatedAt)).toBe(mentor);
    expect(requireConfirmProgress(mentor, trainee, [mentorRelation], evaluatedAt)).toBe(mentor);
    expect(requireWriteMentorNote(mentor, trainee, [mentorRelation], evaluatedAt)).toBe(mentor);

    const traineeActor = {
      userId: "trainee-user",
      roles: [ROLE_CODES.TRAINEE],
      traineeId: trainee.id,
      enabled: true,
    };
    expect(requireToggleLearn(traineeActor, trainee)).toBe(traineeActor);

    const administrator = {
      userId: "admin-user",
      roles: [ROLE_CODES.ADMIN],
      traineeId: null,
      enabled: true,
    };
    expect(requireManageUsers(administrator)).toBe(administrator);
    expect(requireEditTask(administrator)).toBe(administrator);
  });

  it("throws a typed forbidden error when a Task 3 policy denies access", () => {
    const checks = [
      () => requireViewTrainee(mentor, { id: "other" }, [mentorRelation], evaluatedAt),
      () => requireConfirmProgress(mentor, trainee, [], evaluatedAt),
      () => requireWriteMentorNote(mentor, trainee, [], evaluatedAt),
      () => requireToggleLearn(mentor, trainee),
      () => requireEditTask(mentor),
      () => requireManageUsers(mentor),
    ];

    for (const check of checks) {
      expect(check).toThrow(ForbiddenError);
      try {
        check();
      } catch (error) {
        expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
      }
    }
  });
});
