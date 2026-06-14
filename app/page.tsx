import { Faq } from "@/components/Faq";
import { IntroModal } from "@/components/IntroModal";
import { ScanForm } from "@/components/ScanForm";
import { DemoVideo } from "@/components/DemoVideo";
import {
  Agents,
  Hero,
  HowItWorks,
  NavBar,
  Plans,
  Stats,
  TrustBar,
  WhatWeScan,
} from "@/components/Sections";
import { BRAND } from "@/lib/brand";
import { FOOTER, SCAN_SECTION } from "@/lib/content";

export default function Home() {
  return (
    <main>
      <IntroModal />
      <NavBar />
      <Hero />
      <DemoVideo />
      <TrustBar />

      {/* Scan section */}
      <section id="scan" className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">{SCAN_SECTION.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/60">
            {SCAN_SECTION.body}
          </p>
        </div>
        <ScanForm />
      </section>

      <HowItWorks />
      <WhatWeScan />
      <Agents />
      <Stats />
      <Plans />
      <Faq />

      <footer className="border-t border-white/10 py-8 text-center text-sm text-white/40">
        <p>{FOOTER}</p>
        <p className="mt-2">
          Contact:{" "}
          <a
            href={`mailto:${BRAND.email}`}
            className="text-brand-light hover:text-white"
          >
            {BRAND.email}
          </a>
        </p>
      </footer>
    </main>
  );
}
