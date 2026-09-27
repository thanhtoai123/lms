"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { SCORM_STATUS_VI, docTinScorm } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Launch = { title: string; version: number; scormVersion: "1.2" | "2004"; launchUrl: string; learner: { id: string; name: string }; state: { status: string; location: string | null; suspendData: string | null; entry: string; score: number | null } };
type W = Window & { API?: unknown; API_1484_11?: unknown };

/**
 * Trình chạy SCORM: cung cấp đối tượng API (1.2) / API_1484_11 (2004) cho gói trong iframe,
 * lưu dữ liệu CMI định kỳ (30 giây), khi Commit và khi Terminate.
 *
 * Hai chế độ:
 * - CÙNG MIỀN (máy phát triển): gói tìm `window.parent.API` như SCORM chuẩn.
 * - MIỀN HỌC LIỆU RIÊNG (`SCORM_ORIGIN`, bắt buộc khi chạy thật): gói không chạm được vào trang
 *   này. Dữ liệu ban đầu đi vào qua tên khung (`window.name`), thay đổi đi ra qua `postMessage` —
 *   cầu nối do máy chủ nhúng vào gói (core/content/scormNguon.ts). Tin nhận về là dữ liệu KHÔNG tin
 *   cậy: chỉ nhận từ đúng miền + đúng khung, và qua `docTinScorm` (giới hạn khoá, dung lượng, bỏ
 *   khoá định danh người học).
 */
export function ScormPlayer({ id, fill = false }: { id: string; fill?: boolean }) {
  const trpc = useTRPC();
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [status, setStatus] = useState<string>("");
  const [saved, setSaved] = useState<Date | null>(null);
  const [ready, setReady] = useState(false);
  const cmi = useRef<Record<string, string>>({});
  const dirty = useRef(false);
  const lastError = useRef("0");
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameName, setFrameName] = useState<string | undefined>(undefined);
  const start = useMutation(trpc.content.scormLaunch.mutationOptions({ onSuccess: (r) => setLaunch(r as Launch) }));
  const commit = useMutation(trpc.content.scormCommit.mutationOptions({ onSuccess: (r) => { setStatus(r.status); setSaved(new Date()); } }));
  const commitRef = useRef(commit.mutate);
  commitRef.current = commit.mutate;

  useEffect(() => { start.mutate({ id }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  useEffect(() => {
    if (!launch) return;
    const v12 = launch.scormVersion === "1.2";
    const init: Record<string, string> = v12
      ? { "cmi.core.student_id": launch.learner.id, "cmi.core.student_name": launch.learner.name, "cmi.core.lesson_status": launch.state.status === "not_attempted" ? "not attempted" : launch.state.status, "cmi.core.entry": launch.state.entry, "cmi.core.lesson_location": launch.state.location ?? "", "cmi.suspend_data": launch.state.suspendData ?? "", "cmi.core.credit": "credit", "cmi.core.lesson_mode": "normal", "cmi.launch_data": "" }
      : { "cmi.learner_id": launch.learner.id, "cmi.learner_name": launch.learner.name, "cmi.completion_status": launch.state.status === "completed" || launch.state.status === "passed" ? "completed" : "incomplete", "cmi.entry": launch.state.entry === "resume" ? "resume" : "ab-initio", "cmi.location": launch.state.location ?? "", "cmi.suspend_data": launch.state.suspendData ?? "", "cmi.credit": "credit", "cmi.mode": "normal", "cmi.launch_data": "" };
    cmi.current = init;
    setStatus(launch.state.status);
    const save = (terminate: boolean) => {
      const changed = Object.fromEntries(Object.entries(cmi.current).filter(([k]) => !/student_(id|name)|learner_(id|name)/.test(k)));
      dirty.current = false;
      commitRef.current({ id, version: launch.version, cmi: changed, terminate });
    };
    let terminated = false;
    const ok = "true";
    const get = (k: string) => { lastError.current = "0"; if (k.endsWith("._count")) return "0"; return cmi.current[k] ?? ""; };
    const set = (k: string, val: string) => { lastError.current = "0"; cmi.current[k] = String(val); dirty.current = true; return ok; };
    const errStr = (c: string) => (c === "0" ? "Không lỗi" : "Lỗi");
    const api12 = {
      LMSInitialize: () => ok, LMSFinish: () => { if (!terminated) { terminated = true; save(true); } return ok; },
      LMSGetValue: get, LMSSetValue: set, LMSCommit: () => { save(false); return ok; },
      LMSGetLastError: () => lastError.current, LMSGetErrorString: errStr, LMSGetDiagnostic: errStr,
    };
    const api04 = {
      Initialize: () => ok, Terminate: () => { if (!terminated) { terminated = true; save(true); } return ok; },
      GetValue: get, SetValue: set, Commit: () => { save(false); return ok; },
      GetLastError: () => lastError.current, GetErrorString: errStr, GetDiagnostic: errStr,
    };
    const w = window as W;
    const nguonGoi = (() => { try { return new URL(launch.launchUrl, window.location.href).origin; } catch { return window.location.origin; } })();
    const khacMien = nguonGoi !== window.location.origin;
    const onMsg = (e: MessageEvent) => {
      if (!khacMien || e.origin !== nguonGoi || e.source !== frame.current?.contentWindow) return;
      const tin = docTinScorm(e.data);
      if (!tin) return;
      const id0 = Object.fromEntries(Object.entries(cmi.current).filter(([k]) => /student_(id|name)|learner_(id|name)/.test(k)));
      cmi.current = { ...cmi.current, ...tin.cmi, ...id0 };
      dirty.current = true;
      if (tin.op === "commit") save(false);
      if (tin.op === "finish" && !terminated) { terminated = true; save(true); }
    };
    if (khacMien) {
      // Gói ở miền khác: dữ liệu ban đầu đi vào bằng tên khung — cầu nối trong gói đọc window.name
      setFrameName(JSON.stringify({ sr: 1, cmi: init }));
      window.addEventListener("message", onMsg);
    } else if (v12) w.API = api12; else w.API_1484_11 = api04;
    setReady(true);
    const timer = setInterval(() => { if (dirty.current) save(false); }, 30_000);
    const onHide = () => { if (document.visibilityState === "hidden" && dirty.current) save(false); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("message", onMsg);
      document.removeEventListener("visibilitychange", onHide);
      if (!terminated && dirty.current) save(true);
      delete w.API;
      delete w.API_1484_11;
      setReady(false);
    };
  }, [launch, id]);

  if (start.error) return <p className="card p-4 text-red-700">{start.error.message}</p>;
  if (!launch) return <p className={fill ? "p-4 text-sm text-ink-600" : "card p-4 text-ink-400"}>Đang mở bài giảng…</p>;
  // `fill`: dùng trong khung TRÌNH CHIẾU — bài giảng chiếm trọn khung, KHÔNG có thanh trạng thái
  // ngang ở trên (một thanh đen chạy hết bề ngang lúc đang dạy chỉ tổ vướng mắt cả lớp).
  // Trạng thái vẫn còn ở trang quản lý học liệu (chế độ thường) và trong nhật ký.
  return (
    <div className={fill ? "h-full w-full" : "space-y-2"}>
      {!fill && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-600">
          <span>SCORM {launch.scormVersion}</span>
          <span>Trạng thái: <b>{SCORM_STATUS_VI[status as keyof typeof SCORM_STATUS_VI] ?? status}</b></span>
          {saved && <span>Đã lưu lúc {saved.toLocaleTimeString("vi-VN")}</span>}
          {commit.error && <span className="text-red-700">Lưu tiến độ lỗi: {commit.error.message}</span>}
        </div>
      )}
      {ready && (
        <iframe
          ref={frame}
          name={frameName}
          src={launch.launchUrl}
          title={launch.title}
          className={fill ? "h-full w-full border-0 bg-white" : "h-[75vh] w-full rounded-xl border border-black/10 bg-white"}
          allow="fullscreen; autoplay"
        />
      )}
    </div>
  );
}
