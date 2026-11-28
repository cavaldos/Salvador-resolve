import {
  Check,
  ChevronDown,
  Clapperboard,
  LayoutGrid,
  Monitor,
  PanelLeft,
  PanelRight,
  Rows3,
} from "lucide-react";
import { useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@/shared/components/ui/DropdownMenu";
import {
  workspaceLayouts,
  type WorkspaceLayout,
} from "../shell/workspaceLayouts";

const icons = {
  studio: LayoutGrid,
  "tall-player-right": PanelRight,
  "tall-player-left": PanelLeft,
  "timeline-focus": Rows3,
  "cinema-preview": Monitor,
  "inspector-focus": Clapperboard,
};

const layouts = Object.keys(workspaceLayouts) as WorkspaceLayout[];

export function WorkspaceLayoutMenu() {
  const current = useEditorUIStore((state) => state.workspaceLayout);
  const apply = useEditorUIStore((state) => state.applyWorkspaceLayout);
  return (
    <DropdownMenu
      align="right"
      keyboardNavigation
      className="w-72 max-h-[calc(100dvh-20px)] overflow-y-auto"
      trigger={(open) => (
        <button
          type="button"
          title="Workspace Layouts"
          aria-label="Workspace Layouts"
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs text-studio-muted hover:bg-studio-hover hover:text-studio-fg aria-expanded:bg-studio-hover"
        >
          <LayoutGrid className="size-3.5" />
          Workspace Layouts
          <ChevronDown className="size-3 opacity-70" />
        </button>
      )}
    >
      <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold text-studio-muted">
        Choose your editing workspace
      </p>
      {layouts.map((layout) => {
        const Icon = icons[layout];
        const active = current === layout;
        const { label, description } = workspaceLayouts[layout];
        return (
          <DropdownMenuItem
            key={layout}
            role="menuitemradio"
            aria-checked={active}
            aria-label={label}
            className="min-h-10"
            onClick={() => apply(layout, window.innerHeight)}
          >
            <Icon className="size-4 shrink-0 text-studio-muted" />
            <span className="flex flex-1 flex-col gap-0.5">
              <span>{label}</span>
              <span className="text-[11px] font-normal text-studio-muted">
                {description}
              </span>
            </span>
            {active && <Check className="size-4 shrink-0 text-brand" />}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenu>
  );
}
