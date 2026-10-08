import base64
import time
from unittest.mock import patch

from tools.github_inventory import collect, scan_inventory
from tools.github_scanner import scan_github_repo

SHA = "a" * 40
TREE = "b" * 40
CHILD = "c" * 40


def entry(path, **kw):
    return {"path": path, "sha": SHA, "type": "blob", "size": 3, "mode": "100644", **kw}


def tree(items, truncated=False):
    return {"tree": items, "truncated": truncated}


def test_more_than_60_are_read_and_actual_counts():
    items = [entry(f"file{i}.py") for i in range(150)]
    calls = []
    def get(path):
        calls.append(path)
        return tree(items) if "/trees/" in path else {"content": base64.b64encode(b"x=1").decode(), "encoding": "base64"}
    findings, cov = scan_inventory(get, "/repos/a/b", TREE, SHA, lambda _: None, lambda text, path: [])
    assert cov["status"] == "complete"
    assert cov["scanned_files"] == 150
    assert all(p.endswith("/" + SHA) for p in calls if "/blobs/" in p)


def test_finding_output_limit_is_explicit_and_accounted():
    def get(path):
        return tree([entry("one.py"), entry("two.py")]) if "/trees/" in path else {"encoding": "base64", "content": "eD0x"}
    with patch("tools.github_inventory.MAX_FINDINGS", 1):
        findings, cov = scan_inventory(get, "/repos/a/b", TREE, SHA, lambda _: None,
                                       lambda *_: [{"name": "one"}, {"name": "two"}])
    assert findings == []
    assert cov["status"] == "incomplete"
    assert cov["scanned_files"] == 0
    assert len(cov["failed_files"]) == 2
    assert {x["reason"] for x in cov["failed_files"]} == {"finding_output_limit"}


def test_finding_byte_limit_is_not_a_complete_scan():
    def get(path):
        return tree([entry("one.py")]) if "/trees/" in path else {"encoding": "base64", "content": "eD0x"}
    with patch("tools.github_inventory.MAX_FINDING_BYTES", 10):
        _, cov = scan_inventory(get, "/repos/a/b", TREE, SHA, lambda _: None,
                               lambda *_: [{"name": "too large for test budget"}])
    assert cov["status"] == "incomplete"
    assert cov["failed_files"][0]["reason"] == "finding_output_limit"


def test_inventory_metadata_limit_cannot_claim_full_inventory():
    with patch("tools.github_inventory.MAX_INVENTORY_PATH_BYTES", 1):
        items, reasons = collect(lambda _: tree([entry("one.py")]), "/repos/a/b", TREE, time.monotonic() + 10)
    assert items == []
    assert "inventory_metadata_limit" in reasons


def test_no_supported_files_is_not_a_completed_source_audit():
    _, cov = scan_inventory(lambda _: tree([entry("photo.png")]), "/repos/a/b", TREE, SHA,
                            lambda _: "unsupported_file_type", lambda *_: [])
    assert cov["inventory_complete"] is True
    assert cov["status"] == "incomplete"
    assert "no_supported_source_files" in cov["incomplete_reasons"]


def test_deadline_after_analysis_cannot_claim_complete():
    clock = [10.0]
    def get(path):
        return tree([entry("one.py")]) if "/trees/" in path else {"encoding": "base64", "content": "eD0x"}
    def analyze(*_):
        clock[0] = 21.0
        return []
    with patch("tools.github_inventory.time.monotonic", lambda: clock[0]):
        _, cov = scan_inventory(get, "/repos/a/b", TREE, SHA, lambda _: None, analyze, deadline=20)
    assert cov["status"] == "incomplete"
    assert cov["scanned_files"] == 0
    assert cov["failed_files"][0]["reason"] == "scan_deadline"


def test_truncated_recursive_tree_rebuilt_without_losing_files():
    def get(path):
        if "recursive" in path:
            return tree([entry("discarded.py")], True)
        if path.endswith(TREE):
            return tree([entry("src", type="tree", sha=CHILD), entry("root.py")])
        return tree([entry("nested.py")])
    items, reasons = collect(get, "/repos/a/b", TREE, time.monotonic() + 10)
    assert sorted(x["path"] for x in items) == ["root.py", "src/nested.py"]
    assert not reasons


def test_read_failure_and_exclusion_accounted():
    def get(path):
        if "/trees/" in path:
            return tree([entry("ok.py"), entry("bad.py", sha=CHILD), entry("photo.png")])
        if path.endswith(CHILD):
            raise RuntimeError("secret must never appear")
        return {"encoding": "base64", "content": "eD0x"}
    _, cov = scan_inventory(get, "/repos/a/b", TREE, SHA, lambda x: "unsupported_file_type" if x["path"].endswith("png") else None, lambda *_: [])
    assert cov["status"] == "incomplete"
    assert cov["scanned_files"] == 1
    assert len(cov["excluded_files"]) == len(cov["failed_files"]) == 1
    assert "secret" not in str(cov)
    assert cov["inventoried_files"] == cov["scanned_files"] + len(cov["excluded_files"]) + len(cov["failed_files"])


def test_malformed_and_duplicate_inventory_cannot_be_complete():
    for payload in ({}, {"tree": []}, {"tree": {}, "truncated": False}, tree([entry("x.py"), entry("x.py")]), tree([entry("x.py", sha="../../evil")])):
        _, reasons = collect(lambda _: payload, "/repos/a/b", TREE, time.monotonic()+10)
        assert reasons
    def get(path):
        return tree([], True) if "recursive" in path else {}
    _, reasons = collect(get, "/repos/a/b", TREE, time.monotonic()+10)
    assert "invalid_tree_response" in reasons


def test_size_deadline_analysis_and_lfs_failures_are_incomplete():
    from tools.github_inventory import MAX_FILE_BYTES
    for item, blob, analyze in [
        (entry("large.py", size=MAX_FILE_BYTES+1), {}, lambda *_: []),
        (entry("bad.py"), {"encoding": "base64", "content": "eD0x"}, lambda *_: (_ for _ in ()).throw(ValueError())),
        (entry("bad.py"), {"encoding": "base64", "content": "!!!"}, lambda *_: []),
    ]:
        _, cov = scan_inventory(lambda p: tree([item]) if "/trees/" in p else blob, "/repos/a/b", TREE, SHA, lambda _: None, analyze)
        assert cov["status"] == "incomplete" and cov["scanned_files"] == 0
    _, cov = scan_inventory(lambda _: tree([entry("x.py")]), "/repos/a/b", TREE, SHA, lambda _: None, lambda *_: [], deadline=time.monotonic()-1)
    assert cov["failed_files"][0]["reason"] == "scan_deadline"


def test_production_pins_commit_and_rejects_private():
    calls = []
    def get(client, path):
        calls.append(path)
        if path == "/repos/a/b":
            return {"private": False, "default_branch": "main"}
        if "/commits/" in path:
            return {"sha": SHA, "commit": {"tree": {"sha": TREE}}}
        if path.endswith("languages"):
            return {"Python": 3}
        if "/trees/" in path:
            assert TREE in path
            return tree([entry("tests/test_example.py")])
        assert path.endswith("/git/blobs/" + SHA)
        return {"encoding": "base64", "content": "eD0x"}
    with patch("tools.github_scanner._get", get):
        result = scan_github_repo("a/b")
    assert result["files_scanned"] == 1
    assert result["commit_sha"] == SHA
    assert result["scan_coverage"]["status"] == "complete"
    with patch("tools.github_scanner._get", return_value={"private": True}):
        import pytest
        with pytest.raises(ValueError, match="public"):
            scan_github_repo("a/b")
