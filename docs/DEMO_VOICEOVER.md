# Secure Total Scan — Hackathon Demo Voiceover (single narrator)

A tight, single-voice narration to lay over a screen-capture of the live app.
Written for judges: it leads with the problem, shows the product working, and
names the GenAI / accelerator concepts as they appear on screen.

**Target runtime:** ~2:00 (a 45-second elevator cut is at the bottom).
**Tone:** calm, confident, a little urgent. Not hype. Let the screen do the bragging.

Timings are guides. Record the screen first, then narrate to picture.

---

## Full voiceover (~2:00)

**[0:00 — ON SCREEN: the infographic / title card, or the landing hero]**

> Most code shipped today is partly written by AI. And the research is blunt
> about it: nearly half of AI-generated code ships with a security
> vulnerability. The average breach now costs over ten million dollars. So the
> question isn't whether your exposed surface has a hole. It's whether you find
> it before someone else does.

**[0:18 — ON SCREEN: securetotalscan.com landing, scroll the hero]**

> This is Secure Total Scan. Autonomous AI defense for anything you've put on
> the internet: your sites, your repos, your Docker images, your logs.

**[0:28 — ON SCREEN: enter a URL, run the free surface scan, show the A–F grade]**

> It starts free. Drop in a URL and you get an instant, passive surface scan:
> headers, CORS, SSL, exposed secrets, exposed files. Graded A through F. No
> login, no waiting.

**[0:42 — ON SCREEN: /dashboard, pick GitHub mode, enter owner/repo, Run analysis]**

> Then the deep analysis. I'll point it at a real GitHub repository and run it
> live.

**[0:50 — ON SCREEN: the agent pipeline cards streaming pending → running → done]**

> What you're watching is a seven-agent pipeline, orchestrated with LangGraph,
> streaming its progress back over server-sent events in real time. Five agents
> do the core work. The Log Monitor flags anomalies. Threat Intel cross-checks
> live CVE data and IP reputation. The Vulnerability Scanner digs through the
> repo for leaked keys, hardcoded credentials, and injection risk. Incident
> Response writes the remediation. The Compliance agent maps it all to NIST and
> SOC 2.

**[1:18 — ON SCREEN: analysis tab, open a finding, show its copy-paste fix prompt]**

> And here's what makes it usable. Every finding comes with a copy-paste fix
> prompt. You don't just learn you have a problem, you get the exact thing to
> paste back into your AI tool to close it.

**[1:33 — ON SCREEN: scroll to "Retrieved knowledge (RAG)" panel]**

> None of this is the model guessing. The recommendations are grounded with RAG
> in real standards: NIST, SOC 2, ISO 27001, OWASP. When it flags a gap, it can
> show you the control.

**[1:45 — ON SCREEN: evals tab — token cost, cache hit rate, per-agent latency]**

> We even put cost on a tab. Token spend, cache hit rate, latency per agent.
> The LLM calls are cached, so repeat scans run in seconds for almost nothing.

**[1:55 — ON SCREEN: landing page top, both CTA buttons, end card / SecureTotalScan.com]**

> Free surface scan to start. Pro is forty-nine dollars a month for the agents
> around the clock. If it's online, it can leak. Secure Total Scan finds it
> first.

---

## 45-second elevator cut

**[0:00 — landing hero]**
> Nearly half of AI-generated code ships with a vulnerability, and the average
> breach costs over ten million dollars. Secure Total Scan is autonomous AI
> defense for everything you've exposed online.

**[0:12 — free scan, A–F grade]**
> A free passive scan grades any URL A through F in seconds.

**[0:18 — dashboard, live GitHub scan, agent cards streaming]**
> Then a seven-agent LangGraph pipeline analyzes your repo live: anomalies, real
> CVEs, leaked secrets, compliance gaps, all streaming in real time.

**[0:32 — a finding's fix prompt, then the RAG panel]**
> Every finding ships with a copy-paste fix, grounded with RAG in NIST and
> OWASP, not guesswork.

**[0:40 — both CTA buttons]**
> Free to start, Pro at forty-nine a month. If it's online, it can leak. Find
> out first.

---

## How to turn this into the video (I can't render it directly)

Pick one. Fastest first.

1. **Record + narrate yourself (best for a hackathon).** Screen-record the live
   app following the on-screen cues (OBS, Loom, or QuickTime). Then either talk
   live or record the voiceover separately and lay it under the video in any
   editor (CapCut, DaVinci Resolve, even Clipchamp on Windows).
2. **AI voice over your screen capture.** Paste the script into a TTS tool
   (ElevenLabs, Play.ht) to generate the narration audio, then drop it under
   your screen recording. Good if you don't want to be on mic.
3. **Reuse the Vimeo demo you already uploaded** as the screen footage and lay
   this narration over it; trim the script to match its length.

**Production notes:**
- Let the agent cards finish on screen during the 0:50–1:18 section. The live
  streaming is the proof, don't rush it.
- Pre-run the GitHub scan on your chosen repo so you know it returns good
  findings and you know the timing. Keep a synthetic-logs run as backup.
- Numbers cited (≈45% vulnerable AI code, $10M+ breach cost) match the
  infographic; keep your on-screen source label consistent with whatever the
  slide shows.
