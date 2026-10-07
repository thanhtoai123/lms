/**
 * "CÁC BUỔI TRONG GIAI ĐOẠN" của học bạ mốc — mỗi buổi một dòng (ngày, bài học, kết quả mục tiêu, điểm TB) kèm
 * ẢNH CỦA BUỔI ĐÓ. Ảnh là ảnh đã duyệt có gắn thẻ bé hoặc ảnh cả lớp, chỉ khi phụ huynh đang đồng ý đăng ảnh
 * (máy chủ kiểm lại mỗi lần hiển thị). Không hook → render được ở máy chủ, dùng chung cho xem, in và cổng phụ huynh.
 */
import { Camera, CalendarDays } from "lucide-react";
import { OBJECTIVE_RESULT_VI, type MilestoneSessionView, type ObjectiveResult } from "@satarobo/core";
import { fmtWeekday, num1 } from "./parts";

const OBJ_TONE: Record<ObjectiveResult, string> = {
  achieved: "bg-primary text-white",
  partial: "bg-brand-100 text-primary",
  not_yet: "bg-accent-100 text-accent-700",
};

/** Số ảnh tối đa mỗi buổi: trên màn hình / khi in */
const SCREEN_MAX = 4;
const PRINT_MAX = 3;

export function MilestoneSessions({ sessions, printable = true, dense = false, collapsible = false }: {
  sessions: readonly MilestoneSessionView[];
  /** true = thu gọn sẵn, bấm tiêu đề để mở (hồ sơ nhiều trang đã có phiếu từng buổi bên dưới) */
  collapsible?: boolean;
  /** false = ẩn khi in (khi bản in đã có phiếu từng buổi kèm ảnh ngay sau, tránh in trùng) */
  printable?: boolean;
  dense?: boolean;
}) {
  if (sessions.length === 0) return null;
  const withPhotos = sessions.filter((s) => s.media.length > 0).length;
  const head = (
    <>
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Camera className="h-4 w-4 text-accent-500" aria-hidden /> Các buổi trong giai đoạn</h3>
      <span className="whitespace-nowrap text-xs text-muted-foreground">{sessions.length} buổi · {withPhotos} buổi có ảnh</span>
    </>
  );
  const Wrap = collapsible ? "details" : "section";
  const open = collapsible ? { open: true } : {};
  return (
    <Wrap {...open} className={`hs-sessions space-y-2 ${printable ? "" : "print:hidden"}`} aria-label="Các buổi trong giai đoạn">
      {collapsible
        ? <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">{head}</summary>
        : <div className="flex flex-wrap items-center justify-between gap-2">{head}</div>}
      <ol className="space-y-2 pt-2">
        {sessions.map((s) => (
          <li key={`${s.seq}-${s.date}`} className="hs-avoid rounded-xl border border-border bg-card p-2.5 print:p-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-sm">
                <CalendarDays className="h-4 w-4 shrink-0 text-brand-400" aria-hidden />
                <span className="whitespace-nowrap font-bold text-primary">{s.label}</span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtWeekday(s.date)}</span>
                {s.makeup && <span className="chip whitespace-nowrap bg-accent-500 font-bold text-white">Học bù</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {s.objectiveResult && <span className={`chip whitespace-nowrap px-2 py-0.5 text-[11px] font-bold ${OBJ_TONE[s.objectiveResult]}`}>{OBJECTIVE_RESULT_VI[s.objectiveResult]}</span>}
                {s.average != null && <span className="chip whitespace-nowrap bg-primary/10 font-bold text-primary">TB {num1(s.average)}/4</span>}
              </div>
            </div>
            {s.lessonTitle && <div className="mt-0.5 truncate pl-5 text-xs text-foreground/80">{s.lessonTitle}</div>}
            {s.media.length > 0 ? (
              <div className={`mt-2 grid gap-1.5 ${dense ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4"} print:grid-cols-3`}>
                {s.media.slice(0, SCREEN_MAX).map((m, i) => (
                  <figure key={m.id} className={`relative overflow-hidden rounded-lg border border-border bg-muted ${i >= PRINT_MAX ? "print:hidden" : ""}`}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Xem ảnh ${s.label}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={m.caption ?? (m.classWide ? `Ảnh cả lớp ${s.label}` : `Ảnh của bé ${s.label}`)} loading="lazy" className={`w-full object-cover ${dense ? "h-14" : "h-24 sm:h-28"} print:h-20`} />
                    </a>
                    <span className={`absolute left-1 top-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${m.classWide ? "bg-black/55 text-white" : "bg-primary text-white"}`}>{m.classWide ? "Cả lớp" : "Của bé"}</span>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 pl-5 text-[11px] text-muted-foreground print:hidden">Buổi này chưa có ảnh.</p>
            )}
          </li>
        ))}
      </ol>
    </Wrap>
  );
}
