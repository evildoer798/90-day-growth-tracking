import { ROLE_CODES, type RoleCode } from "@/config/roles.config";

export interface PermissionActor {
  userId: string;
  roles: readonly RoleCode[];
  traineeId: string | null;
  enabled: boolean;
}

export interface TraineeRecord {
  id: string;
}

export type RelationRole =
  | typeof ROLE_CODES.SUPERVISOR
  | typeof ROLE_CODES.MENTOR;

export interface UserTraineeRelation {
  userId: string;
  traineeId: string;
  role: RelationRole;
  enabled: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
}
