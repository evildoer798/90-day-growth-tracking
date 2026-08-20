import Link from "next/link";

import { PendingConfirmationList } from "@/features/mentor/pending-confirmation-list";
import { setConfirmationAction } from "@/server/actions/progress.actions";
import { getActor } from "@/server/auth/get-actor";
import { getMentorDashboard } from "@/server/services/dashboard.service";

export default async function MentorPendingPage() {
  const evaluatedAt = new Date();
  const actor = await getActor();
  const dashboard = await getMentorDashboard(actor, evaluatedAt);
  return (
    <section aria-labelledby="mentor-pending-heading" className="role-dashboard">
      <header className="role-dashboard__header">
        <div>
          <p className="role-dashboard__eyebrow">MENTOR QUEUE</p>
          <h1 id="mentor-pending-heading">待确认实践</h1>
          <p>仅显示当前由你负责的新人的 Action 与 Drill 待确认项目。</p>
        </div>
        <Link className="role-dashboard__secondary-link" href="/mentor">返回导师工作台</Link>
      </header>
      <PendingConfirmationList action={setConfirmationAction} items={dashboard.confirmationQueue} />
    </section>
  );
}
