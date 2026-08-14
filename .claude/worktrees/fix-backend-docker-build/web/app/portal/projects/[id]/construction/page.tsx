import ProjectConstructionClient from './project-construction-client';

type ProjectConstructionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectConstructionPage({ params }: ProjectConstructionPageProps) {
  const { id } = await params;
  return <ProjectConstructionClient projectId={id} />;
}
