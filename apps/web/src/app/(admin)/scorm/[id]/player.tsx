"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { SCORM_STATUS_VI } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Launch = { title: string; version: number; scormVersion: "1.2" | "2004"; launchUrl: string; learner: { id: string; name: string }; state: { status: string; location: string | null; suspendData: string | null; entry: string; score: number | null } };
type W = Window & { API?: unknown; API_1484_11?: unknown };

/**
 * Trình chạy SCORM: cung cấp đối tượng API (1.2) / API_1484_11 (2004) cho gói trong iframe cùng nguồn,
 * lưu dữ liệu CMI định kỳ (30 giây), khi Commit và khi Terminate.
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
    if (v12) w.API = api12; else w.API_1484_11 = api04;
    setReady(true);
    const timer = setInterval(() => { if (dirty.current) save(false); }, 30_000);
    const onHide = () => { if (document.visibilityState === "hidden" && dirty.current) save(false); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      if (!terminated && dirty.current) save(true);
      delete w.API;
      delete w.API_1484_11;
      setReady(false);
    };
  }, [launch, id]);

  if (start.error) return <p className="card p-4 text-red-700">{start.error.message}</p>;
  if (!launch) return <p className={fill ? "p-4 text-sm text-white" : "card p-4 text-ink-400"}>Đang mở bài giảng…</p>;
  // `fill`: dùng trong khung trình chiếu — gói SCORM chiếm trọn khung, dòng trạng thái thu nhỏ lại
  return (
    <div className={fill ? "flex h-full w-full flex-col bg-black" : "space-y-2"}>
      <div className={`flex flex-wrap items-center gap-3 text-xs ${fill ? "px-3 py-1 text-white/70" : "text-ink-600"}`}>
        <span>SCORM {launch.scormVersion}</span>
        <span>Trạng thái: <b>{SCORM_STATUS_VI[status as keyof typeof SCORM_STATUS_VI] ?? status}</b></span>
        {saved && <span>Đã lưu lúc {saved.toLocaleTimeString("vi-VN")}</span>}
        {commit.error && <span className="text-red-700">Lưu tiến độ lỗi: {commit.error.message}</span>}
      </div>
      {ready && (
        <iframe
          src={launch.launchUrl}
          title={launch.title}
          className={fill ? "h-full w-full flex-1 border-0 bg-white" : "h-[75vh] w-full rounded-xl border border-black/10 bg-white"}
          allow="fullscreen; autoplay"
        />
      )}
    </div>
  );
}
