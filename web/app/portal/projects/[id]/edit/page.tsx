import ProjectEditClient from './project-edit-client';

type ProjectEditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectEditPage({ params }: ProjectEditPageProps) {
  const { id } = await params;
  return <ProjectEditClient projectId={id} />;
}
