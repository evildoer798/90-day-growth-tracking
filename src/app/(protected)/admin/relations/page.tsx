import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminPageHeader } from "@/features/admin/admin-page-header";
import { RelationForm } from "@/features/admin/relation-form";
import { toBusinessDate } from "@/domain/dates/business-date";
import { getActor } from "@/server/auth/get-actor";
import { requireManageUsers } from "@/server/auth/require-permission";
import { prisma } from "@/server/db/prisma";

const statusAt = (relation: { enabled: boolean; startDate: Date; endDate: Date | null }, today: Date) => {
  if (!relation.enabled) return "已取消";
  if (toBusinessDate(relation.startDate) > today) return "待生效";
  if (relation.endDate && toBusinessDate(relation.endDate) < today) return "已结束";
  return "当前有效";
};

export default async function AdminRelationsPage() {
  const actor = await getActor();
  requireManageUsers(actor);
  const [trainees, reviewers, relations] = await Promise.all([
    prisma.trainee.findMany({ where: { enabled: true }, select: { id: true, name: true, employeeId: true } }),
    prisma.user.findMany({ where: { enabled: true, roles: { some: { role: { code: { in: ["MENTOR", "SUPERVISOR"] } } } } }, select: { id: true, username: true } }),
    prisma.userTraineeRelation.findMany({ include: { user: { select: { username: true } }, trainee: { select: { name: true, employeeId: true } } }, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], take: 100 }),
  ]);
  const today = toBusinessDate(new Date());
  return <section className="role-dashboard">
    <AdminPageHeader title="审核关系" />
    <div className="admin-panel"><RelationForm reviewers={reviewers.map((reviewer) => ({ id: reviewer.id, label: reviewer.username }))} trainees={trainees.map((trainee) => ({ id: trainee.id, label: `${trainee.name} · ${trainee.employeeId}` }))} /></div>
    <Table aria-label="关系历史">
      <TableHeader><TableRow><TableHead>新人</TableHead><TableHead>审核人</TableHead><TableHead>类型</TableHead><TableHead>有效期</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
      <TableBody>{relations.map((relation) => <TableRow key={relation.id}>
        <TableCell>{relation.trainee.name} · {relation.trainee.employeeId}</TableCell>
        <TableCell>{relation.user.username}</TableCell><TableCell>{relation.type}</TableCell>
        <TableCell>{relation.startDate.toISOString().slice(0, 10)} — {relation.endDate?.toISOString().slice(0, 10) ?? "至今"}</TableCell>
        <TableCell>{statusAt(relation, today)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </section>;
}
