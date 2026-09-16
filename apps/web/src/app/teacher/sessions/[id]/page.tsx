import { SessionWorkflow } from "./workflow";

export default async function TeacherSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionWorkflow sessionId={id} />;
}
