// Offline regression tests for target resolution.
//
// The rule under test: the browser and the server must agree on what a valid
// target is. They disagreed before — `type="url"` rejected `example.com` in
// the browser while `normalizeTarget()` accepted it on the server, so the most
// natural thing a visitor can type was blocked by the client and by nothing
// else.
//
// The SSRF cases matter for a different reason. They are enforced on the
// server, which is the only place enforcement counts; these checks exist so a
// refactor of the shared module cannot quietly widen what the server accepts.
//
// Run: npm run verify:target

import {
  ScanError,
  normalizeTarget,
  protocolFrom,
  targetError,
} from "../lib/scanner/target";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

function rejects(input: string): boolean {
  try {
    normalizeTarget(input);
    return false;
  } catch (err) {
    return err instanceof ScanError;
  }
}

console.log("Target resolution — regression checks\n");

// ── 1. Bare domains, the case the browser used to block ───────────────────

console.log("Bare domains are accepted and assumed HTTPS:");
for (const bare of [
  "example.com",
  "www.example.com",
  "sub.domain.example.co.uk",
  "example.com/path",
  "example.com:8443",
]) {
  const url = normalizeTarget(bare);
  check(`${bare} → ${url.origin}`, url.protocol === "https:");
}
check("leading and trailing space is tolerated", normalizeTarget("  example.com  ").hostname === "example.com");

// ── 2. Explicit schemes ───────────────────────────────────────────────────

console.log("\nAn explicit scheme always wins:");
check("https:// is kept", normalizeTarget("https://example.com").protocol === "https:");
check("http:// is kept", normalizeTarget("http://example.com").protocol === "http:");
check(
  "http:// survives an https default",
  normalizeTarget("http://example.com", "https:").protocol === "http:",
);
check(
  "https:// survives an http default",
  normalizeTarget("https://example.com", "http:").protocol === "https:",
);
check(
  "the default applies only when no scheme is typed",
  normalizeTarget("example.com", "http:").protocol === "http:",
);

console.log("\nThe selector can be synced from what was typed:");
check("detects http", protocolFrom("http://example.com") === "http:");
check("detects https", protocolFrom("https://example.com") === "https:");
check("is case-insensitive", protocolFrom("HTTPS://example.com") === "https:");
check("returns null for a bare domain", protocolFrom("example.com") === null);
check("returns null for a partial scheme", protocolFrom("htt") === null);

// ── 3. Non-web schemes ────────────────────────────────────────────────────

console.log("\nNon-web schemes are refused:");
for (const scheme of [
  "ftp://example.com",
  "file:///etc/passwd",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "gopher://example.com",
]) {
  check(`${scheme} is rejected`, rejects(scheme));
}

// ── 4. SSRF targets — server-enforced, guarded here against refactors ─────

console.log("\nInternal and private addresses are refused:");
for (const host of [
  "localhost",
  "127.0.0.1",
  "127.1.2.3",
  "0.0.0.0",
  "10.0.0.5",
  "192.168.1.1",
  "169.254.169.254", // cloud metadata — the one that actually gets attacked
  "172.16.0.1",
  "172.31.255.255",
  "http://[::1]",
  "myserver.local",
  "svc.internal",
  "intranet", // no dot: resolves against internal DNS
]) {
  check(`${host} is rejected`, rejects(host));
}

console.log("\nAddresses that only look private are still allowed:");
for (const host of [
  "172.32.0.1", // just outside the RFC 1918 block
  "172.15.0.1", // just below it
  "11.0.0.1",
  "192.169.0.1",
  "notlocalhost.com",
  "local.example.com",
]) {
  check(`${host} is accepted`, !rejects(host));
}

// ── 5. Live feedback ──────────────────────────────────────────────────────

console.log("\nLive validation while typing:");
check("empty input is not an error yet", targetError("") === null);
check("whitespace is not an error yet", targetError("   ") === null);
check("a valid target reports no error", targetError("example.com") === null);
check("a blocked host reports one", (targetError("localhost") ?? "").includes("internal"));
check("a bad scheme reports one", (targetError("ftp://example.com") ?? "").includes("http"));
check(
  "the error respects the selected protocol",
  targetError("example.com", "http:") === null,
);

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
