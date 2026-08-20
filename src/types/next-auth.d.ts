import type { RoleCode } from "@/config/roles.config";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      employeeId: string;
      roles: RoleCode[];
      traineeId: string | null;
      enabled: boolean;
    };
  }

  interface User {
    employeeId: string;
    roles: RoleCode[];
    traineeId: string | null;
    enabled: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    employeeId?: string;
    roles?: RoleCode[];
    traineeId?: string | null;
    enabled?: boolean;
  }
}
