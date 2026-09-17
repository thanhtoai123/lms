import Link from "next/link";
import { ENROLLMENT_STATUS_VI, REPORT_CARD_STATUS_VI, type EnrollmentStatus, type ReportCardStatus } from "@satarobo/core";

export const STUDENT_STATUS_VI: Record<string, string> = {
  prospect: "Tiềm năng",
  trial: "Học thử",
  active: "Đang học",
  paused: "Bảo lưu",
  alumni: "Đã học xong",
  withdrawn: "Đã nghỉ",
};
const STUDENT_CHIP: Record<string, string> = {
  prospect: "bg-slate-100 text-slate-700",
  trial: "bg-fuchsia-100 text-fuchsia-800",
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  alumni: "bg-sky-100 text-sky-800",
  withdrawn: "bg-red-100 text-red-700",
};
export function StudentStatusChip({ status }: { status: string }) {
  return <span className={`chip ${STUDENT_CHIP[status] ?? "bg-black/5"}`}>{STUDENT_STATUS_VI[status] ?? status}</span>;
}

const ENR_CHIP: Record<EnrollmentStatus, string> = {
  trial: "bg-fuchsia-100 text-fuchsia-800",
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  completed: "bg-sky-100 text-sky-800",
  withdrawn: "bg-red-100 text-red-700",
};
export function EnrollmentChip({ status }: { status: EnrollmentStatus }) {
  return <span className={`chip ${ENR_CHIP[status]}`}>{ENROLLMENT_STATUS_VI[status]}</span>;
}

export const PARENT_ACCOUNT_VI: Record<string, string> = { none: "Chưa cấp", pending_activation: "Chờ kích hoạt", active: "Đang hoạt động", locked: "Đã khoá" };
const PA_CHIP: Record<string, string> = { none: "bg-slate-100 text-slate-700", pending_activation: "bg-amber-100 text-amber-800", active: "bg-green-100 text-green-800", locked: "bg-red-100 text-red-700" };
export function ParentAccountChip({ status }: { status: string }) {
  return <span className={`chip ${PA_CHIP[status] ?? "bg-black/5"}`}>{PARENT_ACCOUNT_VI[status] ?? status}</span>;
}

export const GENDER_VI: Record<string, string> = { male: "Nam", female: "Nữ", other: "Khác" };
export const RELATION_VI: Record<string, string> = { mother: "Mẹ", father: "Bố", grandmother: "Bà", grandfather: "Ông", guardian: "Người giám hộ", parent: "Phụ huynh" };

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return x.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {desc && <p className="text-sm text-ink-600">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Phân trang GET (giữ các tham số lọc hiện có) */
export function Pager({ basePath, params, page, pageSize, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") u.set(k, v);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-1 text-sm text-ink-600">
      <span>Hiển thị {from}–{to} / {total}</span>
      <div className="flex gap-1">
        {page > 1 ? <Link className="btn-ghost !py-1.5" href={href(page - 1)}>← Trước</Link> : <span className="btn-ghost !py-1.5 opacity-40">← Trước</span>}
        <span className="px-2 py-1.5">Trang {page}/{pages}</span>
        {page < pages ? <Link className="btn-ghost !py-1.5" href={href(page + 1)}>Sau →</Link> : <span className="btn-ghost !py-1.5 opacity-40">Sau →</span>}
      </div>
    </div>
  );
}

export function StatTabs({ basePath, params, active, tabs }: { basePath: string; params: Record<string, string | undefined>; active?: string; tabs: { key: string; label: string; count?: number }[] }) {
  const href = (key: string) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "status" && k !== "page") u.set(k, v);
    if (key) u.set("status", key);
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-black/5 text-sm">
      {tabs.map((t) => (
        <Link key={t.key} href={href(t.key)} className={`whitespace-nowrap border-b-2 px-3 py-2 ${(active ?? "") === t.key ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-600 hover:text-ink-900"}`}>
          {t.label}{t.count !== undefined && <span className="ml-1 text-xs text-ink-400">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{children}</div>;
}
export function OkBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{children}</div>;
}

export const RC_CHIP: Record<ReportCardStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  returned: "bg-red-100 text-red-700",
  approved: "bg-sky-100 text-sky-800",
  published: "bg-green-100 text-green-800",
};
export function ReportCardChip({ status }: { status: ReportCardStatus }) {
  return <span className={`chip ${RC_CHIP[status]}`}>{REPORT_CARD_STATUS_VI[status]}</span>;
}

export function NoAccess({ title, perm }: { title: string; perm: string }) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <div className="card p-6 text-sm text-ink-600">
        Tài khoản của bạn chưa có quyền xem mục này (<code className="font-mono text-xs">{perm}</code>). Liên hệ Quản trị hệ thống nếu cần cấp quyền.
      </div>
    </div>
  );
}
