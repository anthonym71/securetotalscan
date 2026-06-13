"""Tests for RAG retrieval over security knowledge chunks."""

from tools.rag import build_query_from_state, load_knowledge_chunks, retrieve_context


def test_load_knowledge_chunks():
    chunks = load_knowledge_chunks()
    assert len(chunks) >= 10
    assert all("content" in c for c in chunks)


def test_retrieve_brute_force_context():
    state = {
        "anomalies": [{"type": "brute_force", "title": "SSH Brute Force", "severity": "CRITICAL"}],
        "cve_matches": [],
        "code_findings": [],
        "docker_findings": [],
    }
    results = retrieve_context(state, top_k=3)
    assert len(results) > 0
    assert any("brute" in r["content"].lower() or "authentication" in r["content"].lower() for r in results)


def test_retrieve_docker_context():
    state = {
        "anomalies": [],
        "docker_image": "nginx:latest",
        "docker_findings": [{"name": "Using :latest tag", "category": "CIS-Docker"}],
    }
    results = retrieve_context(state, top_k=3)
    assert any("docker" in r["content"].lower() or "latest" in r["content"].lower() for r in results)


def test_build_query_includes_docker_and_cve():
    state = {
        "anomalies": [{"type": "port_scan"}],
        "cve_matches": [{"id": "CVE-2024-1", "description": "network vuln"}],
        "docker_image": "nginx",
        "target_url": "https://example.com",
    }
    query = build_query_from_state(state)
    assert "port_scan" in query
    assert "CVE-2024-1" in query
    assert "docker" in query.lower() or "nginx" in query
