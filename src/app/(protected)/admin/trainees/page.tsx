import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminPageHeader } from "@/features/admin/admin-page-header";
import { TraineeForm, TraineeStatusForm } from "@/features/admin/trainee-form";
import { normalizeTraineeSearch, TraineeSearch } from "@/features/trainee/trainee-search";
import { getActor } from "@/server/auth/get-actor";
import { requireManageUsers } from "@/server/auth/require-permission";
import { prisma } from "@/server/db/prisma";
import { getTrainingDurationDays } from "@/server/services/training-plan-settings.service";

export default async function AdminTraineesPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string | string[] }>;
}) {
  const [actor, params] = await Promise.all([getActor(), searchParams]);
  requireManageUsers(actor);
  const query = normalizeTraineeSearch(params.query);
  const [rows, durationDays] = await Promise.all([
    prisma.trainee.findMany({
      where: query ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { employeeId: { contains: query, mode: "insensitive" } },
        ],
      } : undefined,
      select: { id: true, name: true, employeeId: true, focusGroup: true, trainingStartDate: true, trainingDayOverride: true, enabled: true },
      orderBy: [{ enabled: "desc" }, { employeeId: "asc" }],
    }),
    getTrainingDurationDays(),
  ]);
  return <section className="role-dashboard">
    <AdminPageHeader title="人员管理" />
    <div className="admin-panel"><h2>新增新人</h2><TraineeForm durationDays={durationDays} /></div>
    <TraineeSearch action="/admin/trainees" query={query} />
    <div className="role-dashboard__section-heading"><h2>{query ? "搜索结果" : "新人档案"}</h2><span>{rows.length} 人</span></div>
    <Table aria-label="新人档案">
      <TableHeader><TableRow><TableHead>姓名 / 工号</TableHead><TableHead>重点</TableHead><TableHead>开始日期</TableHead><TableHead>Day 覆盖</TableHead><TableHead>编辑与状态</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row) => <TableRow key={row.id}>
        <TableCell>{row.name}<br /><small>{row.employeeId}</small></TableCell>
        <TableCell>{row.focusGroup}</TableCell>
        <TableCell>{row.trainingStartDate.toISOString().slice(0, 10)}</TableCell>
        <TableCell>{row.trainingDayOverride ?? "自动"}</TableCell>
        <TableCell>
          <details><summary>编辑档案</summary><TraineeForm durationDays={durationDays} initial={{
            id: row.id, name: row.name, employeeId: row.employeeId, focusGroup: row.focusGroup,
            trainingStartDate: row.trainingStartDate.toISOString().slice(0, 10), trainingDayOverride: row.trainingDayOverride,
          }} /></details>
          <TraineeStatusForm enabled={row.enabled} id={row.id} />
        </TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </section>;
}
