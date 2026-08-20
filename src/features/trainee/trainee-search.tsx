import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const normalizeTraineeSearch = (value: string | string[] | undefined): string => {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim().slice(0, 80) ?? "";
};

export function TraineeSearch({
  action,
  query,
}: {
  action: string;
  query: string;
}) {
  return (
    <form action={action} className="trainee-search" method="get" role="search">
      <div className="trainee-search__field">
        <Label htmlFor="trainee-search-query">搜索新人</Label>
        <Input
          defaultValue={query}
          id="trainee-search-query"
          name="query"
          placeholder="输入姓名或工号"
          type="search"
        />
      </div>
      <Button type="submit">搜索</Button>
      {query ? <Link className="trainee-search__reset" href={action}>清除搜索</Link> : null}
    </form>
  );
}
