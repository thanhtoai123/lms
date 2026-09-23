import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { PlanActions, PlanPicker, PlanUpload } from "@/components/lesson-plan-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "SCORM / Giáo án buổi học" };

type SP = { khoa?: string; buoi?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GIÁO ÁN CỦA TỪNG BUỔI HỌC — chọn khoá → buổi → xem / thay giáo án.
 * Mỗi buổi giữ đúng một giáo án (slide PDF hoặc gói SCORM), cả hai chiếu cùng một khung.
 * Lựa chọn nằm trên URL (?khoa=&buoi=) nên dán link cho đồng nghiệp là mở đúng buổi đó.
 */
export default async function LessonPlanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "document:read")) return <NoAccess title="SCORM / Giáo án buổi học" perm="document:read" />;
  const courseId = sp.khoa && UUID.test(sp.khoa) ? sp.khoa : "";
  const lessonId = sp.buoi && UUID.test(sp.buoi) ? sp.buoi : "";

  const courses = await caller.content.planCourses();
  const lessons = courseId ? await caller.content.planLessons({ courseId }) : null;
  const plan = lessonId ? await caller.content.plan({ lessonId }) : null;
  // Nhật ký mở + thao tác nghi vấn sao chép (chỉ người được sửa học liệu mới xem được)
  const report = lessonId && plan?.canEdit ? await caller.content.planAccessReport({ lessonId }) : null;
  const q = (over: SP) => {
    const p = new URLSearchParams();
    const k = over.khoa ?? courseId;
    const b = over.buoi ?? "";
    if (k) p.set("khoa", k);
    if (b) p.set("buoi", b);
    return p.size ? `/scorm?${p.toString()}` : "/scorm";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="SCORM / Giáo án buổi học"
        desc="Giáo án của từng buổi: một buổi giữ đúng một bản đang dùng — slide PDF hoặc gói SCORM."
        actions={<Link href="/teaching-materials" className="btn-ghost">Kho học liệu</Link>}
      />

      <details className="card px-4 py-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Hướng dẫn dùng trang này</summary>
        <div className="space-y-1 pt-2 text-ink-600">
          <p>Chọn <b>khoá học</b> → <b>buổi học</b> để xem hoặc đổi giáo án. Mỗi buổi chỉ giữ 1 giáo án: đẩy bản mới sẽ thay bản cũ <b>sau khi xử lý xong</b>, nên buổi dạy không bao giờ trống giữa chừng.</p>
          <p>Gói SCORM là tệp <b>.zip</b> có <code className="font-mono text-xs">imsmanifest.xml</code> (SCORM 1.2 hoặc 2004), tối đa 200MB. Slide là tệp <b>.pdf</b>, tối đa 100MB.</p>
          <p>Bản tải lên bị kẹt quá 15 phút coi như hỏng — bấm <b>Dọn bản lỗi</b> rồi đẩy lại, không cần gọi kỹ thuật.</p>
          <p><b>Chiếu bài mà không cho quay màn hình:</b> mở bằng ứng dụng <b>Trình chiếu an toàn</b> (thư mục <code className="font-mono text-xs">tools/trinh-chieu</code>) — cửa sổ đó hiện <b>màn đen</b> trong mọi phần mềm quay/chụp và chia sẻ màn hình. Mở bằng trình duyệt thì chỉ có chữ mờ + nhật ký, trình duyệt không chặn được phần mềm quay.</p>
          <p>Giáo viên xem giáo án của buổi mình dạy trong <Link href="/teacher" className="text-brand-600 underline">app giáo viên</Link>; mọi lượt mở đều được ghi nhật ký.</p>
        </div>
      </details>

      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-600">
          Khoá học
          <div className="mt-1">
            <PlanPicker name="khoa" value={courseId} placeholder="— Chọn khoá học —" options={courses.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))} />
          </div>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-600">
          Buổi học
          <div className="mt-1">
            <PlanPicker
              name="buoi"
              value={lessonId}
              placeholder={courseId ? "— Chọn buổi học —" : "— Chọn khoá học trước —"}
              otherName="khoa"
              otherValue={courseId}
              options={(lessons?.items ?? []).map((l) => ({ id: l.id, label: `Buổi ${l.sequenceNo}: ${l.title}${l.hasPlan ? "" : " · chưa có giáo án"}` }))}
            />
          </div>
        </label>
        {lessons && (
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3 text-xs text-ink-600">
            <span>Khung chương trình: <b>{lessons.curriculumName ?? "—"}</b></span>
            <span aria-hidden>·</span>
            <span>Đã có giáo án <b>{lessons.coverage.done}/{lessons.coverage.total}</b> buổi ({lessons.coverage.percent}%)</span>
            <div className="h-2 w-32 overflow-hidden rounded bg-black/10" aria-hidden>
              <div className="h-full bg-brand-600" style={{ width: `${lessons.coverage.percent}%` }} />
            </div>
            {lessons.firstMissing && <Link href={q({ buoi: lessons.firstMissing })} className="text-brand-600 underline">Tới buổi chưa có giáo án</Link>}
          </div>
        )}
      </div>

      {!lessonId || !plan ? (
        <div className="card p-6 text-sm text-ink-600">Chọn khoá học và buổi học để xem giáo án.</div>
      ) : (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Giáo án — Buổi {plan.lesson.sequenceNo}: {plan.lesson.title}</h2>
            <Link href={q({ buoi: lessonId })} className="btn-ghost !py-1">Làm mới</Link>
          </div>

          {plan.plan ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-600/30 bg-green-50 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{plan.plan.title}</span>
                  <span className="chip bg-brand-600/10 text-brand-600">{plan.plan.kindLabel}</span>
                  <span className="chip bg-green-600/10 text-green-700">Đang dùng</span>
                </div>
                <div className="text-xs text-ink-600">
                  {plan.plan.kind === "scorm" ? `SCORM ${plan.plan.scormVersion ?? "1.2"} · ${plan.plan.fileCount ?? 0} tệp` : "Slide PDF"}
                  {" · "}{plan.plan.sizeLabel} · v{plan.plan.version}
                  {plan.plan.byName ? ` · ${plan.plan.byName}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/scorm/buoi/${lessonId}`} className="btn-primary !py-1">Xem thử</Link>
                {plan.canEdit && (
                  <PlanActions
                    lessonId={lessonId}
                    canClean={plan.problems.some((p) => p.cleanable)}
                    canRemove
                    restoreVersion={plan.previous?.version ?? null}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/20 p-4 text-sm text-ink-600">
              Buổi này chưa có giáo án. {plan.canEdit ? "Đẩy tệp .pdf hoặc .zip bên dưới." : "Liên hệ bộ phận Đào tạo để bổ sung."}
            </div>
          )}

          {plan.problems.map((p) => (
            <div key={p.version} className="flex flex-wrap items-center gap-3 rounded-lg border border-red-600/30 bg-red-50 p-3 text-sm text-red-700">
              <span className="flex-1">Bản <b>{p.fileName}</b> (v{p.version}) — {p.label}: {p.message}</span>
              {plan.canEdit && p.cleanable && <PlanActions lessonId={lessonId} canClean canRemove={false} restoreVersion={null} />}
            </div>
          ))}

          {plan.previous && (
            <p className="text-xs text-ink-600">
              Bản liền trước còn giữ: v{plan.previous.version} · {plan.previous.sizeLabel} · {new Date(plan.previous.uploadedAt).toLocaleString("vi-VN")} — bấm “Dùng lại bản {plan.previous.version}” nếu bản mới sai.
            </p>
          )}

          {plan.canEdit && <PlanUpload lessonId={lessonId} hasPlan={!!plan.plan} />}

          {plan.canEdit && report && (
            <details className="rounded-lg border border-black/10 p-3 text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
                Nhật ký xem & nghi vấn sao chép (30 ngày)
                {report.attempts.length > 0 && <span className="chip ml-2 bg-red-600/10 text-red-700">{report.attempts.length} thao tác nghi vấn</span>}
              </summary>
              <div className="grid gap-4 pt-3 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-600">Lượt mở gần nhất</h3>
                  {report.opens.length === 0 ? <p className="text-ink-600">Chưa có ai mở.</p> : (
                    <ul className="space-y-1 text-xs text-ink-600">
                      {report.opens.slice(0, 8).map((o, i) => (
                        <li key={i}>{new Date(o.at).toLocaleString("vi-VN")} — {o.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-600">Thao tác nghi vấn</h3>
                  {report.attempts.length === 0 ? <p className="text-ink-600">Không có.</p> : (
                    <>
                      <ul className="space-y-1 text-xs text-red-700">
                        {report.attempts.slice(0, 8).map((a, i) => (
                          <li key={i}>{new Date(a.at).toLocaleString("vi-VN")} — {a.name}: {a.kindLabel}</li>
                        ))}
                      </ul>
                      <ul className="mt-2 space-y-0.5 text-xs text-ink-600">
                        {report.byUser.map((u, i) => <li key={i}>{u.name}: {u.count} lần — {u.label}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              </div>
              <p className="pt-2 text-xs text-ink-600">
                Trình duyệt không chặn được quay màn hình hay chụp bằng điện thoại. Hệ thống chặn các đường sao chép dễ,
                dán chữ mờ tên người xem lên khung chiếu và ghi lại mọi thao tác nghi vấn ở đây để xử lý theo quy định nội bộ.
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
