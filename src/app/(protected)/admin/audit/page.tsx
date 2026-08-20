import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminPageHeader } from "@/features/admin/admin-page-header";
import { normalizeAuditSummary } from "@/features/admin/audit-summary";
import { getActor } from "@/server/auth/get-actor";
import { listAuditLogs } from "@/server/services/admin.service";

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await getActor();
  const params = await searchParams;
  const requested = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const data = await listAuditLogs(actor, { page, pageSize: 25 });
  return <section className="role-dashboard">
    <AdminPageHeader title="审计日志" />
    <Table aria-label="审计日志">
      <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>操作者</TableHead><TableHead>动作 / 对象</TableHead><TableHead>安全摘要</TableHead></TableRow></TableHeader>
      <TableBody>{data.rows.map((row) => <TableRow key={row.id}>
        <TableCell>{row.createdAt.toLocaleString("zh-CN")}</TableCell>
        <TableCell>{row.actor.username}</TableCell>
        <TableCell>{row.action} · {row.entity}<br /><small>{row.entityId ?? "—"}</small></TableCell>
        <TableCell><details><summary>查看变更</summary><pre className="audit-summary">{JSON.stringify(normalizeAuditSummary(row.entity, row.action, row.summary), null, 2)}</pre></details></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <nav aria-label="审计分页" className="admin-pagination">
      {data.page > 1 ? <Link href={`/admin/audit?page=${data.page - 1}`}>上一页</Link> : <span />}
      <span>第 {data.page} 页 · 共 {data.total} 条</span>
      {data.page * data.pageSize < data.total ? <Link href={`/admin/audit?page=${data.page + 1}`}>下一页</Link> : <span />}
    </nav>
  </section>;
}
