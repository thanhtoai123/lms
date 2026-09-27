import { SessionWorkflow } from "./workflow";

export default async function TeacherSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="mx-auto w-full max-w-3xl"><SessionWorkflow sessionId={id} /></div>;
}
