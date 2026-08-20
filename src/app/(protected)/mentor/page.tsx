import { MentorDashboard } from "@/features/mentor/mentor-dashboard";
import { getActor } from "@/server/auth/get-actor";
import { getMentorDashboard } from "@/server/services/dashboard.service";

export default async function MentorPage() {
  const evaluatedAt = new Date();
  const actor = await getActor();
  const dashboard = await getMentorDashboard(actor, evaluatedAt);
  return <MentorDashboard dashboard={dashboard} />;
}
