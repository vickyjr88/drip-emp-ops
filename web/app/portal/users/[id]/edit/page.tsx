import UserFormClient from '../../user-form-client';

type EditUserPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditUserPage({ params }: EditUserPageProps) {
  const { id } = await params;
  return <UserFormClient mode="edit" userId={id} />;
}
