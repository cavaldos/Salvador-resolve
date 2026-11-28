import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { TabList, TabTrigger, Tabs } from "@/shared/components/ui/Tabs";

export const inspectorValueClass = "min-w-0 w-[4.75rem] rounded-md border border-studio-border bg-studio-bg px-2 py-1.5 text-right text-xs tabular-nums text-studio-fg";
export const inspectorSliderStyle = {
  fillClassName: "bg-cyan-500 dark:bg-cyan-400",
  thumbClassName: "size-3 border-cyan-600 bg-cyan-600 shadow-none dark:border-cyan-400 dark:bg-cyan-400 dark:shadow-none",
};

export function InspectorSegments({ label, items, active = items[0], onChange }: {
  label: string;
  items: string[];
  active?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <Tabs defaultValue={items[0]} value={active} onValueChange={onChange}>
      <TabList aria-label={label} className="flex w-full gap-0.5 bg-studio-panel-raised/65 p-0.5">
        {items.map((item) => {
          const locked = !onChange && item !== active;
          return (
            <TabTrigger key={item} value={item} disabled={locked} className={cn(
              "min-h-7 min-w-0 flex-1 gap-1 px-1 text-center text-[11px] leading-tight focus-visible:ring-1 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-60",
              item === active && (onChange ? "bg-studio-hover" : "bg-cyan-500 text-[#08252c] dark:bg-cyan-400"),
            )}>
              {item}{locked && <Lock className="size-2.5 shrink-0" aria-label="Not available" />}
            </TabTrigger>
          );
        })}
      </TabList>
    </Tabs>
  );
}

export function InspectorTabLayout({ header, children, onReset }: {
  header: ReactNode;
  children: ReactNode;
  onReset?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="app-custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3">
        {header}
        <div className="mt-3 text-xs">{children}</div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-studio-border p-2.5">
        <button type="button" onClick={onReset} disabled={!onReset} className="rounded-lg border border-studio-border bg-studio-panel-raised px-3 py-1.5 text-xs font-medium enabled:cursor-pointer enabled:hover:bg-studio-hover disabled:opacity-50">Reset</button>
        <span title="Saving clip presets is not available in Salvador">
          <button type="button" disabled className="cursor-not-allowed rounded-lg bg-[#7edbed] px-3 py-1.5 text-xs font-semibold text-[#09252b] opacity-65">Save as preset</button>
        </span>
      </footer>
    </div>
  );
}
