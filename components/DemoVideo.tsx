"use client";

import { useState } from "react";

// Arcade interactive demo embed (demo.arcade.software allows inline framing).
const ARCADE_SRC =
  "https://demo.arcade.software/video/uq19QCZ0fjCHBbFKK22f?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true&autoplay=1";

export function DemoVideo() {
  const [playing, setPlaying] = useState(false);

  return (
    <section id="demo" className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold sm:text-4xl">See it in action</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/60">
          A quick walkthrough, from URL to security report.
        </p>
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-white/10 shadow-glow"
        style={{ padding: "56.25% 0 0 0", position: "relative" }}
      >
        {playing ? (
          <iframe
            src={ARCADE_SRC}
            title="Secure Total Scan for Internet Security"
            frameBorder={0}
            allowFullScreen
            allow="autoplay; fullscreen; clipboard-write"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              colorScheme: "light",
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Play the Secure Total Scan demo"
            className="group absolute inset-0 block h-full w-full cursor-pointer"
          >
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ background: "radial-gradient(120% 120% at 50% 0%, #1a1038 0%, #0a0e1a 60%)" }}
            />
            <span className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className="text-2xl font-extrabold sm:text-3xl">Secure Total Scan</span>
              <span className="mt-1 bg-brand-gradient bg-clip-text text-sm font-semibold text-transparent sm:text-base">
                Autonomous AI Defense for the Modern Web
              </span>
            </span>
            <span className="absolute inset-0 grid place-items-center bg-black/25 transition group-hover:bg-black/10">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-white/95 shadow-glow transition group-hover:scale-105">
                <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-[#0a0e1a]" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
