"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ConsentToggle({ purpose, granted, editable }: { purpose: string; granted: boolean; editable: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!editable) return <span className="text-[13px] text-ink-600">Liên hệ trung tâm để thay đổi</span>;
  const set = async (v: boolean) => {
    setBusy(true);
    const r = await fetch("/api/ph/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consent", purpose, granted: v }) }).catch(() => null);
    const j = r ? ((await r.json()) as { ok: boolean; error?: string }) : { ok: false, error: "Lỗi kết nối" };
    setBusy(false);
    if (j.ok) router.refresh(); else setErr(j.error ?? "Không lưu được");
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} onClick={() => set(!granted)} className={`relative h-7 w-12 rounded-full transition after:absolute after:-inset-2 after:content-[''] ${granted ? "bg-primary" : "bg-slate-400"}`} aria-pressed={granted} aria-label={granted ? "Đang bật — chạm để tắt" : "Đang tắt — chạm để bật"}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${granted ? "left-[22px]" : "left-0.5"}`} />
      </button>
      {err && <span className="text-[13px] text-red-700">{err}</span>}
    </span>
  );
}

export function RevokeSession({ id }: { id: string }) {
  const router = useRouter();
  return <button type="button" className="text-[13px] text-red-700 underline" onClick={async () => { await fetch("/api/ph/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke", sessionId: id }) }); router.refresh(); }}>Đăng xuất thiết bị này</button>;
}

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Bật / tắt thông báo đẩy trên thiết bị này */
export function PushToggle({ publicKey, devices }: { publicKey: string | null; devices: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState<boolean | null>(null);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.getRegistration("/ph/").then((reg) => reg?.pushManager.getSubscription()).then((sub) => setOn(!!sub)).catch(() => setOn(false));
  }, [supported]);
  if (!publicKey) return <p className="text-[13px] text-ink-600">Trung tâm chưa bật thông báo đẩy.</p>;
  if (!supported) return <p className="text-[13px] text-ink-600">Trình duyệt này chưa hỗ trợ. Trên iPhone: bấm Chia sẻ → “Thêm vào Màn hình chính”, mở Sata Robo từ màn hình chính rồi bật lại.</p>;
  const enable = async () => {
    setState("busy");
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Bạn chưa cho phép thông báo — mở cài đặt trình duyệt để cho phép");
      const reg = await navigator.serviceWorker.register("/ph/sw.js", { scope: "/ph/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const j = sub.toJSON();
      const r = await fetch("/api/ph/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: { endpoint: j.endpoint, keys: j.keys } }) });
      const res = (await r.json()) as { ok: boolean; error?: string };
      if (!res.ok) {
        await sub.unsubscribe();
        throw new Error(res.error ?? "Không bật được");
      }
      setOn(true);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setState("idle");
  };
  const disable = async () => {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/ph/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/ph/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }) }).catch(() => null);
      await sub.unsubscribe();
    }
    setOn(false);
    setState("idle");
    router.refresh();
  };
  return (
    <div className="space-y-1 text-[15px]">
      <div className="flex items-center justify-between gap-2">
        <span>{on ? "Đang nhận thông báo trên thiết bị này" : "Chưa bật trên thiết bị này"}</span>
        <button type="button" className={on ? "btn-ghost" : "btn-primary"} disabled={state === "busy" || on === null} onClick={on ? disable : enable}>{on ? "Tắt" : "Bật thông báo"}</button>
      </div>
      <p className="text-[13px] text-ink-600">Đang bật trên {devices} thiết bị. Thông báo: tin nhắn của trung tâm, nhắc học phí, học bạ mới. Không gửi trong giờ nghỉ đêm.</p>
      {msg && <p className="text-[13px] text-red-700">{msg}</p>}
    </div>
  );
}
