import { redirect } from "next/navigation";
import { TeacherShell } from "@/components/teacher-shell";
import { loadShell } from "@/lib/shell";

export const metadata = { title: "Giáo viên" };
export const dynamic = "force-dynamic";

/**
 * GIAO DIỆN GIÁO VIÊN — cùng khung TeacherShell với các trang nghiệp vụ khi người dùng ở chế độ
 * giáo viên, nên Hôm nay / Lớp của tôi / Chấm công / Thêm luôn nằm trong một giao diện.
 * Mở /teacher là bật chế độ giáo viên (proxy ghi cookie) — người kiêm nhiệm bấm "Chấm công"
 * từ đây cũng vẫn ở lại khung giáo viên.
 */
export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const s = await loadShell();
  if (!s) redirect("/login");
  if (s.mfaPending) redirect("/bao-mat");
  return (
    <div className="admin-scope contents">
      <TeacherShell nav={s.nav} me={s.me} canAdmin={!s.teacherOnly && s.isStaff} idleMinutes={s.idle}>{children}</TeacherShell>
    </div>
  );
}
