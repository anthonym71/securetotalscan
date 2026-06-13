"""Semantic retrieval over the CyberSentinel knowledge base."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from rag.config import RAG_ENABLED, RAG_MIN_SCORE, RAG_TOP_K
from rag.store import get_collection, is_ready


@dataclass
class RagChunk:
    text: str
    source: str
    doc_type: str
    score: float
    metadata: dict

    def to_dict(self, *, linked_to: str = "") -> dict:
        data = asdict(self)
        if linked_to:
            data["linked_to"] = linked_to
        return data


def retrieve(
    query: str,
    *,
    doc_types: list[str] | None = None,
    tags: list[str] | None = None,
    k: int | None = None,
) -> list[RagChunk]:
    """Return top-k chunks for a query. Empty if RAG disabled or index missing."""
    if not RAG_ENABLED or not query.strip() or not is_ready():
        return []

    collection = get_collection()
    if collection is None:
        return []

    top_k = k or RAG_TOP_K
    where: dict | None = None
    if doc_types:
        where = {"doc_type": {"$in": doc_types}}

    try:
        result = collection.query(
            query_texts=[query.strip()],
            n_results=top_k * 2 if tags else top_k,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception:
        return []

    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]

    chunks: list[RagChunk] = []
    for doc, meta, distance in zip(documents, metadatas, distances):
        if not doc or not meta:
            continue

        meta_tags = [t for t in (meta.get("tags") or "").split(",") if t]
        if tags and not any(t in meta_tags for t in tags):
            continue

        # Chroma cosine distance: 0 = identical; convert to similarity
        score = max(0.0, 1.0 - float(distance))
        if score < RAG_MIN_SCORE:
            continue

        chunks.append(
            RagChunk(
                text=doc,
                source=meta.get("source", "unknown"),
                doc_type=meta.get("doc_type", "general"),
                score=round(score, 3),
                metadata=dict(meta),
            )
        )

    chunks.sort(key=lambda c: c.score, reverse=True)
    return chunks[:top_k]
