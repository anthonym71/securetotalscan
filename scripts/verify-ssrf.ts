// Offline regression tests for the SSRF guard, plus an end-to-end scan of a
// deliberately weak sample app running on loopback.
//
// The scanner fetches whatever a stranger types into a form, from inside our
// own network. These checks pin down that it refuses internal destinations:
// by literal, by alternative IP spellings, by DNS answer, and by redirect.
//
// Every network call here goes to 127.0.0.1 or is refused before a socket is
// opened. Nothing leaves the machine.
//
// Run: npm run verify:ssrf

import http from "node:http";
import type { AddressInfo } from "node:net";
import { classifyIp } from "../lib/scanner/ipguard";
import { checkDestination, type Resolver } from "../lib/scanner/netguard";
import { safeFetch } from "../lib/scanner/fetcher";
import { ScanError, normalizeTarget } from "../lib/scanner/target";
import { scan } from "../lib/scanner";

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

const fixed = (addresses: string[]): Resolver => async () => addresses;

async function main() {
  console.log("SSRF guard — regression checks\n");

  // ── 1. IP classification ──────────────────────────────────────────────
  console.log("IP classification:");
  const cases: Array<[string, string | null]> = [
    ["8.8.8.8", "public"],
    ["1.1.1.1", "public"],
    ["127.0.0.1", "loopback"],
    ["127.255.0.9", "loopback"],
    ["0.0.0.0", "private"],
    ["0.1.2.3", "private"],
    ["10.1.2.3", "private"],
    ["100.64.0.1", "private"],
    ["169.254.169.254", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["172.32.0.1", "public"],
    ["192.168.1.1", "private"],
    ["198.18.0.1", "private"],
    ["224.0.0.1", "private"],
    ["255.255.255.255", "private"],
    ["::1", "loopback"],
    ["::", "private"],
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:7f00:1", "loopback"],
    ["::ffff:a9fe:a9fe", "private"],
    ["64:ff9b::a9fe:a9fe", "private"],
    ["2002:a9fe:a9fe::1", "private"],
    ["fd00::1", "private"],
    ["fe80::1%eth0", "private"],
    ["ff02::1", "private"],
    ["2001:db8::1", "private"],
    ["2606:4700:4700::1111", "public"],
    ["example.com", null],
  ];
  for (const [ip, expected] of cases) {
    check(`${ip} is ${expected ?? "not an IP"}`, classifyIp(ip) === expected);
  }

  // ── 2. Static target rules, including spellings WHATWG URL normalises ──
  console.log("\nStatic target rules:");
  const blocked = [
    "http://localhost./",
    "http://LOCALHOST/",
    "http://app.localhost/",
    "http://metadata.google.internal./",
    "http://169.254.169.254/latest/meta-data/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://127.1/",
    "http://0.0.0.0/",
    "http://0/",
    "http://100.64.0.1/",
    "http://[::1]/",
    "http://[::]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://printer.home.arpa/",
    "http://intranet/",
  ];
  for (const input of blocked) check(`${input} is refused`, rejects(input));
  check("example.com is accepted", !rejects("example.com"));
  check("8.8.8.8 is accepted", !rejects("http://8.8.8.8/"));
  check("a public IPv6 literal is accepted", !rejects("http://[2606:4700:4700::1111]/"));
  let loopbackOptIn = false;
  try {
    loopbackOptIn = normalizeTarget("http://127.0.0.1:3000", "https:", { allowLoopback: true })
      .hostname === "127.0.0.1";
  } catch {
    loopbackOptIn = false;
  }
  check("loopback is accepted only with the explicit CLI opt-in", loopbackOptIn);
  check(
    "the opt-in never admits private or metadata addresses",
    (() => {
      try {
        normalizeTarget("http://169.254.169.254/", "https:", { allowLoopback: true });
        return false;
      } catch (err) {
        return err instanceof ScanError;
      }
    })(),
  );

  // ── 3. DNS answers are checked, not just names ───────────────────────
  console.log("\nDNS resolution:");
  const url = new URL("https://rebind.example/");
  check(
    "a public name resolving to 127.0.0.1 is refused",
    (await checkDestination(url, { resolve: fixed(["127.0.0.1"]) })) !== null,
  );
  check(
    "a public name resolving to the metadata address is refused",
    (await checkDestination(url, { resolve: fixed(["169.254.169.254"]) })) !== null,
  );
  check(
    "one private address among public ones is enough to refuse",
    (await checkDestination(url, { resolve: fixed(["93.184.215.14", "10.0.0.5"]) })) !== null,
  );
  check(
    "an IPv4-mapped IPv6 answer is unwrapped and refused",
    (await checkDestination(url, { resolve: fixed(["::ffff:10.0.0.5"]) })) !== null,
  );
  check(
    "all-public answers are allowed",
    (await checkDestination(url, { resolve: fixed(["93.184.215.14", "2606:2800:21f:cb07::1"]) })) ===
      null,
  );
  check(
    "a non-http scheme is refused",
    (await checkDestination(new URL("file:///etc/passwd"))) !== null,
  );

  // ── 4. Real requests against a loopback server ───────────────────────
  console.log("\nFetch and redirects (loopback server):");
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    const path = req.url ?? "/";
    if (path === "/to-metadata") {
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    if (path === "/to-private") {
      res.writeHead(301, { Location: "http://10.0.0.1/admin" });
      return res.end();
    }
    if (path === "/to-self") {
      res.writeHead(302, { Location: "/landing" });
      return res.end();
    }
    if (path === "/loop") {
      res.writeHead(302, { Location: "/loop" });
      return res.end();
    }
    if (path === "/huge") {
      // No Content-Length: the reader must stop at the cap, not buffer it all.
      res.writeHead(200, { "Content-Type": "text/plain" });
      const chunk = "x".repeat(64 * 1024);
      let sent = 0;
      const pump = () => {
        while (sent < 200) {
          sent += 1;
          if (!res.write(chunk)) return res.once("drain", pump);
        }
        res.end();
      };
      return pump();
    }
    if (path === "/.env") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("DEMO_SETTING=not-a-secret\nFEATURE_FLAG=on\n");
    }
    if (path === "/static/app.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      // AWS's own documentation example key, not a credential.
      return res.end('const k = "AKIAIOSFODNN7EXAMPLE"; el.innerHTML = userInput;');
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<html><body><form></form><script src="/static/app.js"></script></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const loopback = { allowLoopback: true };

  try {
    const before = hits;
    const refused = await safeFetch(`${base}/`);
    check("loopback is refused by default", refused.blocked === true && refused.status === 0);
    check("a refused request never reaches the server", hits === before);

    const ok = await safeFetch(`${base}/`, {}, loopback);
    check("loopback is fetched with the explicit opt-in", ok.status === 200);

    const meta = await safeFetch(`${base}/to-metadata`, {}, loopback);
    check("a redirect to the metadata service is refused", meta.blocked === true);
    const priv = await safeFetch(`${base}/to-private`, {}, loopback);
    check("a redirect to a private address is refused", priv.blocked === true);

    const self = await safeFetch(`${base}/to-self`, {}, loopback);
    check(
      "a same-site redirect is followed and the final URL reported",
      self.status === 200 && self.url.endsWith("/landing"),
    );
    const loop = await safeFetch(`${base}/loop`, {}, loopback);
    check("a redirect loop stops", loop.status === 0 && /redirect/i.test(loop.error ?? ""));

    const manual = await safeFetch(`${base}/to-metadata`, { redirect: "manual" }, loopback);
    check(
      "manual mode returns the 3xx without following it",
      manual.status === 302 && manual.headers["location"]?.includes("169.254") === true,
    );

    const huge = await safeFetch(`${base}/huge`, {}, loopback);
    check(
      "a body without Content-Length is capped at 2.5 MB",
      huge.status === 200 && huge.body.length === 2_500_000,
    );

    // ── 5. End to end: the real scan() against the sample app ──────────
    console.log("\nEnd-to-end scan of a deliberately weak sample app:");
    let refusedScan = false;
    try {
      await scan(base);
    } catch (err) {
      refusedScan = err instanceof ScanError;
    }
    check("scan() refuses loopback when called as the API route calls it", refusedScan);

    const report = await scan(base, loopback);
    const titles = report.categories.flatMap((c) => c.findings.map((f) => f.title));
    check("the scan completes with a grade", /^[A-F]$/.test(report.grade));
    check("the exposed .env is found", titles.some((t) => /\.env/i.test(t)));
    check("missing security headers are found", report.categories.some((c) => c.id === "headers" && !c.passed));
    check("the key-shaped string in the bundle is found", report.categories.some((c) => c.id === "secrets" && !c.passed));
    check("a weak app does not get an A", report.grade !== "A");
    console.log(`    grade ${report.grade}, score ${report.score}, ${report.summary.total} findings`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log(`\nVERIFY: ${failures === 0 ? "PASS ✅" : `FAIL ❌ (${failures})`}`);
  // exitCode, not exit(): exiting while sockets are still closing trips a
  // libuv assertion on Windows.
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
