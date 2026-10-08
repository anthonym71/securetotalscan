"""
GitHub repository scanner — language detection + static code vulnerability analysis.

Uses the GitHub REST API (optional GIT_TOKEN for higher rate limits).
"""

import base64
import json
from bisect import bisect_right
import os
import re
import time
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from tools.source_analysis import accepts_match, literal_at, source_view

GITHUB_API = "https://api.github.com"

SCANNABLE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".go",
    ".rb",
    ".php",
    ".java",
    ".cs",
    ".rs",
    ".kt",
    ".swift",
    ".yaml",
    ".yml",
    ".json",
    ".sql",
    ".sh",
    ".bash",
    ".env",
    ".toml",
    ".cfg",
    ".ini",
    ".tf",
    ".hcl",
    ".tfvars",
}

PRIORITY_EXTENSIONS = {
    ".tf": 0,
    ".hcl": 0,
    ".tfvars": 1,
    ".py": 2,
    ".go": 2,
    ".js": 3,
    ".ts": 3,
}

SKIP_PATH_PARTS = {
    "node_modules",
    "vendor",
    "dist",
    "build",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "coverage",
    ".next",
    "target",
    "tests",
    "__tests__",
    "spec",
}

MAX_FILE_BYTES = 100_000

# (regex, owasp, name, severity, recommendation)
CODE_PATTERNS: list[tuple[str, str, str, str, str]] = [
    (
        r'(?i)(api[_-]?key|secret|password|token|auth)\s*=\s*["\'][^"\']{8,}["\']',
        "OWASP-A02",
        "Hardcoded Secret",
        "CRITICAL",
        "Move secrets to environment variables or a secrets manager",
    ),
    (
        r"(?:AKIA[A-Z0-9]{16}|sk-or-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})",
        "OWASP-A02",
        "Exposed Credential Pattern",
        "CRITICAL",
        "Rotate the credential and remove it from source control",
    ),
    (
        r"(?i)\b(?:SELECT|INSERT|UPDATE|DELETE)\s+[^\n]+",
        "OWASP-A03",
        "SQL Injection Risk",
        "HIGH",
        "Use parameterized queries or an ORM",
    ),
    (
        r"\beval\s*\(",
        "OWASP-A03",
        "Use of eval()",
        "HIGH",
        "Avoid eval; use safe parsing alternatives",
    ),
    (
        r"\bexec\s*\(",
        "OWASP-A03",
        "Use of exec()",
        "HIGH",
        "Remove dynamic code execution",
    ),
    (
        r"pickle\.loads\s*\(",
        "OWASP-A08",
        "Unsafe Deserialization",
        "HIGH",
        "Do not deserialize untrusted pickle data",
    ),
    (
        r"subprocess\.(call|run|Popen)\([^)]*shell\s*=\s*True",
        "OWASP-A03",
        "Shell Injection Risk",
        "HIGH",
        "Use shell=False and pass argument lists",
    ),
    (
        r"yaml\.load\s*\([^)]*\)",
        "OWASP-A08",
        "Unsafe YAML Load",
        "MEDIUM",
        "Use yaml.safe_load instead of yaml.load",
    ),
    (
        r"(?i)debug\s*=\s*True",
        "OWASP-A05",
        "Debug Mode Enabled",
        "MEDIUM",
        "Disable debug in production deployments",
    ),
    (
        r"(?i)verify\s*=\s*False",
        "OWASP-A02",
        "TLS Verification Disabled",
        "HIGH",
        "Enable certificate verification for HTTPS requests",
    ),
    (
        r"(?i)Access-Control-Allow-Origin['\"]?\s*[:=]\s*['\"]?\*",
        "OWASP-A05",
        "Permissive CORS",
        "MEDIUM",
        "Restrict CORS to trusted origins",
    ),
    (
        r"(?i)(md5|sha1)\s*\([^)]*password",
        "OWASP-A02",
        "Weak Password Hashing",
        "HIGH",
        "Use bcrypt, scrypt, or Argon2 for password hashing",
    ),
    (
        r"innerHTML\s*=",
        "OWASP-A03",
        "DOM XSS Risk",
        "MEDIUM",
        "Use textContent or sanitize HTML before insertion",
    ),
    (
        r"dangerouslySetInnerHTML",
        "OWASP-A03",
        "React XSS Risk",
        "MEDIUM",
        "Sanitize content before using dangerouslySetInnerHTML",
    ),
    (
        r"http://(?!localhost|127\.0\.0\.1)",
        "OWASP-A02",
        "Insecure HTTP URL",
        "LOW",
        "Use HTTPS for external communications",
    ),
]

# Terraform / HCL security patterns
TERRAFORM_PATTERNS: list[tuple[str, str, str, str, str]] = [
    (
        r"0\.0\.0\.0/0",
        "OWASP-A01",
        "Overly Permissive Network (0.0.0.0/0)",
        "CRITICAL",
        "Restrict security group rules to specific CIDR ranges, not the entire internet",
    ),
    (
        r'(?i)cidr_blocks\s*=\s*\[\s*"0\.0\.0\.0/0"\s*\]',
        "OWASP-A01",
        "Open Ingress CIDR (0.0.0.0/0)",
        "CRITICAL",
        "Replace 0.0.0.0/0 with least-privilege CIDR blocks",
    ),
    (
        r'(?i)acl\s*=\s*"public-read"',
        "OWASP-A01",
        "Public S3 ACL",
        "CRITICAL",
        "Use private buckets with IAM policies instead of public ACLs",
    ),
    (
        r"(?i)block_public_acls\s*=\s*false",
        "OWASP-A01",
        "S3 Public ACLs Allowed",
        "HIGH",
        "Set block_public_acls = true on S3 bucket resources",
    ),
    (
        r"(?i)ignore_public_acls\s*=\s*false",
        "OWASP-A01",
        "S3 Ignores Public ACLs Disabled",
        "HIGH",
        "Set ignore_public_acls = true to block public ACL usage",
    ),
    (
        r"(?i)(encrypt\s*=\s*false|storage_encrypted\s*=\s*false|encrypted\s*=\s*false)",
        "OWASP-A02",
        "Encryption Disabled",
        "HIGH",
        "Enable encryption at rest for storage and database resources",
    ),
    (
        r'action\s*=\s*"\*"',
        "OWASP-A01",
        "Wildcard IAM Action",
        "HIGH",
        "Scope IAM actions to the minimum permissions required",
    ),
    (
        r'resource\s*=\s*"\*"',
        "OWASP-A01",
        "Wildcard IAM Resource",
        "HIGH",
        "Restrict IAM resources to specific ARNs instead of *",
    ),
    (
        r"(?i)assign_public_ip\s*=\s*true",
        "OWASP-A05",
        "Public IP Assignment",
        "MEDIUM",
        "Avoid public IPs unless required; use private subnets and NAT",
    ),
    (
        r"(?i)mapPublicIpOnLaunch\s*=\s*true",
        "OWASP-A05",
        "Subnet Auto-Assigns Public IP",
        "MEDIUM",
        "Disable mapPublicIpOnLaunch for private subnets",
    ),
    (
        r'(?i)(password|secret|token|api_key)\s*=\s*"[^$"{][^"]{4,}"',
        "OWASP-A02",
        "Hardcoded Secret in Terraform",
        "CRITICAL",
        "Use variables, AWS Secrets Manager, or SSM Parameter Store",
    ),
    (
        r"(?i)protocol\s*=\s*\"-1\"",
        "OWASP-A01",
        "All Protocols Allowed in Security Group",
        "HIGH",
        "Restrict to specific protocols (tcp/udp) and ports",
    ),
]


def _should_skip_scan_path(path: str) -> bool:
    """Skip test fixtures and other non-production paths."""
    basename = os.path.basename(path)
    if basename.startswith("test_") and basename.endswith(".py"):
        return True
    if basename.endswith("_test.py") or basename.endswith("_test.ts"):
        return True
    if basename.endswith(".test.ts") or basename.endswith(".test.tsx"):
        return True
    if basename.endswith(".spec.ts") or basename.endswith(".spec.tsx"):
        return True
    return False


def _is_scanner_meta_line(line: str, matched_name: str) -> bool:
    """Ignore matches inside this file's own pattern/rule definitions."""
    stripped = line.strip()
    if f'"{matched_name}"' in stripped or f"'{matched_name}'" in stripped:
        return True
    if re.match(r'^\s*"[^"]*",?\s*$', stripped) or re.match(r"^\s*'[^']*',?\s*$", stripped):
        return True
    if "OWASP-A" in stripped and ('"' in stripped or "'" in stripped):
        return True
    if re.match(r'^\s*r["\']', stripped) and (
        "(?i)" in stripped or "\\" in stripped or "|" in stripped
    ):
        return True
    if re.match(r'^\s*r["\'][^"\']*["\'],?\s*$', stripped):
        return True
    return False


# GitHub's own naming rules. owner/repo are interpolated into api.github.com
# paths that carry our GitHub token, so anything outside the grammar ("..",
# extra slashes, "?", "#", "%") is refused: otherwise a crafted "repo" could
# steer an authenticated request to a different API endpoint.
_OWNER_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
_REPO_RE = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
_GITHUB_HOSTS = {"github.com", "www.github.com"}


def _validated(owner: str, name: str) -> tuple[str, str]:
    name = name.removesuffix(".git")
    # fullmatch, not match: "$" also matches before a trailing newline.
    if not _OWNER_RE.fullmatch(owner) or not _REPO_RE.fullmatch(name) or name in (".", ".."):
        raise ValueError("Invalid repo — use owner/repo or full GitHub URL")
    return owner, name


def parse_github_url(repo: str) -> tuple[str, str]:
    """Return (owner, repo_name) from URL or owner/repo string."""
    repo = repo.strip().rstrip("/")
    if repo.startswith("http"):
        parsed = urlparse(repo)
        if (parsed.hostname or "").lower() not in _GITHUB_HOSTS:
            raise ValueError("Invalid GitHub URL — expected github.com/owner/repo")
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        if len(parts) < 2:
            raise ValueError("Invalid GitHub URL — expected github.com/owner/repo")
        return _validated(parts[0], parts[1])
    if repo.count("/") == 1:
        owner, name = repo.split("/", 1)
        return _validated(owner, name)
    raise ValueError("Invalid repo — use owner/repo or full GitHub URL")


def _github_token() -> str:
    """GitHub PAT for higher API rate limits (prefer GIT_TOKEN on Railway/backend)."""
    return os.getenv("GIT_TOKEN") or os.getenv("GITHUB_TOKEN") or ""


def _headers() -> dict[str, str]:
    """Build GitHub REST API request headers, including optional auth token."""
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = _github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _get(client: httpx.Client, path: str) -> dict | list:
    """Perform an authenticated GET against the GitHub API."""
    # Streaming bounds apply before JSON/base64 decoding; never follow API redirects.
    limit = 8 * 1024 * 1024 if "/git/trees/" in path else 2 * 1024 * 1024
    chunks = bytearray()
    deadline = getattr(client, "scan_deadline", None)
    remaining = deadline - time.monotonic() if deadline else 20
    if remaining <= 0:
        raise TimeoutError("Repository scan deadline")
    with client.stream("GET", f"{GITHUB_API}{path}", headers=_headers(), timeout=min(20, remaining),
                       follow_redirects=False) as resp:
        resp.raise_for_status()
        for chunk in resp.iter_bytes():
            if deadline and time.monotonic() >= deadline:
                raise TimeoutError("Repository scan deadline")
            if len(chunks) + len(chunk) > limit:
                raise ValueError("GitHub response exceeds safe size limit")
            chunks.extend(chunk)
    return json.loads(chunks)


def fetch_repo_languages(client: httpx.Client, owner: str, repo: str) -> dict[str, float]:
    """Return language -> percentage of repo bytes."""
    data = _get(client, f"/repos/{owner}/{repo}/languages")
    if not data:
        return {}
    total = sum(data.values())
    return {lang: round(bytes_ / total * 100, 1) for lang, bytes_ in data.items()}


def fetch_default_branch(client: httpx.Client, owner: str, repo: str) -> str:
    """Return the repository default branch name (usually ``main``)."""
    meta = _get(client, f"/repos/{owner}/{repo}")
    return meta.get("default_branch", "main")


def list_scannable_files(
    client: httpx.Client,
    owner: str,
    repo: str,
    branch: str,
    languages: dict[str, float] | None = None,
) -> list[str]:
    """Legacy helper: list source paths without a file-count cap.

    The production scanner uses immutable, exhaustive inventory instead.

    Prioritizes Terraform/HCL files when the repo is IaC-heavy.
    """
    tree = _get(client, f"/repos/{owner}/{repo}/git/trees/{_quote_ref(branch)}?recursive=1")
    candidates: list[str] = []
    langs = languages or {}
    hcl_repo = "HCL" in langs and langs.get("HCL", 0) >= 10

    for item in tree.get("tree", []):
        if item.get("type") != "blob":
            continue
        path = item["path"]
        if any(part in SKIP_PATH_PARTS for part in path.split("/")):
            continue
        if _should_skip_scan_path(path):
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext not in SCANNABLE_EXTENSIONS:
            continue
        if item.get("size", 0) > MAX_FILE_BYTES:
            continue
        candidates.append(path)

    def sort_key(path: str) -> tuple[int, str]:
        ext = os.path.splitext(path)[1].lower()
        if hcl_repo and ext in (".tf", ".hcl", ".tfvars"):
            return (0, path)
        priority = PRIORITY_EXTENSIONS.get(ext, 4)
        return (priority, path)

    candidates.sort(key=sort_key)
    return candidates


def _check_segments(value: str, what: str) -> None:
    if not value or any(ord(c) < 0x20 or c == "\x7f" for c in value):
        raise ValueError(f"Invalid {what}")
    if any(part in ("", ".", "..") for part in value.split("/")):
        raise ValueError(f"Invalid {what}")


def _quote_ref(branch: str) -> str:
    """Encode a branch name from the scanned repo for a token-bearing API URL.

    Branch and file names come from the repository being scanned, so a hostile
    repo chooses them. Git allows ?, # and % in both; unencoded they would
    add a query or fragment to our authenticated request. "/" is kept, since
    branch names such as feature/x are normal; empty, "." and ".." segments
    are refused.
    """
    _check_segments(branch, "branch name")
    return quote(branch, safe="/")


def _quote_path(path: str) -> str:
    """Encode a file path from the scanned repo for a token-bearing API URL."""
    _check_segments(path, "file path")
    return quote(path, safe="/")


def fetch_file_content(client: httpx.Client, owner: str, repo: str, path: str) -> str:
    """Download and decode a single file from the GitHub contents API."""
    data = _get(client, f"/repos/{owner}/{repo}/contents/{_quote_path(path)}")
    if isinstance(data, list):
        return ""
    content = data.get("content", "")
    if data.get("encoding") == "base64" and content:
        return base64.b64decode(content).decode("utf-8", errors="ignore")
    return content


MAX_FINDINGS_PER_FILE = 1000


class FindingsLimitError(ValueError):
    """Analysis is incomplete; caller must record this file as failed."""


def scan_source_code(content: str, path: str, language: str) -> list[dict]:
    """Run regex-based security patterns against file content.

    Applies general code patterns plus Terraform rules for ``.tf``/``.hcl`` files.
    """
    findings: list[dict] = []
    view = source_view(content, language)
    lines = content.splitlines()
    line_starts = [0] + [m.end() for m in re.finditer("\n", content)]
    ext = os.path.splitext(path)[1].lower()
    patterns = list(CODE_PATTERNS)
    if ext in (".tf", ".hcl", ".tfvars") or language == "HCL":
        patterns.extend(TERRAFORM_PATTERNS)

    for pattern, owasp, name, severity, recommendation in patterns:
        regex = re.compile(pattern)
        for match in regex.finditer(content if name == "Exposed Credential Pattern" else view.text):
            if not accepts_match(view, match, name, language):
                continue
            if len(findings) >= MAX_FINDINGS_PER_FILE:
                raise FindingsLimitError("Per-file finding safety limit exceeded; analysis incomplete")
            line_no = bisect_right(line_starts, match.start())
            line = lines[line_no - 1]
            credential = "Secret" in name or "Credential" in name
            # Only an explicit dummy value in a test path is a fixture. A
            # variable named TEST_TOKEN can still contain a real credential.
            test_path = any(part in {"tests", "__tests__", "spec"} for part in path.split("/")) or os.path.basename(path) == "conftest.py" or os.path.basename(path).startswith("test_")
            fixture = (name != "Exposed Credential Pattern" and credential and test_path
                       and bool(re.search(r"=[\s]*[\"'](?:test|dummy|example|fake)[-_]", match.group(), re.I)))
            snippet = line.strip()
            # A different rule on the same line must not leak the credential.
            for secret_pattern, *_ in CODE_PATTERNS[:2]:
                snippet = re.sub(secret_pattern, "[REDACTED]", snippet)
            sql_literal = literal_at(view, match.start()) if name == "SQL Injection Risk" else None
            template_sql = bool(sql_literal and view.text[sql_literal[0]:].startswith("`"))
            findings.append({
                "category": owasp,
                "name": name,
                "severity": "INFO" if fixture else severity,
                "recommendation": "Verify this fixture value is never accepted in production" if fixture else ("Verify the tag binds interpolation as parameters; parameterized tags may be safe" if template_sql else recommendation),
                "file": path,
                "line": line_no,
                "column": match.start() - line_starts[line_no - 1] + 1,
                "language": language,
                "snippet": "[REDACTED: credential-like literal]" if credential else snippet[:120],
                "source": "github_code_scan",
                "disposition": "test_fixture" if fixture else "needs_review",
                "confidence": "low" if fixture or template_sql else "medium",
                "evidence_type": "static_pattern",
                "verified": False,
            })
    return findings


def _guess_language(path: str, repo_languages: dict[str, float]) -> str:
    """Infer language from file extension, falling back to repo primary language."""
    ext = os.path.splitext(path)[1].lower()
    ext_map = {
        ".py": "Python",
        ".js": "JavaScript",
        ".jsx": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".go": "Go",
        ".rb": "Ruby",
        ".php": "PHP",
        ".java": "Java",
        ".cs": "C#",
        ".rs": "Rust",
        ".kt": "Kotlin",
        ".swift": "Swift",
        ".sql": "SQL",
        ".sh": "Shell",
        ".bash": "Shell",
        ".json": "JSON",
        ".yaml": "YAML",
        ".yml": "YAML",
        ".toml": "TOML",
        ".ini": "INI",
        ".cfg": "INI",
        ".env": "INI",
        ".tf": "HCL",
        ".hcl": "HCL",
        ".tfvars": "HCL",
    }
    if os.path.basename(path) == ".env" or os.path.basename(path).startswith(".env."):
        return "INI"
    if ext in ext_map:
        return ext_map[ext]
    if repo_languages:
        return max(repo_languages, key=repo_languages.get)
    return "Unknown"


def scan_github_repo(repo_url: str) -> dict[str, Any]:
    """
    Scan a public GitHub repository.
    Returns languages, primary language, files scanned, and code findings.
    """
    owner, repo = parse_github_url(repo_url)
    full_name = f"{owner}/{repo}"

    from tools.github_inventory import scan_inventory
    from tools.github_inventory import DEADLINE_SECONDS

    deadline = time.monotonic() + DEADLINE_SECONDS
    with httpx.Client(follow_redirects=False) as client:
        client.scan_deadline = deadline
        prefix = f"/repos/{owner}/{repo}"
        meta = _get(client, prefix)
        if meta.get("private") is not False:
            raise ValueError("Only public repositories are supported by this scanner")
        branch = meta.get("default_branch", "main")
        commit = _get(client, f"{prefix}/commits/{_quote_ref(branch)}")
        commit_sha = commit["sha"]
        tree_sha = commit["commit"]["tree"]["sha"]
        if not re.fullmatch(r"[0-9a-f]{40}", commit_sha) or not re.fullmatch(r"[0-9a-f]{40}", tree_sha):
            raise ValueError("Invalid repository commit metadata")
        # Languages are descriptive only, not a substitute for analyzed file counts.
        try:
            languages = fetch_repo_languages(client, owner, repo)
        except Exception:
            languages = {}

        def classify(item):
            if item.get("type") == "commit":
                return "submodule_external_repository"
            if item.get("type") != "blob":
                return "unsupported_git_entry"
            if item.get("mode") == "120000":
                return "symbolic_link_not_followed"
            path = item["path"]
            # Tests remain in scope: they can contain real secrets too.
            excluded_dirs = SKIP_PATH_PARTS - {"tests", "__tests__", "spec"}
            if any(part in excluded_dirs for part in path.split("/")[:-1]):
                return "generated_or_dependency_directory"
            basename = os.path.basename(path)
            ext = os.path.splitext(path)[1].lower()
            if ext not in SCANNABLE_EXTENSIONS and basename != ".env" and not basename.startswith(".env."):
                return "unsupported_file_type"
            return None

        findings, coverage = scan_inventory(
            lambda path: _get(client, path), prefix, tree_sha, commit_sha, classify,
            lambda content, path: scan_source_code(content, path, _guess_language(path, languages)),
            deadline=deadline,
        )
    primary = max(languages, key=languages.get) if languages else "Unknown"
    return {
        "github_repo": full_name,
        "repo_url": f"https://github.com/{full_name}",
        "default_branch": branch,
        "commit_sha": commit_sha,
        "repo_languages": languages,
        "primary_language": primary,
        "files_scanned": coverage["scanned_files"],
        "scan_coverage": coverage,
        "code_findings": findings,
    }


def scan_github_repo_safe(repo_url: str) -> dict[str, Any]:
    """Wrapper that returns empty scan on failure instead of raising."""
    try:
        return scan_github_repo(repo_url)
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        if status == 404:
            return {
                "error": "Public repository not found. Check the repository URL; private repositories are not supported."
            }
        if status == 403:
            return {
                "error": "GitHub API rate limit exceeded — set GIT_TOKEN on the Railway backend (GitHub PAT with repo read access)"
            }
        if status == 401:
            # 401 is a different problem from 404 and 403, and the generic
            # message sent people to check whether the token was *set*. A 401
            # means it is set and GitHub rejected it: expired, revoked, or
            # malformed. Fine-grained PATs expire by default, so this is the
            # failure a working deployment drifts into over time.
            return {
                "error": (
                    "GitHub rejected the credentials (401) — GIT_TOKEN on the "
                    "Railway backend is expired, revoked or malformed. Issue a "
                    "new PAT with repo read access and update it."
                )
            }
        return {"error": f"GitHub API error: {status}"}
    except ValueError as e:
        return {"error": str(e)}
    except Exception:
        return {"error": "Repository scan could not complete; retry or contact support"}
