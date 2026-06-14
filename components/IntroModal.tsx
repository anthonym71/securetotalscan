"use client";

import { useEffect, useState } from "react";

// Intro splash shown once per browser session. The infographic lives at
// public/AI-Powered_Web_Defense_Platform.png (NotebookLM logo removed before commit).
export function IntroModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("sts-intro-seen") === "1") return;
    setOpen(true);
  }, []);

  function close() {
    try {
      sessionStorage.setItem("sts-intro-seen", "1");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Secure Total Scan overview"
      onClick={close}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e1a] shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/AI-Powered_Web_Defense_Platform.png"
            alt="Secure Total Scan: Autonomous AI Defense for the Modern Web"
            className="block w-full"
          />
        </div>
        <div className="border-t border-white/10 p-4 text-center">
          <button
            type="button"
            onClick={close}
            className="inline-block rounded-xl bg-brand-gradient px-8 py-4 font-semibold shadow-glow transition hover:opacity-90"
          >
            CLICK HERE to continue
          </button>
        </div>
      </div>
    </div>
  );
}
