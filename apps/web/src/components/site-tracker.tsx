"use client";

import { useEffect } from "react";

const KEY = "sr_aid";
let memId = "";

function randomId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_"[b % 54]).join("");
}
export function anonId(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v || !/^[A-Za-z0-9_-]{16,64}$/.test(v)) { v = randomId(); localStorage.setItem(KEY, v); }
    return v;
  } catch {
    memId ||= randomId();
    return memId;
  }
}
function utm(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const q = new URLSearchParams(window.location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) {
      const v = q.get(k);
      if (v) sessionStorage.setItem(k, v);
      const s = v ?? sessionStorage.getItem(k);
      if (s) out[k] = s;
    }
  } catch { /* bỏ qua */ }
  return out;
}
export function currentUtm() {
  return utm();
}

export function track(event: "page_view" | "form_view" | "form_start" | "form_submit" | "cta_click") {
  try {
    const body = JSON.stringify({ event, anonId: anonId(), path: window.location.pathname, referrer: document.referrer || null, ...utm() });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/public/track", new Blob([body], { type: "application/json" }));
    else void fetch("/api/public/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch { /* không chặn trang vì tracking */ }
}

/** Gắn vào trang công khai: ghi page_view (và form_view nếu có form) */
export function SiteTracker({ form }: { form?: boolean }) {
  useEffect(() => {
    track("page_view");
    if (form) track("form_view");
  }, [form]);
  return null;
}
