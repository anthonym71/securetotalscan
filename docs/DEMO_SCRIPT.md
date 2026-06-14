# Secure Total Scan — Demo Video Script (2-host, interactive)

Podcast-style walkthrough. Two people on camera, one screen share. The vibe is
"two builders showing a real tool," not a polished ad. Conversational, a little
back-and-forth, real clicks on the live app.

**Target runtime:** 3:30 to 4:30 (a tight 60-second cut is at the bottom).

---

## Cast and roles

- **HOST** (Anthony): the business / buyer voice. Asks the questions a customer
  would ask, reacts, drives the close. Does *not* share screen.
- **GUEST** (co-host): the technical voice. Shares screen, drives the app,
  explains what each agent is doing.

Swap the names to whoever is actually recording. Keep the two roles distinct,
that contrast is what makes it feel like a conversation instead of a pitch.

---

## Pre-flight checklist (do this before you hit record)

1. Open two browser tabs: **securetotalscan.com** (landing) and
   **securetotalscan.com/dashboard** (agent UI).
2. Pick the GitHub repo you will scan live and **run it once beforehand** so you
   know it returns good findings and you know the timing.
   - Reliable choice: a public, intentionally-vulnerable teaching repo (for
     example `OWASP/NodeGoat` or `digininja/DVWA`). These exist to be scanned, so
     it is fair game and they produce real findings.
   - Alternative: your own public repo (`anthonym71/securetotalscan`).
3. **Backup plan:** if the live GitHub call is slow or rate-limited, fall back to
   **Synthetic logs → Run analysis** (no input needed, always works). Have that
   tab ready. Unauthenticated GitHub API is ~60 req/hour, so a token helps.
4. Have one **finding with a copy-paste fix prompt** ready to show, and the
   **evals tab** ready to flip to.
5. Mute notifications. Full-screen the browser. Record the screen at 1080p.

---

## The script

### 0:00 — Cold open (hook before the logo)

**HOST:** Quick question. How much of what you've shipped this year was written,
or half-written, by AI?

**GUEST:** Honestly? A lot.

**HOST:** Right. And here's the uncomfortable part. The research says AI-generated
code ships with security holes at a much higher rate than people assume. So we
built something that checks anything you've put on the internet, before someone
else does. It's called Secure Total Scan.

**[ON SCREEN: securetotalscan.com landing page, scroll slowly through the hero.]**

---

### 0:25 — What it is (the 20-second version)

**GUEST:** Two layers. The free layer is a passive surface scan. You drop in a
URL and you get an instant A-through-F grade, no login, no waiting.

**HOST:** And the paid layer?

**GUEST:** That's where it gets interesting. Seven AI agents run a deep analysis:
your logs, your GitHub repo, your Docker images. They find the threats, map them
to compliance frameworks, and hand you the fix. Let me just show you.

**[ON SCREEN: click "Run a free scan", or jump straight to /dashboard.]**

---

### 0:45 — The live GitHub scan (the centerpiece)

**GUEST:** So I'm in the dashboard. I'll pick **GitHub repo** as the scan mode,
and I'll point it at a real repository.

**[ON SCREEN: select GitHub mode, type the repo (owner/repo), click Run analysis.]**

**HOST:** And this is a live repo, you didn't pre-bake the results?

**GUEST:** Live. Watch the pipeline. Each of these cards is a separate agent, and
they're streaming their progress back in real time.

**[ON SCREEN: the seven agent cards turn from pending to running to done.]**

**GUEST:** Log Monitor reads the patterns. Threat Intel cross-references real CVE
databases and IP reputation. The Vulnerability Scanner does the static analysis
on the repo, secrets, injection, infrastructure config. Then Incident Response,
Policy Checker, and the notifier.

**HOST:** So it's not one big AI guessing. It's seven specialists.

**GUEST:** Exactly. Deterministic agents do the detection, so it's repeatable.
The LLM only steps in where reasoning actually adds value, like writing the
incident runbook. That's a deliberate design choice, not an accident.

---

### 1:45 — The findings (why a buyer cares)

**[ON SCREEN: open the analysis tab, scroll the findings.]**

**GUEST:** Here's the output. Real findings, ranked. And this is the part I like:
every finding comes with a copy-paste fix prompt.

**[ON SCREEN: click into one finding, show the fix prompt.]**

**HOST:** So I don't just learn I have a problem, I get the exact thing to paste
back into my AI tool to fix it.

**GUEST:** That's the whole point. Most scanners give you a wall of red and leave.
This one closes the loop.

---

### 2:20 — RAG and compliance (the credibility moment)

**[ON SCREEN: scroll to "Retrieved knowledge (RAG)" and the compliance score.]**

**GUEST:** And it's not making this up. See this panel, "Retrieved knowledge"?
The recommendations are grounded in actual standards: NIST, SOC 2, ISO 27001,
OWASP. So when it tells you something is a compliance gap, it can point at the
framework and the control.

**HOST:** That's the difference between "trust me" and "here's the citation."

**GUEST:** Right.

---

### 2:50 — The evals tab (the technical flex)

**[ON SCREEN: switch to the evals tab.]**

**GUEST:** One more thing, because I know people will ask about cost. This is the
evals tab. Token cost per run, cache hit rate, latency per agent. We cache the
LLM calls, so repeat analysis is cheap and fast.

**HOST:** So you can actually see what each scan costs you. Most AI products hide
that.

**GUEST:** We put it on a tab.

---

### 3:20 — The close and the offer

**[ON SCREEN: back to securetotalscan.com, top of the page with both buttons.]**

**HOST:** Okay, so how do people try this?

**GUEST:** Two buttons right at the top. **Run a free scan** gives you the instant
grade, costs nothing, no account. When you want the seven agents watching your
repos and images around the clock, **Pro is forty-nine dollars a month.**

**HOST:** If it's online, it can leak. Find out before someone else does. That's
Secure Total Scan. Go run a free scan on something you shipped this week, it
takes about a minute.

**[ON SCREEN: hover the "Get Pro — $49/mo" button, then the free scan button. End card.]**

---

## 60-second cut (if you need a short version)

1. **0:00 HOST:** "Most code shipped today is part AI-written, and it leaks. We
   built a scanner for that." [landing page]
2. **0:10 GUEST:** "Free surface scan gives you an instant A-to-F grade. The paid
   layer runs seven AI agents on your logs, GitHub, and Docker." [dashboard]
3. **0:20 GUEST:** Run the live GitHub scan, narrate the agent cards streaming.
4. **0:35 GUEST:** Show one finding with its copy-paste fix prompt, then the RAG
   panel grounded in NIST and OWASP.
5. **0:50 HOST:** "Free scan at the top, Pro is $49 a month. Go scan something you
   shipped this week." [both buttons, end card]

---

## Delivery notes

- Let the agent cards finish on screen. The live streaming is the proof, don't
  talk over all of it, let a few seconds breathe.
- If a scan stalls, cut to the synthetic-logs run. Never wait on a dead screen.
- Keep the energy of a conversation. HOST should genuinely react, not read.
- No jargon dumps. Each agent gets one plain-English line, not a lecture.
- End on the action: "run a free scan," not "thanks for watching."
