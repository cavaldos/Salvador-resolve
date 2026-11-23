import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface PropertySectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Start collapsed (default: true) */
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  /** Optional action element rendered on the right side of the header */
  action?: React.ReactNode;
}

/** Window event other surfaces (e.g. the timeline Crop action) dispatch to expand and scroll to a section by title. */
export const FOCUS_PROPERTY_SECTION_EVENT = "salvador:focus-property-section";

export const PropertySection: React.FC<PropertySectionProps> = ({ title, icon, defaultCollapsed = true, children, action }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFocusRequest = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== title) return;
      setCollapsed(false);
      requestAnimationFrame(() =>
        rootRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }),
      );
    };
    window.addEventListener(FOCUS_PROPERTY_SECTION_EVENT, onFocusRequest);
    return () => window.removeEventListener(FOCUS_PROPERTY_SECTION_EVENT, onFocusRequest);
  }, [title]);

  return (
    <div ref={rootRef} data-property-section={title} className="rounded-xl border border-border-default hover:border-border-hover bg-surface-elevated/40 backdrop-blur-xs overflow-hidden transition-all shadow-xs">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-surface-hover transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-accent-primary">{icon}</span>}
          <span className="text-[11px] font-semibold text-text-primary tracking-wide">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
          <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
        </div>
      </button>

      {/* Collapsible Content */}
      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-3 pb-3 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
};
