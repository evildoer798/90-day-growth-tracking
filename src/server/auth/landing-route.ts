import { APP_ROUTES } from "@/config/navigation.config";
import { ROLE_CODES } from "@/config/roles.config";
import type { Actor } from "@/server/auth/get-actor";

export function landingRouteForActor(actor: Actor): string {
  if (actor.roles.includes(ROLE_CODES.ADMIN)) return APP_ROUTES.adminTrainees;
  if (actor.roles.includes(ROLE_CODES.SUPERVISOR)) return APP_ROUTES.supervisor;
  if (actor.roles.includes(ROLE_CODES.MENTOR)) return APP_ROUTES.mentor;
  if (actor.roles.includes(ROLE_CODES.TRAINEE) && actor.traineeId) {
    return `/progress/${encodeURIComponent(actor.traineeId)}`;
  }
  return "/role/trainee";
}
