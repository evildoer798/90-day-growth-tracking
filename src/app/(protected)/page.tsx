import { redirect } from "next/navigation";

import { getActor } from "@/server/auth/get-actor";
import { landingRouteForActor } from "@/server/auth/landing-route";

export default async function ProtectedHomePage() {
  redirect(landingRouteForActor(await getActor()));
}
