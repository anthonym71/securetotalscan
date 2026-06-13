"use client";

import { useState } from "react";
import { FAQS } from "@/lib/content";

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-bold sm:text-4xl">
          Frequently Asked Questions
        </h2>
        <p className="mt-3 text-white/60">
          Everything you need to know about vibe coding security.
        </p>
      </div>
      <div className="mt-10 space-y-3">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-white/10 bg-card-gradient"
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium transition hover:bg-white/5"
                aria-expanded={isOpen}
              >
                <span>{item.q}</span>
                <span
                  className={`shrink-0 text-brand-light transition-transform ${isOpen ? "rotate-45" : ""}`}
                  aria-hidden
                >
                  +
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 text-white/65 animate-fade-in">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
