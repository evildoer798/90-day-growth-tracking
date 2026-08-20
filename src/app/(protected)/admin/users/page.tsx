import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminPageHeader } from "@/features/admin/admin-page-header";
import { UserForm, UserSecurityForm } from "@/features/admin/user-form";
import { getActor } from "@/server/auth/get-actor";
import { requireManageUsers } from "@/server/auth/require-permission";
import { prisma } from "@/server/db/prisma";

export default async function AdminUsersPage() {
  const actor = await getActor();
  requireManageUsers(actor);
  const [users, trainees] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true, enabled: true, traineeId: true, roles: { select: { role: { select: { code: true } } } } },
      orderBy: [{ enabled: "desc" }, { username: "asc" }],
    }),
    prisma.trainee.findMany({ where: { enabled: true }, select: { id: true, name: true, employeeId: true }, orderBy: { employeeId: "asc" } }),
  ]);
  const traineeOptions = trainees.map((trainee) => ({ id: trainee.id, label: `${trainee.name} · ${trainee.employeeId}` }));
  const traineeLabels = new Map(traineeOptions.map((trainee) => [trainee.id, trainee.label]));
  return <section className="role-dashboard">
    <AdminPageHeader title="账户与角色" />
    <div className="admin-panel"><h2>新增账户</h2><UserForm trainees={traineeOptions} /></div>
    <Table aria-label="账户列表">
      <TableHeader><TableRow><TableHead>登录工号</TableHead><TableHead>角色</TableHead><TableHead>关联档案</TableHead><TableHead>编辑与安全操作</TableHead></TableRow></TableHeader>
      <TableBody>{users.map((user) => <TableRow key={user.id}>
        <TableCell>{user.username}</TableCell>
        <TableCell>{user.roles.map((value) => value.role.code).join("、")}</TableCell>
        <TableCell>{user.traineeId ? traineeLabels.get(user.traineeId) ?? user.traineeId : "—"}</TableCell>
        <TableCell>
          <details><summary>编辑账户</summary><UserForm initial={{
            id: user.id, username: user.username, roles: user.roles.map((value) => value.role.code), traineeId: user.traineeId,
          }} trainees={traineeOptions} /></details>
          <UserSecurityForm enabled={user.enabled} id={user.id} />
        </TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </section>;
}
