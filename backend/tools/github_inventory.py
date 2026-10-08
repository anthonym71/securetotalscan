"""Bounded, immutable GitHub inventory. Limits produce explicit partial results."""
import base64
import json
import re
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor

MAX_ENTRIES = 20_000
MAX_FILE_BYTES = 512 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024
DEADLINE_SECONDS = 120
WORKERS = 4
MAX_FINDINGS = 2000
MAX_FINDING_BYTES = 512 * 1024
MAX_INVENTORY_PATH_BYTES = 1024 * 1024


def failure_reason(exc):
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    return f"github_http_{status}" if status else "read_or_decode_failed"


def collect(get, prefix, tree_sha, deadline):
    """Discard truncated recursive results and walk each immutable subtree."""
    entries, reasons, seen = [], [], set()
    path_bytes = 0

    def validate(response):
        if not isinstance(response, dict) or not isinstance(response.get("tree"), list) or type(response.get("truncated")) is not bool:
            reasons.append("invalid_tree_response")
            return [], True
        return response["tree"], response["truncated"]

    def valid(item):
        if not isinstance(item, dict):
            return False
        path, sha = item.get("path"), item.get("sha")
        return (isinstance(path, str) and bool(path) and
                not any(p in ("", ".", "..") for p in path.split("/")) and
                not any(ord(c) < 32 or ord(c) == 127 for c in path) and
                isinstance(sha, str) and re.fullmatch(r"[0-9a-f]{40}", sha) and
                item.get("type") in ("blob", "tree", "commit"))

    def add(item):
        nonlocal path_bytes
        if item["path"] in seen:
            reasons.append("duplicate_inventory_path")
            return
        seen.add(item["path"])
        size = len(item["path"].encode("utf-8")) + 128
        if path_bytes + size > MAX_INVENTORY_PATH_BYTES:
            reasons.append("inventory_metadata_limit")
            return
        path_bytes += size
        entries.append(item)

    raw, truncated = validate(get(f"{prefix}/git/trees/{tree_sha}?recursive=1"))
    if reasons:
        return [], reasons
    if not truncated:
        if len(raw) > MAX_ENTRIES:
            reasons.append("inventory_entry_limit")
        for item in raw[:MAX_ENTRIES]:
            if not valid(item):
                reasons.append("invalid_tree_entry")
            elif item["type"] != "tree":
                add(item)
        return entries, sorted(set(reasons))
    queue = deque([("", tree_sha)])
    visited_entries = 0
    while queue:
        if time.monotonic() >= deadline:
            reasons.append("inventory_deadline")
            break
        parent, sha = queue.popleft()
        try:
            raw, truncated = validate(get(f"{prefix}/git/trees/{sha}"))
        except Exception:
            reasons.append("inventory_subtree_unavailable")
            continue
        if truncated:
            reasons.append("inventory_subtree_truncated")
        local_seen = set()
        for item in raw:
            visited_entries += 1
            if visited_entries > MAX_ENTRIES:
                return entries, sorted(set(reasons + ["inventory_entry_limit"]))
            if not valid(item) or "/" in item["path"]:
                reasons.append("invalid_tree_entry")
                continue
            if item["path"] in local_seen:
                reasons.append("duplicate_inventory_path")
                continue
            local_seen.add(item["path"])
            path = parent + item["path"]
            if item["type"] == "tree":
                queue.append((path + "/", item["sha"]))
            else:
                add({**item, "path": path})
    return entries, sorted(set(reasons))


def scan_inventory(get, prefix, tree_sha, commit_sha, classify, analyze, deadline=None):
    deadline = deadline or (time.monotonic() + DEADLINE_SECONDS)
    entries, reasons = collect(get, prefix, tree_sha, deadline)
    coverage = {
        "status": "incomplete", "scope": "supported source files at commit",
        "commit_sha": commit_sha, "inventory_complete": not reasons,
        "inventoried_files": len(entries), "eligible_files": 0, "scanned_files": 0,
        "excluded_files": [], "failed_files": [], "incomplete_reasons": reasons,
        "limits": {"inventory_entries": MAX_ENTRIES, "file_bytes": MAX_FILE_BYTES,
                   "total_bytes": MAX_TOTAL_BYTES, "deadline_seconds": DEADLINE_SECONDS,
                   "findings": MAX_FINDINGS, "finding_bytes": MAX_FINDING_BYTES,
                   "inventory_path_bytes": MAX_INVENTORY_PATH_BYTES},
    }
    pending = []
    findings = []
    for item in entries:
        reason = classify(item)
        if reason:
            coverage["excluded_files"].append({"path": item["path"], "reason": reason})
        else:
            coverage["eligible_files"] += 1
            pending.append(item)

    def read(item):
        try:
            data = get(f"{prefix}/git/blobs/{item['sha']}")
            if data.get("encoding") != "base64":
                return None, "unsupported_blob_encoding"
            # Check before decoding so even a malicious oversized reply is bounded.
            encoded = data.get("content", "")
            if len(encoded) > MAX_FILE_BYTES * 2:
                return None, "file_size_limit"
            content = base64.b64decode("".join(encoded.split()), validate=True)
            if len(content) > MAX_FILE_BYTES:
                return None, "file_size_limit"
            if len(content) != item.get("size"):
                return None, "blob_size_mismatch"
            if b"\x00" in content:
                return None, "binary_content"
            text = content.decode("utf-8")
            if text.startswith("version https://git-lfs.github.com/spec/v1"):
                return None, "git_lfs_object_not_scanned"
            return text, None
        except Exception as exc:
            return None, failure_reason(exc)

    reserved = 0
    finding_bytes = 0
    finding_limit = False
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for start in range(0, len(pending), WORKERS):
            batch = []
            for item in pending[start:start + WORKERS]:
                size = item.get("size")
                reason = None
                if finding_limit:
                    reason = "finding_output_limit"
                elif time.monotonic() >= deadline:
                    reason = "scan_deadline"
                elif not isinstance(size, int) or size < 0:
                    reason = "unknown_file_size"
                elif size > MAX_FILE_BYTES:
                    reason = "file_size_limit"
                elif reserved + size > MAX_TOTAL_BYTES:
                    reason = "total_size_limit"
                if reason:
                    coverage["failed_files"].append({"path": item["path"], "reason": reason})
                else:
                    reserved += size
                    batch.append(item)
            for item, (content, reason) in zip(batch, pool.map(read, batch)):
                if reason:
                    coverage["failed_files"].append({"path": item["path"], "reason": reason})
                    continue
                try:
                    if time.monotonic() >= deadline:
                        raise TimeoutError("scan_deadline")
                    if finding_limit:
                        coverage["failed_files"].append({"path": item["path"], "reason": "finding_output_limit"})
                        continue
                    candidates = analyze(content, item["path"])
                    output_bytes = len(json.dumps(candidates, ensure_ascii=True).encode())
                    if len(findings) + len(candidates) > MAX_FINDINGS or finding_bytes + output_bytes > MAX_FINDING_BYTES:
                        finding_limit = True
                        coverage["failed_files"].append({"path": item["path"], "reason": "finding_output_limit"})
                        continue
                    findings.extend(candidates)
                    finding_bytes += output_bytes
                    if time.monotonic() >= deadline:
                        raise TimeoutError("scan_deadline")
                    coverage["scanned_files"] += 1
                except Exception as exc:
                    reason = "scan_deadline" if isinstance(exc, TimeoutError) else "finding_output_limit" if type(exc).__name__ == "FindingsLimitError" else "analysis_failed"
                    coverage["failed_files"].append({"path": item["path"], "reason": reason})
    if coverage["failed_files"]:
        coverage["incomplete_reasons"].append("eligible_files_not_scanned")
    if not coverage["eligible_files"]:
        coverage["incomplete_reasons"].append("no_supported_source_files")
    if coverage["inventory_complete"] and coverage["eligible_files"] > 0 and not coverage["failed_files"]:
        coverage["status"] = "complete"
    return findings, coverage
