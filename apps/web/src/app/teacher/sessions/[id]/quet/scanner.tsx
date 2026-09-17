"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Log = { at: string; ok: boolean; text: string };
type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/** Quét thẻ QR học viên bằng camera (BarcodeDetector — Chrome Android / Edge); máy không hỗ trợ thì nhập mã tay */
export function Scanner({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const s = useQuery(trpc.academics.sessions.get.queryOptions({ id: sessionId }));
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [supported, setSupported] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const scan = useMutation(trpc.card.scan.mutationOptions());

  const submit = useCallback(async (code: string) => {
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 4000) return;
    last.current = { code, at: now };
    try {
      const r = await scan.mutateAsync({ sessionId, code });
      const text = r.ok ? `${r.student}: ${r.duplicate ? "đã điểm danh trước đó" : r.status === "late" ? "ĐI MUỘN" : "có mặt"}` : r.reason;
      setLog((l) => [{ at: new Date().toLocaleTimeString("vi-VN"), ok: r.ok, text }, ...l].slice(0, 50));
      if (r.ok && !r.duplicate && navigator.vibrate) navigator.vibrate(80);
      qc.invalidateQueries({ queryKey: trpc.academics.sessions.get.queryKey({ id: sessionId }) });
    } catch (e) {
      setLog((l) => [{ at: new Date().toLocaleTimeString("vi-VN"), ok: false, text: (e as Error).message }, ...l].slice(0, 50));
    }
  }, [scan, sessionId, qc, trpc]);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (!running) return;
    let stop = false;
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const det = new Ctor({ formats: ["qr_code"] });
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (video.current) { video.current.srcObject = stream.current; await video.current.play(); }
        while (!stop && video.current) {
          const codes = await det.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) await submit(codes[0].rawValue);
          await new Promise((r) => setTimeout(r, 350));
        }
      } catch (e) {
        setLog((l) => [{ at: "", ok: false, text: `Không mở được camera: ${(e as Error).message}` }, ...l]);
        setRunning(false);
      }
    })();
    return () => { stop = true; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, [running, submit]);

  const d = s.data;
  const present = d?.roster.filter((r) => r.attendanceStatus === "present" || r.attendanceStatus === "late").length ?? 0;
  return (
    <div className="space-y-3">
      <Link href={`/teacher/sessions/${sessionId}`} className="text-sm text-brand-600">← Về buổi học</Link>
      <div className="card p-4">
        <h1 className="font-bold">Quét thẻ điểm danh</h1>
        {d && <p className="text-sm text-ink-600">{d.classCode} · {d.label} · {present}/{d.roster.length} đã có mặt</p>}
      </div>
      {supported === false && <div className="card border-amber-200 bg-amber-50 p-3 text-sm">Trình duyệt này chưa hỗ trợ quét bằng camera — dùng Chrome trên Android, hoặc nhập mã in dưới thẻ.</div>}
      {supported && (
        <div className="card overflow-hidden">
          <video ref={video} className={`aspect-square w-full bg-black object-cover ${running ? "" : "hidden"}`} muted playsInline />
          <div className="p-3"><button type="button" className={running ? "btn-ghost w-full" : "btn-primary w-full"} onClick={() => setRunning(!running)}>{running ? "Dừng quét" : "Bật camera quét"}</button></div>
        </div>
      )}
      <form className="card flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void submit(manual.trim()); setManual(""); } }}>
        <input className="input flex-1 font-mono text-xs" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Hoặc dán / nhập mã thẻ SR1.…" />
        <button className="btn-ghost" disabled={scan.isPending}>Ghi</button>
      </form>
      <ul className="card divide-y divide-black/5 text-sm">
        {log.length === 0 && <li className="p-3 text-ink-400">Chưa quét thẻ nào.</li>}
        {log.map((l, i) => <li key={i} className={`flex justify-between gap-2 p-3 ${l.ok ? "" : "text-red-700"}`}><span>{l.ok ? "✓" : "✗"} {l.text}</span><span className="text-xs text-ink-400">{l.at}</span></li>)}
      </ul>
      {d && (
        <div className="card p-3 text-sm">
          <div className="mb-1 font-semibold">Chưa có mặt</div>
          <ul className="text-xs text-ink-600">{d.roster.filter((r) => !["present", "late", "makeup"].includes(r.attendanceStatus ?? "")).map((r) => <li key={r.enrollmentId}>{r.fullName}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
