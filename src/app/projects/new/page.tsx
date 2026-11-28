import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useProjectStore } from '@/modules/projects';
import { Spinner } from '@/shared/components/ui/Spinner';

export default function NewProjectPage() {
  const navigate = useNavigate();
  const createProject = useProjectStore((s) => s.createProject);
  const isCreatingRef = useRef(false);

  useEffect(() => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;

    async function initializeNewProject() {
      try {
        const project = await createProject('Untitled video', {
          width: 1920,
          height: 1080,
          aspectRatio: '16:9',
          fps: 30,
          backgroundColor: '#000000',
        });
        navigate(`/editor?project=${project.id}`, { replace: true });
      } catch (err) {
        console.error('Failed to create project:', err);
        isCreatingRef.current = false;
      }
    }

    initializeNewProject();
  }, [createProject, navigate]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-studio-bg text-studio-fg">
      <Spinner size="lg" label="Setting up new video project..." />
      <p className="mt-4 text-sm text-studio-muted">Setting up workspace...</p>
    </div>
  );
}
