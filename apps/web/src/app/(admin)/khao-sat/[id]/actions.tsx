"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function SurveyStatusActions({ id, status }: { id: string; status: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.care.setSurveyStatus.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="flex items-center gap-1">
      {status === "draft" && <button className="btn-primary" disabled={m.isPending} onClick={() => m.mutate({ id, status: "active" })}>Kích hoạt</button>}
      {status === "active" && <button className="btn-ghost" disabled={m.isPending} onClick={() => m.mutate({ id, status: "closed" })}>Đóng khảo sát</button>}
      {status === "closed" && <button className="btn-ghost" disabled={m.isPending} onClick={() => m.mutate({ id, status: "active" })}>Mở lại</button>}
      {m.error && <span className="text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}

export function SendSurvey({ id, centers }: { id: string; centers: { id: string; code: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [mode, setMode] = useState<"class" | "center">("class");
  const [classId, setClassId] = useState("");
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cls = useQuery(trpc.academics.classes.list.queryOptions({}));
  const m = useMutation(trpc.care.sendSurvey.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã gửi ${r.created} phụ huynh${r.skipped ? ` · bỏ qua ${r.skipped} đã nhận` : ""}${r.noParent ? ` · ${r.noParent} HV chưa có PH` : ""}` }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const items = (cls.data ?? []).filter((c) => c.status === "running" || c.status === "recruiting");
  return (
    <section className="card flex flex-wrap items-center gap-2 p-3 text-sm">
      <b>Gửi khảo sát:</b>
      <select className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value as "class" | "center")}><option value="class">Theo lớp</option><option value="center">Cả cơ sở</option></select>
      {mode === "class" ? (
        <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">— Chọn lớp —</option>{items.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.enrolled} HV)</option>)}</select>
      ) : (
        <select className="input w-auto" value={centerId} onChange={(e) => setCenterId(e.target.value)}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
      )}
      <button className="btn-primary" disabled={m.isPending || (mode === "class" && !classId)} onClick={() => { setMsg(null); m.mutate({ id, ...(mode === "class" ? { classId } : { centerId }) }); }}>Gửi</button>
      <span className="text-xs text-ink-400">Mỗi học viên chỉ nhận 1 lần; phụ huynh thấy trong app và có liên kết để gửi qua Zalo.</span>
      {msg && <span className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</span>}
    </section>
  );
}

export function CopyLink({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="text-xs text-brand-600" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/ks/${token}`); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? "Đã chép" : "Chép liên kết"}
    </button>
  );
}
