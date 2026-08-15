// Regression tests for unsafe-HTML detection.
//
// Two failure modes matter and both are covered here:
//   * False positives — React/Next vendor chunks must never be reported.
//     The vendor fixtures below are real excerpts from a production Next.js
//     build (react-dom and the Next runtime chunk).
//   * False negatives — application-owned HTML injection must still be found.
//
// Run: npm run verify:input-validation

import { checkInputValidation } from "../lib/scanner/checks";
import {
  extractInlineScripts,
  findUnsafeHtmlSinks,
  isVendorScript,
} from "../lib/scanner/htmlSinks";
import type { ScanContext } from "../lib/scanner/types";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

/* ── Fixtures ─────────────────────────────────────────────────────────── */

// Real excerpt: react-dom prop handling (minified).
const REACT_DOM = `
"use strict";var i=Error;function sc(e,n,p,m,r,d){}
case"children":case"dangerouslySetInnerHTML":if(null!=m)throw Error(i(137,n));break;
case"script":(a=o.createElement("div")).innerHTML="<script><\\/script>",a=a.removeChild(a.firstChild);break;
var x="Minified React error #"+e;
`;

// Real excerpt: the Next.js runtime chunk (script loader + root html element).
const NEXT_RUNTIME = `
let o=document.createElement("script");u&&(0,n.setAttributesFromProps)(o,u),r?(o.src=r,o.onload=()=>e()):u&&(o.innerHTML=u.children,setTimeout(e));
n=["onLoad","onReady","dangerouslySetInnerHTML","children","onError","strategy"];
return(0,n.jsx)("html",{ref:this.htmlRef,suppressHydrationWarning:!0,dangerouslySetInnerHTML:{__html:this.rootHtml}});
window.next={version:"15.5.19",appDir:!0};
`;

// The site's own code, doing the dangerous thing.
const APP_UNSAFE = `
function renderComment(el, comment) {
  el.innerHTML = comment.body;
}
`;

const APP_UNSAFE_REACT = `
export function Post({ post }) {
  return jsx("div", { dangerouslySetInnerHTML: { __html: post.body } });
}
`;

const APP_UNSAFE_INSERT = `
list.insertAdjacentHTML("beforeend", buildRow(item));
`;

// The site's own code, but safe: constant markup, or text-only rendering.
const APP_SAFE = `
document.getElementById("spinner").innerHTML = "<em>Loading…</em>";
node.textContent = user.name;
const label = "dangerouslySetInnerHTML";
switch (prop) { case "dangerouslySetInnerHTML": return null; }
`;

function context(partial: Partial<ScanContext>): ScanContext {
  return {
    target: new URL("https://example.test"),
    finalUrl: "https://example.test",
    status: 200,
    headers: {},
    html: "<html><body></body></html>",
    scriptUrls: [],
    bundleSource: "",
    notes: [],
    ...partial,
  };
}

function hasUnsafeFinding(ctx: ScanContext): boolean {
  return checkInputValidation(ctx).findings.some(
    (f) => f.title === "Potential unsafe HTML rendering",
  );
}

/* ── Checks ───────────────────────────────────────────────────────────── */

console.log("Unsafe-HTML detection — regression checks\n");

// 1. Vendor classification.
check(
  "react-dom chunk is recognised as vendor code",
  isVendorScript("https://x.test/_next/static/chunks/4bd1b696-c023c6e35.js", REACT_DOM),
);
check(
  "Next runtime chunk is recognised as vendor code",
  isVendorScript("https://x.test/_next/static/chunks/255-98a0bdaa30.js", NEXT_RUNTIME),
);
check(
  "framework chunk name is recognised without reading the source",
  isVendorScript("https://x.test/_next/static/chunks/framework-abc123.js", ""),
);
check(
  "CRA vendor bundle is recognised",
  isVendorScript("https://x.test/static/js/vendors~main.chunk.js", ""),
);
check(
  "an app chunk is NOT vendor code",
  !isVendorScript("https://x.test/_next/static/chunks/app/page-a72506c0.js", APP_UNSAFE),
);

// 2. No false positives on framework code.
check(
  "react-dom alone produces no finding",
  findUnsafeHtmlSinks([
    { url: "https://x.test/_next/static/chunks/4bd1b696-c023c6e35.js", source: REACT_DOM },
  ]).length === 0,
);
check(
  "Next runtime alone produces no finding",
  findUnsafeHtmlSinks([
    { url: "https://x.test/_next/static/chunks/255-98a0bdaa30.js", source: NEXT_RUNTIME },
  ]).length === 0,
);
check(
  "a full React site (vendor chunks + safe app code) is clean",
  !hasUnsafeFinding(
    context({
      scriptUrls: [
        "https://x.test/_next/static/chunks/4bd1b696-c023c6e35.js",
        "https://x.test/_next/static/chunks/255-98a0bdaa30.js",
        "https://x.test/_next/static/chunks/app/page-a72506c0.js",
      ],
      bundles: [
        { url: "https://x.test/_next/static/chunks/4bd1b696-c023c6e35.js", source: REACT_DOM },
        { url: "https://x.test/_next/static/chunks/255-98a0bdaa30.js", source: NEXT_RUNTIME },
        { url: "https://x.test/_next/static/chunks/app/page-a72506c0.js", source: APP_SAFE },
      ],
      bundleSource: [REACT_DOM, NEXT_RUNTIME, APP_SAFE].join("\n"),
    }),
  ),
);

// 3. No false positives on safe application code.
check(
  "constant markup assigned to innerHTML is not reported",
  findUnsafeHtmlSinks([{ url: "app.js", source: APP_SAFE }]).length === 0,
);
check(
  "the identifier in a case label or string is not reported",
  findUnsafeHtmlSinks([
    { url: "app.js", source: `case "dangerouslySetInnerHTML": break;` },
  ]).length === 0,
);

// 4. Real application-owned sinks are still detected.
check(
  "innerHTML from a variable is detected",
  findUnsafeHtmlSinks([{ url: "app.js", source: APP_UNSAFE }]).length === 1,
);
check(
  "dangerouslySetInnerHTML with a value is detected",
  findUnsafeHtmlSinks([{ url: "app.js", source: APP_UNSAFE_REACT }]).length === 1,
);
check(
  "insertAdjacentHTML with an expression is detected",
  findUnsafeHtmlSinks([{ url: "app.js", source: APP_UNSAFE_INSERT }]).length === 1,
);
check(
  "an unsafe app chunk shipped alongside React is still detected",
  hasUnsafeFinding(
    context({
      scriptUrls: [
        "https://x.test/_next/static/chunks/4bd1b696-c023c6e35.js",
        "https://x.test/_next/static/chunks/app/page-a72506c0.js",
      ],
      bundles: [
        { url: "https://x.test/_next/static/chunks/4bd1b696-c023c6e35.js", source: REACT_DOM },
        { url: "https://x.test/_next/static/chunks/app/page-a72506c0.js", source: APP_UNSAFE },
      ],
      bundleSource: [REACT_DOM, APP_UNSAFE].join("\n"),
    }),
  ),
);
check(
  "the finding names the offending file",
  (() => {
    const finding = checkInputValidation(
      context({
        bundles: [{ url: "https://x.test/app.js", source: APP_UNSAFE }],
        bundleSource: APP_UNSAFE,
      }),
    ).findings.find((f) => f.title === "Potential unsafe HTML rendering");
    return Boolean(finding?.evidence?.includes("https://x.test/app.js"));
  })(),
);

// 5. Inline scripts.
check(
  "unsafe inline script is detected",
  hasUnsafeFinding(
    context({ html: `<html><body><script>box.innerHTML = data.html;</script></body></html>` }),
  ),
);
check(
  "framework hydration payload is ignored",
  extractInlineScripts(
    `<script>self.__next_f.push([1,"innerHTML=x"])</script>`,
  ).length === 0,
);
check(
  "scripts with a src attribute are not treated as inline",
  extractInlineScripts(`<script src="/app.js"></script>`).length === 0,
);

// 6. Backwards compatibility: a context with only the concatenated blob is
// still treated as application code.
check(
  "legacy context without per-bundle sources still detects sinks",
  hasUnsafeFinding(context({ bundleSource: APP_UNSAFE, scriptUrls: ["/app.js"] })),
);

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
