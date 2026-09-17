import Link from "next/link";
import { authorizeGlobal, ROLE_LABEL_VI, type Actor, type Role } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, fmtDate } from "@/components/admin-ui";
import { fmtDateTime } from "@/components/lead-ui";
import { LoginHistory } from "@/components/login-history";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bảo mật hệ thống" };

const LEVEL = {
  danger: { cls: "border-red-200 bg-red-50 text-red-800", icon: "⛔", label: "Cần xử lý ngay" },
  warn: { cls: "border-amber-200 bg-amber-50 text-amber-900", icon: "⚠️", label: "Nên xử lý" },
  ok: { cls: "border-green-200 bg-green-50 text-green-800", icon: "✓", label: "Ổn" },
} as const;

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "bad" | "ok" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "bad" ? "text-red-700" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export default async function SystemSecurityPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !authorizeGlobal(ctx.actor as Actor, "system:read")) return <NoAccess title="Bảo mật hệ thống" perm="system:read (Hội sở)" />;
  const d = await caller.system.securityOverview();
  const n = (k: string) => Number((d.counts as Record<string, number>)[k] ?? 0);
  const roleNames = (s: string) => s.split(", ").map((r) => ROLE_LABEL_VI[r as Role] ?? r).join(", ");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bảo mật hệ thống"
        desc="Tình trạng đăng nhập nhân sự, tài khoản cần rà soát và khuyến nghị cấu hình."
        actions={<><Link href="/cau-hinh-van-hanh?tab=otp" className="btn-ghost">Chính sách đăng nhập</Link><Link href="/audit-log" className="btn-ghost">Audit Log</Link></>}
      />

      <section aria-labelledby="findings" className="space-y-2">
        <h2 id="findings" className="sr-only">Khuyến nghị</h2>
        {d.findings.map((f, i) => {
          const l = LEVEL[f.level];
          return (
            <div key={i} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm ${l.cls}`}>
              <span><span aria-hidden className="mr-2">{l.icon}</span><span className="sr-only">{l.label}: </span>{f.text}</span>
              {f.href && <Link href={f.href} className="font-medium underline">Xử lý →</Link>}
            </div>
          );
        })}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Nhân sự đang hoạt động" value={n("activeStaff")} hint={`${n("mfaUsers")} tài khoản đã bật 2 lớp`} />
        <Stat label="Quản trị hệ thống" value={n("superAdmins")} hint={n("superNoMfa") ? `${n("superNoMfa")} chưa bật 2 lớp` : "đều đã bật 2 lớp hoặc chưa dùng Supabase"} tone={n("superAdmins") > 3 ? "bad" : undefined} />
        <Stat label="Đăng nhập sai 24 giờ" value={n("failed24h")} hint={`${n("lockouts24h")} lần bị chặn · ${n("success24h")} lần thành công`} tone={n("lockouts24h") ? "bad" : undefined} />
        <Stat label="Tài khoản đã khoá" value={n("locked")} hint={`${d.dormant.length} tài khoản không đăng nhập > ${d.policy.dormantDays} ngày`} />
      </div>

      <section className="card p-4 text-sm">
        <h2 className="mb-2 font-semibold">Chính sách đang áp dụng</h2>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div><dt className="inline text-ink-400">Bắt buộc 2 lớp: </dt><dd className="inline">{d.policy.mfaRoles.map((r) => ROLE_LABEL_VI[r as Role] ?? r).join(", ") || "không"}</dd></div>
          <div><dt className="inline text-ink-400">Tự đăng xuất khi không thao tác: </dt><dd className="inline">{d.policy.idleMinutes} phút</dd></div>
          <div><dt className="inline text-ink-400">Tạm khoá khi sai mật khẩu: </dt><dd className="inline">{d.policy.maxFails} lần → {d.policy.lockMinutes} phút</dd></div>
          <div><dt className="inline text-ink-400">Mật khẩu: </dt><dd className="inline">≥ 10 ký tự, có chữ và số, không chứa tên email</dd></div>
        </dl>
        <p className="mt-2 text-xs text-ink-400">Vai trò bắt buộc 2 lớp đặt bằng biến môi trường REQUIRE_MFA_ROLES; các mục còn lại ở Cấu hình vận hành → Đăng nhập/OTP.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="border-b border-black/5 px-4 py-3 font-semibold">Tài khoản cần rà soát <span className="font-normal text-ink-400">(không đăng nhập &gt; {d.policy.dormantDays} ngày)</span></h2>
          {d.dormant.length === 0 ? <div className="p-4 text-sm text-ink-400">Không có tài khoản nào.</div> : (
            <ul className="divide-y divide-black/5 text-sm">
              {d.dormant.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span><Link href={`/users/${u.id}`} className="font-medium text-brand-600">{u.name}</Link><span className="block text-xs text-ink-400">{roleNames(u.roles ?? "")}</span></span>
                  <span className="text-xs text-ink-600">{u.lastLoginAt ? `lần cuối ${fmtDate(u.lastLoginAt)}` : `chưa đăng nhập · tạo ${fmtDate(u.createdAt)}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card overflow-hidden">
          <h2 className="border-b border-black/5 px-4 py-3 font-semibold">IP đăng nhập sai nhiều (24 giờ)</h2>
          {d.topIps.length === 0 ? <div className="p-4 text-sm text-ink-400">Không có.</div> : (
            <table className="w-full text-sm">
              <thead className="bg-black/[0.02] text-left text-xs uppercase text-ink-400"><tr><th className="px-4 py-2">IP</th><th className="px-4 py-2 text-right">Lần sai</th><th className="px-4 py-2 text-right">Số tài khoản</th><th className="px-4 py-2">Gần nhất</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {d.topIps.map((t) => (
                  <tr key={`${t.ip}-${t.last}`}><td className="px-4 py-2 font-mono text-xs">{t.ip}</td><td className="px-4 py-2 text-right">{t.fails}</td><td className={`px-4 py-2 text-right ${t.accounts > 3 ? "font-semibold text-red-700" : ""}`}>{t.accounts}</td><td className="px-4 py-2 text-xs text-ink-600">{fmtDateTime(t.last)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-black/5 px-4 py-3 font-semibold">Nhật ký đăng nhập gần đây</h2>
        <LoginHistory rows={d.recent} showWho empty="Chưa có sự kiện đăng nhập." />
      </section>
    </div>
  );
}
