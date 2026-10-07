"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Mod = { key: string; label: string; desc: string; on: boolean; defaultOn: boolean; affects: string[] };

/**
 * Bật / tắt module — ẩn các nhóm ít dùng khỏi menu để người dùng không bị ngợp.
 * Chỉ ẩn / hiện MENU: dữ liệu giữ nguyên, trang vẫn mở được bằng đường dẫn, quyền không đổi.
 */
export function ModulesForm({ initial, canEdit, updatedLine }: { initial: Mod[]; canEdit: boolean; updatedLine: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries(initial.map((m) => [m.key, m.on])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = initial.some((m) => state[m.key] !== m.on);

  const save = useMutation(trpc.admin.saveModules.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: r.changed.length ? "Đã lưu — menu đổi theo ngay." : "Không có thay đổi." }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));

  return (
    <section className="card space-y-3 p-4" aria-labelledby="modules-h">
      <div>
        <h2 id="modules-h" className="text-base font-semibold">Bật / tắt module</h2>
        <p className="text-sm text-ink-600">
          Ẩn những nhóm trung tâm chưa dùng khỏi menu cho gọn. Dữ liệu và quyền giữ nguyên; bật lại lúc nào cũng được.{updatedLine ? ` ${updatedLine}` : ""}
        </p>
      </div>
      <ul className="divide-y divide-black/5">
        {initial.map((m) => (
          <li key={m.key} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{m.label}</div>
              <div className="text-xs text-ink-600">{m.desc}</div>
              {m.affects.length > 0 && <div className="mt-0.5 text-[11px] text-ink-500">Menu: {m.affects.join(", ")}</div>}
            </div>
            <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={!!state[m.key]}
                disabled={!canEdit || save.isPending}
                onChange={(e) => { setMsg(null); setState((s) => ({ ...s, [m.key]: e.target.checked })); }}
                aria-label={`Bật ${m.label}`}
              />
              {state[m.key] ? "Đang bật" : "Đang tắt"}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={!canEdit || !dirty || save.isPending} onClick={() => { setMsg(null); save.mutate({ state }); }}>
          {save.isPending ? "Đang lưu…" : "Lưu"}
        </button>
        {!canEdit && <span className="text-xs text-ink-600">Chỉ Quản trị hệ thống được đổi.</span>}
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
