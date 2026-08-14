import ProjectProgressClient from './project-progress-client';

type ProjectProgressPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectProgressPage({ params }: ProjectProgressPageProps) {
  const { id } = await params;
  return <ProjectProgressClient projectId={id} />;
}
