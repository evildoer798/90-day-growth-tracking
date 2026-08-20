import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ActionBlockProps {
  content: string | null;
  submitted: boolean;
  confirmed: boolean;
  canSubmit: boolean;
  canConfirm: boolean;
  pending?: boolean;
  onToggleSubmission?: () => void;
  onToggleConfirmation?: () => void;
}

export function ActionBlock({
  content,
  submitted,
  confirmed,
  canSubmit,
  canConfirm,
  pending = false,
  onToggleSubmission,
  onToggleConfirmation,
}: ActionBlockProps) {
  if (!content?.trim()) {
    return null;
  }

  return (
    <section className={confirmed ? "task-block task-block--action task-block--confirmed" : "task-block task-block--action"} aria-label="Action 实践任务">
      <div className="task-block__heading">
        <h3>Action · 干</h3>
        <Badge variant={confirmed ? "success" : submitted ? "warning" : "action"}>
          {confirmed ? "导师已确认" : submitted ? "待导师确认" : "未提交"}
        </Badge>
      </div>
      <p>{content.trim()}</p>
      <div className="task-block__actions">
        {canSubmit && !confirmed ? (
          <Button
            aria-label={submitted ? "撤回 Action 完成提交" : "提交 Action 已完成"}
            disabled={pending}
            onClick={onToggleSubmission}
            size="sm"
            variant={submitted ? "secondary" : "primary"}
          >
            {submitted ? "撤回提交" : "完成并提交"}
          </Button>
        ) : null}
        {canConfirm && submitted ? (
          <Button
            aria-label={confirmed ? "撤销 Action 确认" : "确认 Action"}
            disabled={pending}
            onClick={onToggleConfirmation}
            size="sm"
            variant="secondary"
          >
            {confirmed ? "撤销确认" : "导师确认"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
