import { BlockFormClient } from '../../block-form-client';

export default function EditBlockPage({ params }: { params: { id: string } }) {
  return <BlockFormClient blockId={params.id} />;
}
