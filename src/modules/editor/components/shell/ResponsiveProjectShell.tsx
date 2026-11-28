import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";
import { usePlaybackStore } from "@/modules/editor/store/usePlaybackStore";
import { useProjectStore } from "@/modules/projects";

const mobileEditorQuery = "(max-width: 1023px)";
let mobileEditorMediaQuery: MediaQueryList | null = null;

const ProjectShell = lazy(() =>
  import("./ProjectShell").then((module) => ({ default: module.ProjectShell })),
);

const MobileProjectShell = lazy(() =>
  import("../mobile/MobileProjectShell").then((module) => ({
    default: module.MobileProjectShell,
  })),
);

function getMobileEditorMediaQuery() {
  if (!mobileEditorMediaQuery) {
    mobileEditorMediaQuery = window.matchMedia(mobileEditorQuery);
  }
  return mobileEditorMediaQuery;
}

function subscribeToMobileEditor(callback: () => void) {
  const query = getMobileEditorMediaQuery();
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getMobileEditorSnapshot() {
  return getMobileEditorMediaQuery().matches;
}

function ProjectShellLoading() {
  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-studio-bg text-xs font-medium text-studio-muted">
      Opening workspace…
    </div>
  );
}

export function ResponsiveProjectShell() {
  const isMobileEditor = useSyncExternalStore(
    subscribeToMobileEditor,
    getMobileEditorSnapshot,
  );
  const projectFps = useProjectStore(
    (state) => state.currentProject?.settings.fps ?? 30,
  );
  const setPlaybackFps = usePlaybackStore((state) => state.setFps);

  useEffect(() => {
    setPlaybackFps(projectFps);
  }, [projectFps, setPlaybackFps]);

  return (
    <Suspense fallback={<ProjectShellLoading />}>
      {isMobileEditor ? <MobileProjectShell /> : <ProjectShell />}
    </Suspense>
  );
}

export const ResponsiveStudioShell = ResponsiveProjectShell;
