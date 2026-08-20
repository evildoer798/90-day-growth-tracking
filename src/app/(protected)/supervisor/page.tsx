import { SupervisorDashboard } from "@/features/supervisor/supervisor-dashboard";
import { normalizeTraineeSearch } from "@/features/trainee/trainee-search";
import { getActor } from "@/server/auth/get-actor";
import { getSupervisorDashboard } from "@/server/services/dashboard.service";

export default async function SupervisorPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string | string[] }>;
}) {
  const evaluatedAt = new Date();
  const [actor, params] = await Promise.all([getActor(), searchParams]);
  const dashboard = await getSupervisorDashboard(actor, evaluatedAt);
  return <SupervisorDashboard dashboard={dashboard} query={normalizeTraineeSearch(params.query)} />;
}
