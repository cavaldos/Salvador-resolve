import { useState } from "react";
import { Ban, Search, Star } from "lucide-react";
import { InspectorSegments, InspectorTabLayout } from "./InspectorTabLayout";

export function AnimationTab() {
  const [category, setCategory] = useState("In");
  return (
    <InspectorTabLayout header={<InspectorSegments label="Animation categories" items={["In", "Out", "Combo"]} active={category} onChange={setCategory} />}>
      <div className="flex gap-2 text-studio-muted" title="No animation library is available in Cutnora">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden="true" />
          <input type="search" disabled aria-label="Search animations" placeholder="Search animations" className="h-8 w-full rounded-lg border border-studio-border bg-studio-bg pr-2 pl-8 text-xs placeholder:text-studio-muted" />
        </div>
        <button type="button" aria-label="Favorite animations" disabled className="grid size-8 place-items-center rounded-lg border border-studio-border bg-studio-bg"><Star className="size-4" aria-hidden="true" /></button>
      </div>
      <div className="mt-3 flex w-20 flex-col items-center gap-1 text-xs text-studio-muted">
        <span className="grid h-16 w-full place-items-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"><Ban className="size-5" aria-hidden="true" /></span>
        <span>None</span>
      </div>
      <p className="mt-3 text-xs text-studio-muted">No clip animations are available in Cutnora.</p>
    </InspectorTabLayout>
  );
}
