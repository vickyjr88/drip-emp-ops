import CustomerFormClient from '../../customer-form-client';

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const { id } = await params;
  return <CustomerFormClient mode="edit" customerId={id} />;
}
