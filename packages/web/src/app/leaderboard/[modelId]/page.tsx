import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ModelDetailRedirect({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const decoded = decodeURIComponent(modelId);
  redirect(`/models/${encodeURIComponent(decoded)}`);
}
