"use client";

import { useRouter } from "next/navigation";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";

export function StudentChooser({ current }: { current: PickedStudent | null }) {
  const router = useRouter();
  return (
    <div className="card max-w-xl p-4">
      <div className="label">Học viên</div>
      <StudentPicker value={current} onChange={(s) => router.push(s ? `/hoc-ba?student=${s.id}` : "/hoc-ba")} />
    </div>
  );
}
