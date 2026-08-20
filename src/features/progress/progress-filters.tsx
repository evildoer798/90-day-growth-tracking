import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DIMENSIONS } from "@/config/dimensions.config";
import { STAGES } from "@/config/stages.config";
import { UI_TEXT } from "@/config/ui-text.config";
import type { ProgressTaskFilters } from "@/features/progress/filter-tasks";

export interface ProgressFiltersProps {
  traineeId: string;
  filters: ProgressTaskFilters;
}

const STATUS_OPTIONS = [
  ["all", UI_TEXT.allStatuses],
  ["completed", UI_TEXT.completed],
  ["incomplete", UI_TEXT.incomplete],
  ["overdue", UI_TEXT.overdue],
  ["today", UI_TEXT.today],
  ["upcoming", UI_TEXT.upcoming],
] as const;

export function ProgressFilters({ traineeId, filters }: ProgressFiltersProps) {
  const route = `/progress/${encodeURIComponent(traineeId)}`;

  return (
    <form
      action={route}
      aria-label="筛选培养任务"
      className="progress-filters"
      method="get"
      role="search"
    >
      <div className="progress-filter-field">
        <Label htmlFor="progress-stage">{UI_TEXT.stageFilter}</Label>
        <Select defaultValue={filters.stage} id="progress-stage" name="stage">
          <option value="all">{UI_TEXT.allStages}</option>
          {Object.values(STAGES).map(({ code, label }) => (
            <option key={code} value={code}>{code} · {label}</option>
          ))}
        </Select>
      </div>
      <div className="progress-filter-field">
        <Label htmlFor="progress-dimension">{UI_TEXT.dimensionFilter}</Label>
        <Select defaultValue={filters.dimension} id="progress-dimension" name="dimension">
          <option value="all">{UI_TEXT.allDimensions}</option>
          {Object.entries(DIMENSIONS).map(([code, dimension]) => (
            <option key={code} value={code}>{code} · {dimension.name}</option>
          ))}
        </Select>
      </div>
      <div className="progress-filter-field">
        <Label htmlFor="progress-status">{UI_TEXT.statusFilter}</Label>
        <Select defaultValue={filters.status} id="progress-status" name="status">
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>
      <div className="progress-filter-field progress-filter-field--search">
        <Label htmlFor="progress-query">{UI_TEXT.taskSearch}</Label>
        <Input
          defaultValue={filters.query}
          id="progress-query"
          name="query"
          placeholder="任务、Action、Drill 或资料"
          type="search"
        />
      </div>
      <div className="progress-filters__actions">
        <Button type="submit">{UI_TEXT.applyFilters}</Button>
        <Link className="progress-filters__reset" href={route}>
          {UI_TEXT.resetFilters}
        </Link>
      </div>
    </form>
  );
}
