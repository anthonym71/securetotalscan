"""Tests for RAG retrieval with a temporary vector index."""

import pytest

from rag.config import KNOWLEDGE_DIR


@pytest.fixture
def rag_index(tmp_path, monkeypatch):
    monkeypatch.setenv("CHROMA_PERSIST_DIR", str(tmp_path / "chroma"))
    monkeypatch.setenv("RAG_ENABLED", "true")
    monkeypatch.setenv("RAG_MIN_SCORE", "0.1")

    import rag.store as store

    store._client = None
    store._collection = None

    from rag.indexer import index_knowledge

    index_knowledge(rebuild=True)
    yield tmp_path


def test_retrieve_runbook_for_brute_force(rag_index):
    from rag.retriever import retrieve

    chunks = retrieve(
        "SSH brute force authentication failure",
        doc_types=["runbook"],
        tags=["brute_force"],
        k=2,
    )
    assert len(chunks) >= 1
    assert chunks[0].doc_type == "runbook"
    assert chunks[0].score > 0


def test_retrieve_nist_control(rag_index):
    from rag.retriever import retrieve

    chunks = retrieve(
        "PR.AC-1 identities credentials managed remediation",
        doc_types=["nist"],
        k=2,
    )
    assert len(chunks) >= 1
    assert "nist" in chunks[0].source or chunks[0].doc_type == "nist"


def test_retrieve_empty_when_disabled(monkeypatch):
    monkeypatch.setenv("RAG_ENABLED", "false")
    from rag.retriever import retrieve

    assert retrieve("anything") == []
