import { describe, expect, it } from "vitest";
import { ROLE_CODES } from "@/config/roles.config";
import {
  canConfirmProgress,
  canEditTask,
  canManageUsers,
  canSubmitPractice,
  canToggleLearn,
  canViewTrainee,
  canWriteMentorNote,
} from "@/domain/permissions/policy";

const trainee = { id: "trainee-1" };
const otherTrainee = { id: "trainee-2" };
const evaluatedAt = new Date("2026-08-14T00:00:00.000Z");

const supervisor = {
  userId: "supervisor-1",
  roles: [ROLE_CODES.SUPERVISOR],
  traineeId: null,
  enabled: true,
};

const mentor = {
  userId: "mentor-1",
  roles: [ROLE_CODES.MENTOR],
  traineeId: null,
  enabled: true,
};

const traineeActor = {
  userId: "trainee-user-1",
  roles: [ROLE_CODES.TRAINEE],
  traineeId: trainee.id,
  enabled: true,
};

const supervisorRelation = {
  userId: supervisor.userId,
  traineeId: trainee.id,
  role: ROLE_CODES.SUPERVISOR,
  enabled: true,
  startsAt: null,
  expiresAt: null,
};

const mentorRelation = {
  userId: mentor.userId,
  traineeId: trainee.id,
  role: ROLE_CODES.MENTOR,
  enabled: true,
  startsAt: null,
  expiresAt: null,
};

describe("server-side permission policy", () => {
  it("lets enabled supervisors view every trainee but keeps the role read-only", () => {
    expect(canViewTrainee(supervisor, otherTrainee, [], evaluatedAt)).toBe(true);
    expect(canConfirmProgress(supervisor, otherTrainee, [], evaluatedAt)).toBe(false);
    expect(canWriteMentorNote(supervisor, otherTrainee, [], evaluatedAt)).toBe(false);
    expect(canConfirmProgress(supervisor, trainee, [supervisorRelation], evaluatedAt)).toBe(false);
    expect(canWriteMentorNote(supervisor, trainee, [supervisorRelation], evaluatedAt)).toBe(false);
  });

  it("limits trainees to viewing and toggling Learn for their linked trainee record", () => {
    expect(canViewTrainee(traineeActor, trainee, [], evaluatedAt)).toBe(true);
    expect(canToggleLearn(traineeActor, trainee)).toBe(true);
    expect(canSubmitPractice(traineeActor, trainee)).toBe(true);
    expect(canViewTrainee(traineeActor, otherTrainee, [], evaluatedAt)).toBe(false);
    expect(canToggleLearn(traineeActor, otherTrainee)).toBe(false);
    expect(canSubmitPractice(traineeActor, otherTrainee)).toBe(false);
  });

  it("limits mentors to viewing and mutating their active mentor assignments", () => {
    expect(canViewTrainee(mentor, trainee, [mentorRelation], evaluatedAt)).toBe(true);
    expect(canConfirmProgress(mentor, trainee, [mentorRelation], evaluatedAt)).toBe(true);
    expect(canWriteMentorNote(mentor, trainee, [mentorRelation], evaluatedAt)).toBe(true);
    expect(canViewTrainee(mentor, otherTrainee, [mentorRelation], evaluatedAt)).toBe(false);
    expect(canConfirmProgress(mentor, otherTrainee, [mentorRelation], evaluatedAt)).toBe(false);
  });

  it("denies relation-scoped access for disabled or expired relations", () => {
    expect(
      canConfirmProgress(mentor, trainee, [{ ...mentorRelation, enabled: false }], evaluatedAt),
    ).toBe(false);
    expect(
      canWriteMentorNote(mentor, trainee, [
        { ...mentorRelation, expiresAt: new Date("2020-01-01T00:00:00.000Z") },
      ], evaluatedAt),
    ).toBe(false);
  });

  it("evaluates relation expiry against the supplied instant", () => {
    const expiresBeforeEvaluation = {
      ...mentorRelation,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    };

    expect(
      canConfirmProgress(
        mentor,
        trainee,
        [expiresBeforeEvaluation],
        new Date("2028-01-01T00:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("treats the relation end date as inclusive", () => {
    expect(
      canConfirmProgress(mentor, trainee, [{ ...mentorRelation, expiresAt: evaluatedAt }], evaluatedAt),
    ).toBe(true);
  });

  it("evaluates relation dates as complete Asia/Shanghai business days", () => {
    const oneDayRelation = {
      ...mentorRelation,
      startsAt: new Date("2026-08-15T00:00:00.000Z"),
      expiresAt: new Date("2026-08-15T00:00:00.000Z"),
    };
    const canConfirm = (instant: string) => canConfirmProgress(mentor, trainee, [oneDayRelation], new Date(instant));
    expect(canConfirm("2026-08-14T15:59:59.999Z")).toBe(false);
    expect(canConfirm("2026-08-14T16:00:00.000Z")).toBe(true);
    expect(canConfirm("2026-08-15T04:00:00.000Z")).toBe(true);
    expect(canConfirm("2026-08-15T15:59:59.999Z")).toBe(true);
    expect(canConfirm("2026-08-15T16:00:00.000Z")).toBe(false);
  });

  it("denies access from a relation that starts after the evaluation instant", () => {
    expect(
      canConfirmProgress(mentor, trainee, [
        { ...mentorRelation, startsAt: new Date("2026-08-15T00:00:00.000Z") },
      ], evaluatedAt),
    ).toBe(false);
  });

  it("allows access when a relation starts at the evaluation instant", () => {
    expect(
      canConfirmProgress(mentor, trainee, [{ ...mentorRelation, startsAt: evaluatedAt }], evaluatedAt),
    ).toBe(true);
  });

  it("unions an enabled actor's roles", () => {
    const supervisorMentor = {
      ...supervisor,
      roles: [ROLE_CODES.SUPERVISOR, ROLE_CODES.MENTOR],
    };
    const mentorAssignment = { ...mentorRelation, userId: supervisorMentor.userId };

    expect(canViewTrainee(supervisorMentor, otherTrainee, [], evaluatedAt)).toBe(true);
    expect(canConfirmProgress(supervisorMentor, trainee, [mentorAssignment], evaluatedAt)).toBe(true);
  });

  it("does not give a staff account trainee progress controls from a residual TRAINEE role", () => {
    const mentorTrainee = {
      ...traineeActor,
      roles: [ROLE_CODES.MENTOR, ROLE_CODES.TRAINEE],
    };

    expect(canViewTrainee(mentorTrainee, trainee, [], evaluatedAt)).toBe(false);
    expect(canToggleLearn(mentorTrainee, trainee)).toBe(false);
    expect(canSubmitPractice(mentorTrainee, trainee)).toBe(false);
  });

  it("lets enabled administrators override every supported capability", () => {
    const administrator = {
      userId: "admin-1",
      roles: [ROLE_CODES.ADMIN],
      traineeId: null,
      enabled: true,
    };

    expect(canViewTrainee(administrator, otherTrainee, [], evaluatedAt)).toBe(true);
    expect(canToggleLearn(administrator, otherTrainee)).toBe(true);
    expect(canSubmitPractice(administrator, otherTrainee)).toBe(true);
    expect(canConfirmProgress(administrator, otherTrainee, [], evaluatedAt)).toBe(true);
    expect(canWriteMentorNote(administrator, otherTrainee, [], evaluatedAt)).toBe(true);
    expect(canEditTask(administrator)).toBe(true);
    expect(canManageUsers(administrator)).toBe(true);
  });

  it("grants nothing to disabled users", () => {
    const disabledSupervisor = { ...supervisor, enabled: false };

    expect(canViewTrainee(disabledSupervisor, trainee, [supervisorRelation], evaluatedAt)).toBe(false);
    expect(canConfirmProgress(disabledSupervisor, trainee, [supervisorRelation], evaluatedAt)).toBe(false);
    expect(canEditTask(disabledSupervisor)).toBe(false);
  });

  it("allows only administrators to edit tasks and manage users", () => {
    expect(canEditTask(supervisor)).toBe(false);
    expect(canEditTask(mentor)).toBe(false);
    expect(canManageUsers(supervisor)).toBe(false);
    expect(canManageUsers(mentor)).toBe(false);
  });
});
