import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import AppLoading from "@/app/loading";
import EditorLoading from "@/app/editor/loading";
import ProjectsLoading from "@/app/projects/loading";
import NotFound from "@/app/not-found";
import { NativeContextMenuBlocker } from "@/shared/components/providers/NativeContextMenuBlocker";
import { ToastContainer } from "@/shared/components/ui/Toast/ToastContainer";
import "@/styles/globals.css";

const LandingPage = lazy(() => import("@/app/(landing)/page"));
const ProjectsPage = lazy(() => import("@/app/projects/page"));
const NewProjectPage = lazy(() => import("@/app/projects/new/page"));
const EditorPage = lazy(() => import("@/app/editor/page"));

function WorkspaceMetadata({ title }: { title: string }) {
  return (
    <>
      <title>{`${title} · Cutnora`}</title>
      <meta name="robots" content="noindex, follow" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <NativeContextMenuBlocker />
    <Routes>
      <Route path="/" element={
        <Suspense fallback={<AppLoading />}><LandingPage /></Suspense>
      } />
      <Route path="/projects" element={
        <Suspense fallback={<ProjectsLoading />}>
          <WorkspaceMetadata title="Local projects" />
          <ProjectsPage />
        </Suspense>
      } />
      <Route path="/projects/new" element={
        <Suspense fallback={<ProjectsLoading />}>
          <WorkspaceMetadata title="Local projects" />
          <NewProjectPage />
        </Suspense>
      } />
      <Route path="/editor" element={
        <Suspense fallback={<EditorLoading />}>
          <WorkspaceMetadata title="Video editor" />
          <EditorPage />
        </Suspense>
      } />
      <Route path="*" element={<NotFound />} />
    </Routes>
    <ToastContainer />
  </BrowserRouter>,
);
