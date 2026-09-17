import Link from "next/link";
import { fmtDateTime } from "@/components/lead-ui";

export type LoginRow = { id: string; at: Date | string; label: string; failed: boolean; ip: string; device: string; who?: string; userId?: string | null };

/** Bảng nhật ký đăng nhập (IP đã che bớt) */
export function LoginHistory({ rows, showWho = false, empty = "Chưa có lần đăng nhập nào được ghi." }: { rows: LoginRow[]; showWho?: boolean; empty?: string }) {
  if (!rows.length) return <div className="p-4 text-sm text-ink-400">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] text-left text-xs uppercase text-ink-400">
          <tr>
            <th className="px-4 py-2">Thời gian</th>
            {showWho && <th className="px-4 py-2">Tài khoản</th>}
            <th className="px-4 py-2">Sự kiện</th>
            <th className="px-4 py-2">Thiết bị</th>
            <th className="px-4 py-2">IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap px-4 py-2 text-ink-600">{fmtDateTime(r.at)}</td>
              {showWho && <td className="px-4 py-2">{r.userId ? <Link href={`/users/${r.userId}`} className="text-brand-600">{r.who}</Link> : <span className="text-ink-600">{r.who}</span>}</td>}
              <td className="px-4 py-2"><span className={`chip ${r.failed ? "bg-red-100 text-red-700" : "bg-black/5 text-ink-600"}`}>{r.label}</span></td>
              <td className="whitespace-nowrap px-4 py-2">{r.device}</td>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-ink-600">{r.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
