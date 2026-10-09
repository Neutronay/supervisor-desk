"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Shows ?ok= / ?err= messages left by server actions, then strips them from the URL. */
export function Toast() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  useEffect(() => {
    const ok = sp.get("ok"), err = sp.get("err");
    if (!ok && !err) return;
    setMsg({ text: (ok ?? err)!, bad: !!err });
    const next = new URLSearchParams(sp.toString());
    next.delete("ok"); next.delete("err");
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [sp, path, router]);

  if (!msg) return null;
  return (
    <div role="status" className={`fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${msg.bad ? "bg-bad text-white" : "bg-fg text-bg"}`}>
      {msg.text}
    </div>
  );
}
