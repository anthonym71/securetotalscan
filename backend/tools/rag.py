"""Lightweight RAG retrieval over bundled security knowledge chunks."""

import json
import re
from pathlib import Path

CHUNKS_PATH = Path(__file__).parent.parent / "data" / "knowledge" / "chunks.json"

_token_re = re.compile(r"[a-z0-9_]+")


def _tokenize(text: str) -> set[str]:
    return set(_token_re.findall(text.lower()))


def load_knowledge_chunks() -> list[dict]:
    """Load knowledge chunks from disk."""
    return json.loads(CHUNKS_PATH.read_text())


def _score_chunk(chunk: dict, query_tokens: set[str]) -> float:
    chunk_tokens = _tokenize(
        " ".join(
            [
                chunk.get("title", ""),
                chunk.get("content", ""),
                " ".join(chunk.get("tags", [])),
                chunk.get("framework", ""),
            ]
        )
    )
    if not query_tokens or not chunk_tokens:
        return 0.0
    overlap = query_tokens & chunk_tokens
    return len(overlap) / len(query_tokens)


def build_query_from_state(state: dict) -> str:
    """Build a retrieval query from pipeline findings."""
    parts: list[str] = []
    for anomaly in state.get("anomalies", []):
        parts.append(anomaly.get("type", ""))
        parts.append(anomaly.get("title", ""))
    for cve in state.get("cve_matches", [])[:5]:
        parts.append(cve.get("id", ""))
        parts.append(cve.get("description", "")[:120])
    for finding in state.get("code_findings", [])[:10]:
        parts.append(finding.get("name", ""))
        parts.append(finding.get("category", ""))
    for finding in state.get("docker_findings", [])[:10]:
        parts.append(finding.get("name", ""))
        parts.append(finding.get("category", ""))
    if state.get("docker_image"):
        parts.append("docker container image")
    if state.get("target_url"):
        parts.append("headers web security")
    return " ".join(p for p in parts if p)


def retrieve_context(
    state: dict,
    *,
    top_k: int = 5,
    chunks: list[dict] | None = None,
) -> list[dict]:
    """Retrieve top-k knowledge chunks relevant to current pipeline state.

    Returns:
        List of dicts with id, title, framework, content, and score.
    """
    query = build_query_from_state(state)
    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    source = chunks if chunks is not None else load_knowledge_chunks()
    scored = [
        {
            "id": c["id"],
            "title": c["title"],
            "framework": c["framework"],
            "content": c["content"],
            "score": _score_chunk(c, query_tokens),
        }
        for c in source
    ]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return [s for s in scored[:top_k] if s["score"] > 0]


def format_retrieved_context(chunks: list[dict]) -> str:
    """Format retrieved chunks for LLM prompt injection."""
    if not chunks:
        return "None"
    lines = []
    for i, c in enumerate(chunks, 1):
        lines.append(
            f"{i}. [{c['framework']}] {c['title']}: {c['content']}"
        )
    return "\n".join(lines)
