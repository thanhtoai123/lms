import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kết quả tìm kiếm" };

const KINDS = ["student", "lead", "class", "order"] as const;
type Kind = (typeof KINDS)[number];
const KIND_VI: Record<Kind, string> = { student: "Học viên", lead: "Khách hàng (lead)", class: "Lớp học", order: "Đơn hàng" };
const KIND_CHIP: Record<Kind, string> = {
  student: "bg-sky-100 text-sky-800",
  lead: "bg-amber-100 text-amber-800",
  class: "bg-violet-100 text-violet-800",
  order: "bg-green-100 text-green-800",
};
const PER = 20;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; page?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor) return <NoAccess title="Kết quả tìm kiếm" perm="system:read" />;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const kind = KINDS.includes(sp.kind as Kind) ? (sp.kind as Kind) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  type Result = Awaited<ReturnType<Awaited<ReturnType<typeof getServerCaller>>["caller"]["system"]["search"]>>;
  const data: Result = q.length >= 2 ? await caller.system.search({ q, kind, perKind: PER, page }) : { q, hits: [], page, perKind: PER, hasMore: false };
  const qs = (nextPage: number) => {
    const p = new URLSearchParams({ q });
    if (kind) p.set("kind", kind);
    if (nextPage > 1) p.set("page", String(nextPage));
    return p.toString();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kết quả tìm kiếm"
        desc="Tìm học viên, khách hàng (lead), lớp học và đơn hàng theo quyền và cơ sở của bạn. Số điện thoại dùng để khớp nhưng luôn hiển thị đã che."
      />

      <form className="card flex flex-wrap items-end gap-2 p-3" action="/search">
        <label className="flex-1 text-xs text-ink-600">Từ khoá (tên, mã học viên, mã lớp, mã đơn, số điện thoại)
          <input name="q" defaultValue={q} className="input mt-1 w-full" placeholder="Ví dụ: Minh An, CS1.SATA4, DH26-000045, 0912345678" maxLength={80} autoFocus />
        </label>
        <label className="text-xs text-ink-600">Loại
          <select name="kind" defaultValue={kind ?? ""} className="input mt-1 !py-1.5">
            <option value="">Tất cả</option>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_VI[k]}</option>)}
          </select>
        </label>
        <button className="btn-primary">Tìm</button>
      </form>

      {q.length < 2 ? (
        <Empty>Gõ ít nhất 2 ký tự để tìm. Mẹo: nhấn <kbd className="rounded border border-black/10 px-1">Ctrl</kbd>+<kbd className="rounded border border-black/10 px-1">K</kbd> ở bất kỳ trang nào để mở bảng tìm nhanh.</Empty>
      ) : data.hits.length === 0 ? (
        <Empty>Không tìm thấy kết quả cho “{q}”{kind ? ` trong ${KIND_VI[kind]}` : ""}{page > 1 ? " ở trang này" : ""}.</Empty>
      ) : (
        <>
          <p className="text-sm text-ink-600">{data.hits.length} kết quả cho <b>“{q}”</b>{kind ? ` · lọc theo ${KIND_VI[kind]}` : ""}{page > 1 ? ` · trang ${page}` : ""}</p>
          {KINDS.filter((k) => data.hits.some((h) => h.kind === k)).map((k) => {
            const rows = data.hits.filter((h) => h.kind === k);
            return (
              <section key={k} className="card">
                <h2 className="flex items-center gap-2 border-b border-black/5 p-3 font-semibold">
                  <span className={`chip ${KIND_CHIP[k]}`}>{KIND_VI[k]}</span>
                  <span className="text-xs font-normal text-ink-400">{rows.length} kết quả</span>
                  {!kind && <Link href={`/search?q=${encodeURIComponent(q)}&kind=${k}`} className="ml-auto text-xs text-brand-600">Chỉ xem loại này →</Link>}
                </h2>
                <ul className="divide-y divide-black/5">
                  {rows.map((h) => (
                    <li key={`${h.kind}:${h.id}`}>
                      <Link href={h.href} className="block p-3 hover:bg-black/5">
                        <div className="font-medium">{h.title}</div>
                        <div className="text-xs text-ink-600">{h.sub}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {q.length >= 2 && (page > 1 || data.hasMore) && (
        <div className="flex items-center justify-between text-sm">
          {page > 1
            ? <Link className="btn-ghost" href={`/search?${qs(page - 1)}`}>← Trang trước</Link>
            : <span />}
          <span className="text-ink-400">Trang {page}</span>
          {data.hasMore
            ? <Link className="btn-ghost" href={`/search?${qs(page + 1)}`}>Trang sau →</Link>
            : <span />}
        </div>
      )}
    </div>
  );
}
