"""Tests for RAG knowledge loading and indexing."""

from pathlib import Path

import pytest

from rag.config import KNOWLEDGE_DIR
from rag.indexer import load_knowledge_docs


def test_load_knowledge_docs_finds_markdown():
    docs = load_knowledge_docs(KNOWLEDGE_DIR)
    assert len(docs) >= 6
    paths = {d.path for d in docs}
    assert "runbooks/ssh-brute-force.md" in paths


def test_knowledge_doc_parses_frontmatter():
    docs = load_knowledge_docs(KNOWLEDGE_DIR)
    brute = next(d for d in docs if d.path == "runbooks/ssh-brute-force.md")
    assert brute.doc_type == "runbook"
    assert "brute_force" in brute.tags
    assert "PR.AC-1" in brute.control_ids
    assert "SSH Brute Force" in brute.body


@pytest.mark.skipif(not KNOWLEDGE_DIR.exists(), reason="knowledge dir missing")
def test_index_knowledge_builds_collection(tmp_path, monkeypatch):
    """Integration: index into a temp Chroma dir."""
    monkeypatch.setenv("CHROMA_PERSIST_DIR", str(tmp_path / "chroma"))
    monkeypatch.setenv("RAG_ENABLED", "true")

    # Reset module-level singletons
    import rag.store as store

    store._client = None
    store._collection = None

    from rag.indexer import index_knowledge
    from rag.store import is_ready, status

    summary = index_knowledge(rebuild=True)
    assert summary["files_indexed"] >= 6
    assert summary["chunks_indexed"] > 0
    assert is_ready()
    assert status()["document_count"] > 0
