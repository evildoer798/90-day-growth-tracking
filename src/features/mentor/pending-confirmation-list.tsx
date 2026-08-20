"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/config/ui-text.config";
import type { ConfirmationQueueItemDto } from "@/server/services/dashboard.service";

export interface ConfirmationActionInput {
  traineeId: string;
  taskId: string;
  kind: "ACTION" | "DRILL";
  confirmed: boolean;
}

export interface PendingConfirmationListProps {
  items: readonly ConfirmationQueueItemDto[];
  action: (input: ConfirmationActionInput) => Promise<unknown>;
}

export function PendingConfirmationList({ items, action }: PendingConfirmationListProps) {
  const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set());
  const pendingKeysRef = useRef(new Set<string>());
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState<Record<string, { kind: "status" | "error"; message: string }>>({});

  const visibleItems = items.filter((item) =>
    !resolved.has(`${item.trainee.id}:${item.taskId}:${item.kind}`),
  );

  if (visibleItems.length === 0) {
    return <div className="role-dashboard__empty"><p>当前没有待确认项目</p><span>新的 Action 或 Drill 完成后会显示在这里。</span></div>;
  }

  const toggle = (item: ConfirmationQueueItemDto) => {
    const key = `${item.trainee.id}:${item.taskId}:${item.kind}`;
    if (pendingKeysRef.current.has(key)) {
      return;
    }
    pendingKeysRef.current.add(key);
    setPendingKeys(new Set(pendingKeysRef.current));
    setFeedback((current) => ({ ...current, [key]: { kind: "status", message: "正在保存…" } }));
    void (async () => {
      try {
        await action({
          traineeId: item.trainee.id,
          taskId: item.taskId,
          kind: item.kind,
          confirmed: true,
        });
        setResolved((current) => {
          const next = new Set(current);
          next.add(key);
          return next;
        });
      } catch {
        setFeedback((current) => ({
          ...current,
          [key]: { kind: "error", message: UI_TEXT.saveFailed },
        }));
      } finally {
        pendingKeysRef.current.delete(key);
        setPendingKeys(new Set(pendingKeysRef.current));
      }
    })();
  };

  return (
    <div className="confirmation-queue">
      {visibleItems.map((item) => {
        const key = `${item.trainee.id}:${item.taskId}:${item.kind}`;
        const kindLabel = item.kind === "ACTION" ? "Action" : "Drill";
        const label = `${item.trainee.name}第 ${item.day} 天 ${kindLabel}`;
        return (
          <article aria-label={`${label} 确认`} className="confirmation-queue__item" key={key}>
            <div className="confirmation-queue__meta">
              <Badge variant={item.kind === "ACTION" ? "action" : "drill"}>
                {item.kind === "ACTION" ? "Action · 干" : "Drill · 练"}
              </Badge>
              <span>Day {item.day}</span>
              <Link href={`/progress/${item.trainee.id}`}>{item.trainee.name} · {item.trainee.employeeId}</Link>
            </div>
            <h2>{item.task}</h2>
            <p>{item.content}</p>
            <div className="confirmation-queue__actions">
              <Button
                aria-label={`确认${label}`}
                disabled={pendingKeys.has(key)}
                onClick={() => toggle(item)}
                size="sm"
                variant="primary"
              >
                确认完成
              </Button>
              {feedback[key] ? (
                <span
                  className={feedback[key].kind === "error" ? "confirmation-queue__feedback confirmation-queue__feedback--error" : "confirmation-queue__feedback"}
                  role={feedback[key].kind === "error" ? "alert" : "status"}
                >
                  {feedback[key].message}
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
