import { UI_TEXT } from "@/config/ui-text.config";
import type { ProgressSummary } from "@/domain/progress/types";

const percentage = (rate: number | null): string =>
  rate === null ? UI_TEXT.noTasks : `${Math.round(rate * 100)}%`;

export interface StatsGridProps {
  summary: ProgressSummary;
  currentDay: number;
  durationDays: number;
}

export function StatsGrid({ summary, currentDay, durationDays }: StatsGridProps) {
  const learnPercent = Math.round((summary.learn.rate ?? 0) * 100);
  const remainingDays = Math.max(0, durationDays - currentDay);
  const cards = [
    {
      label: UI_TEXT.learnRate,
      value: percentage(summary.learn.rate),
      detail: `${summary.learn.numerator} / ${summary.learn.denominator} 项`,
      extra: `重点 ${summary.focus.dimension} ${percentage(summary.focus.learn.rate)}`,
    },
    {
      label: UI_TEXT.dueCompletion,
      value: percentage(summary.due.rate),
      detail: `${summary.due.numerator} / ${summary.due.denominator} 项`,
      extra: summary.overdueCount > 0 ? `${summary.overdueCount} 项逾期` : "当前无逾期",
    },
    {
      label: UI_TEXT.drillCompletion,
      value: percentage(summary.drill.rate),
      detail: `${summary.drill.numerator} / ${summary.drill.denominator} 项`,
    },
    {
      label: UI_TEXT.actionCompletion,
      value: percentage(summary.action.rate),
      detail: `${summary.action.numerator} / ${summary.action.denominator} 项`,
    },
    {
      label: UI_TEXT.trainingDay,
      value: `第 ${currentDay} 天`,
      detail: `共 ${durationDays} 天`,
      extra: `剩余 ${remainingDays} 天`,
    },
  ];

  return (
    <section aria-label="培养进度统计" className="progress-summary">
      <ul className="stats-grid">
        {cards.map((card) => (
          <li className="stat-card" key={card.label}>
            <span className="stat-card__label">{card.label}</span>
            <strong className="stat-card__value">{card.value}</strong>
            <span className="stat-card__detail">{card.detail}</span>
            {card.extra ? <span className="stat-card__extra">{card.extra}</span> : null}
          </li>
        ))}
      </ul>
      <div
        aria-label={UI_TEXT.learningProgress}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={learnPercent}
        className="progress-bar"
        role="progressbar"
      >
        <span style={{ width: `${learnPercent}%` }} />
      </div>
    </section>
  );
}
