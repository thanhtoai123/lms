import { Scanner } from "./scanner";

export const metadata = { title: "Quét thẻ điểm danh" };

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Scanner sessionId={id} />;
}
