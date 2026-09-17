"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function TestEmail() {
  const trpc = useTRPC();
  const [to, setTo] = useState("");
  const m = useMutation(trpc.admin.testEmail.mutationOptions());
  return (
    <form className="mt-3 flex flex-wrap gap-2 border-t border-black/5 pt-3" onSubmit={(e) => { e.preventDefault(); m.mutate({ to, eventKey: "TEST" }); }}>
      <input type="email" className="input flex-1 !py-1 text-sm" placeholder="Gửi email thử tới…" value={to} onChange={(e) => setTo(e.target.value)} required />
      <button className="btn-ghost !py-1 text-sm" disabled={m.isPending}>Gửi thử</button>
      {m.error && <p className="w-full text-xs text-red-700">{m.error.message}</p>}
      {m.data && <p className="w-full text-xs text-ink-600">Kết quả: {m.data.status}{m.data.error ? ` — ${m.data.error}` : ""}</p>}
    </form>
  );
}
