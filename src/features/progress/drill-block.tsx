import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface DrillBlockProps {
  content: string | null;
  submitted: boolean;
  confirmed: boolean;
  canSubmit: boolean;
  canConfirm: boolean;
  pending?: boolean;
  onToggleSubmission?: () => void;
  onToggleConfirmation?: () => void;
}

export function DrillBlock({
  content,
  submitted,
  confirmed,
  canSubmit,
  canConfirm,
  pending = false,
  onToggleSubmission,
  onToggleConfirmation,
}: DrillBlockProps) {
  if (!content?.trim()) {
    return null;
  }

  return (
    <section className={confirmed ? "task-block task-block--drill task-block--confirmed" : "task-block task-block--drill"} aria-label="Drill 演练任务">
      <div className="task-block__heading">
        <h3>Drill · 练</h3>
        <Badge variant={confirmed ? "success" : submitted ? "warning" : "drill"}>
          {confirmed ? "导师已确认" : submitted ? "待导师确认" : "未提交"}
        </Badge>
      </div>
      <p>{content.trim()}</p>
      <div className="task-block__actions">
        {canSubmit && !confirmed ? (
          <Button
            aria-label={submitted ? "撤回 Drill 完成提交" : "提交 Drill 已完成"}
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
            aria-label={confirmed ? "撤销 Drill 确认" : "确认 Drill"}
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
