"use client";

import { useEffect, useState } from "react";
import { SampleAnalysis } from "@/components/SampleAnalysis";

/** Homepage "Demo Scan" button: opens the sample deep analysis in a popup. */
export function DemoScanModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-brand/50 px-8 py-3 font-semibold text-brand-light transition hover:bg-brand/10"
      >
        Demo Scan
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Demo deep scan"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative my-4 w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b0f19] p-6 shadow-glow sm:p-10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close demo"
              className="absolute right-4 top-4 rounded-lg border border-white/15 px-3 py-1 text-sm text-white/60 hover:bg-white/10 hover:text-white"
            >
              Close ✕
            </button>
            <SampleAnalysis />
          </div>
        </div>
      )}
    </>
  );
}
