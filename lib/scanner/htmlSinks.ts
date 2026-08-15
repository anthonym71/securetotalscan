// ──────────────────────────────────────────────────────────────
// Unsafe-HTML sink detection.
//
// Why this file exists: scanning a concatenated blob of every JavaScript
// bundle flagged React and Next.js themselves. `react-dom` contains
// `.innerHTML = ` and the string `dangerouslySetInnerHTML` as part of its own
// prop handling, so every React site on the internet was reported as unsafe —
// a false positive that buries real findings.
//
// The rule we implement instead: only report HTML injection that the scanned
// application itself owns.
//
//   1. Framework and third-party bundles are excluded, identified by their
//      chunk naming convention and by fingerprints of the library source.
//   2. Within application code, only genuine sinks count: an assignment or
//      call whose argument is an expression, not a string literal, and a
//      `dangerouslySetInnerHTML` used as a prop with a value — not the string
//      appearing in a `case` label or a prop-name list.
// ──────────────────────────────────────────────────────────────

export interface ScriptSource {
  /** Absolute URL, or a marker such as `inline script #1`. */
  url: string;
  source: string;
}

export interface HtmlSink {
  url: string;
  /** Short, redacted excerpt showing what matched. */
  snippet: string;
}

/**
 * Bundle names that framework tooling generates for vendor code.
 * Application code in Next's App Router lives under `chunks/app/...`.
 */
const VENDOR_PATH_PATTERNS: RegExp[] = [
  // Next.js framework and shared vendor chunks.
  /\/_next\/static\/chunks\/(framework|main|main-app|webpack|polyfills)[-.]/i,
  /\/_next\/static\/chunks\/\d+[-.][0-9a-f]{8,}\.js$/i,
  /\/_next\/static\/chunks\/[0-9a-f]{6,}[-.][0-9a-f]{8,}\.js$/i,
  // Create React App / webpack / Vue CLI vendor bundles.
  /\/static\/js\/(runtime-|vendors[~.-]|npm\.)/i,
  /\/(chunk-vendors|vendors?)[-.][\w]+\.js$/i,
  // Anything served straight out of a dependency tree.
  /\/node_modules\//i,
  // Well-known libraries dropped in as plain <script> tags. A site owner
  // cannot fix HTML injection inside jQuery or Bootstrap, so reporting it is
  // noise rather than a finding.
  /\/(jquery|bootstrap|lodash|underscore|moment|alpine|htmx|swiper|slick|gsap|three|chart|d3|popper|tinymce|ckeditor|quill|summernote|dompurify|handlebars|mustache|knockout|backbone|ember|angular|vue|react|preact|svelte|zepto|prototype|mootools|axios|jquery-ui)([.-][\w.]*)?\.min\.js$/i,
  /\/(jquery|bootstrap|lodash|underscore|moment|alpine|htmx|swiper|gsap|three|angular|vue|react|preact|zepto)([.-]\d[\w.]*)?\.js$/i,
  /\/(vendor|vendors|libs?|plugins?|bundles?)\//i,
  /\/wp-includes\/js\//i,
  /\/cdn[-.]/i,
];

/**
 * Strings that only appear inside framework/library source. One is enough to
 * treat a bundle as third-party code the site owner did not write.
 */
const FRAMEWORK_FINGERPRINTS: string[] = [
  "Minified React error",
  "react-stack-bottom-frame",
  "__reactProps$",
  "react.dev/errors",
  "window.next={version:",
  "self.__next_f",
  "__NEXT_DATA__",
  "Vue warn",
  "[svelte]",
  "angular.io/errors",
  "jQuery JavaScript Library",
  "jQuery v",
  "jquery.com/license",
  "Bootstrap (https://getbootstrap.com",
  "@license lodash",
  "DOMPurify",
  "Alpine.js",
  "htmx.org",
];

/** True when this script is framework or third-party code, not app code. */
export function isVendorScript(url: string, source: string): boolean {
  if (VENDOR_PATH_PATTERNS.some((pattern) => pattern.test(url))) return true;
  return FRAMEWORK_FINGERPRINTS.some((marker) => source.includes(marker));
}

/**
 * Genuine DOM-XSS sinks.
 *
 * Each pattern requires a non-literal right-hand side: `el.innerHTML = value`
 * counts, `el.innerHTML = "<b>done</b>"` does not, because a constant string
 * cannot carry user input.
 */
const SINK_PATTERNS: { name: string; re: RegExp }[] = [
  // .innerHTML = expr  /  .outerHTML = expr  /  .innerHTML += expr
  { name: "innerHTML assignment", re: /\.(inner|outer)HTML\s*\+?=\s*(?!["'`\s;])/g },
  // insertAdjacentHTML("beforeend", expr)
  {
    name: "insertAdjacentHTML",
    re: /\.insertAdjacentHTML\s*\(\s*["'`][^"'`]*["'`]\s*,\s*(?!["'`])/g,
  },
  // dangerouslySetInnerHTML={{ __html: expr }} — a prop with a value, not the
  // bare identifier used as a key name or case label.
  {
    name: "dangerouslySetInnerHTML",
    re: /(?<!["'`])dangerouslySetInnerHTML\s*:\s*\{/g,
  },
];

function excerpt(source: string, index: number): string {
  const start = Math.max(0, index - 40);
  const raw = source.slice(start, index + 60).replace(/\s+/g, " ").trim();
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}

/** Find application-owned unsafe HTML sinks across the given scripts. */
export function findUnsafeHtmlSinks(scripts: ScriptSource[]): HtmlSink[] {
  const sinks: HtmlSink[] = [];

  for (const script of scripts) {
    if (!script.source) continue;
    if (isVendorScript(script.url, script.source)) continue;

    for (const { re, name } of SINK_PATTERNS) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(script.source))) {
        sinks.push({
          url: script.url,
          snippet: `${name}: ${excerpt(script.source, match.index)}`,
        });
        // One example per pattern per file is enough evidence.
        break;
      }
    }
  }

  return sinks;
}

/**
 * Inline `<script>` bodies, excluding framework hydration payloads which are
 * serialized data rather than application logic.
 */
export function extractInlineScripts(html: string): ScriptSource[] {
  const scripts: ScriptSource[] = [];
  const re = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = re.exec(html))) {
    index += 1;
    const body = match[1] ?? "";
    if (!body.trim()) continue;
    if (/self\.__next_f|__NEXT_DATA__|window\.__NUXT__|__remixContext/.test(body)) {
      continue;
    }
    scripts.push({ url: `inline script #${index}`, source: body });
  }
  return scripts;
}
