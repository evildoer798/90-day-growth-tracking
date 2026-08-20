"use client";

import { useState, useTransition } from "react";

import type { ImportPreview as ImportPreviewData, ImportClassification } from "@/domain/import/training-plan-schema";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const labels: Record<ImportClassification, string> = {
  create: "新增",
  update: "更新",
  "disable-candidate": "停用候选",
  skip: "不变",
  warning: "警告",
  error: "错误",
};

const localizeMessage = (message: string | undefined, fallback: string): string => {
  if (!message) return fallback;
  const mismatch = message.match(/Reference title\/link count differs \((\d+)\/(\d+)\)/);
  if (mismatch) return `资料标题与链接数量不一致（${mismatch[1]}/${mismatch[2]}），未猜测配对且未导入关联`;
  if (message === "Reference title has no ReferenceLink and was not imported") return "资料标题缺少链接，未导入关联";
  return message;
};

export interface ImportPreviewProps {
  preview: ImportPreviewData;
  previewToken: string;
  onApply: (previewToken: string) => Promise<unknown>;
}

export function ImportPreview({ preview, previewToken, onApply }: ImportPreviewProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const applyDisabled = !preview.canApply || preview.counts.error > 0 || !confirmed || isPending;

  return (
    <section aria-labelledby="import-preview-heading" className="import-preview">
      <header className="admin-section-heading">
        <div>
          <p className="role-dashboard__eyebrow">EXCEL PREVIEW</p>
          <h2 id="import-preview-heading">导入差异预览</h2>
          <p>{preview.fileName} · 上传预览不会写入数据库</p>
        </div>
      </header>
      <ul aria-label="导入统计" className="import-counts">
        {(Object.keys(labels) as ImportClassification[]).map((classification) => (
          <li className={`import-count import-count--${classification}`} key={classification}>
            {labels[classification]} {preview.counts[classification]}
          </li>
        ))}
      </ul>
      <Table aria-label="逐行导入结果">
        <TableHeader><TableRow><TableHead>结果</TableHead><TableHead>稳定键</TableHead><TableHead>说明</TableHead></TableRow></TableHeader>
        <TableBody>
          {preview.items.map((item, index) => (
            <TableRow data-classification={item.classification} key={`${item.classification}-${item.stableImportKey ?? index}-${index}`}>
              <TableCell>{labels[item.classification]}</TableCell>
              <TableCell>{item.stableImportKey ?? "—"}</TableCell>
              <TableCell>{localizeMessage(item.message, `${labels[item.classification]}任务`)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {preview.counts.error > 0 ? <p className="form-error" role="alert">预览包含错误，修正工作簿后才能导入。</p> : null}
      <div className="import-confirmation">
        <label>
          <input checked={confirmed} disabled={!preview.canApply || isPending} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
          我确认按以上预览创建、更新及停用候选任务
        </label>
        <Button disabled={applyDisabled} onClick={() => startTransition(async () => {
          setMessage(null);
          try {
            await onApply(previewToken);
            setConfirmed(false);
            setFailed(false);
            setMessage("导入已完成");
          } catch (error) {
            setFailed(true);
            setMessage(error instanceof Error && error.message ? error.message : "导入失败，请重新上传并预览");
          }
        })} type="button">确认导入</Button>
      </div>
      {message ? <p className={failed ? "form-error" : "admin-success"} role={failed ? "alert" : "status"}>{message}</p> : null}
    </section>
  );
}
