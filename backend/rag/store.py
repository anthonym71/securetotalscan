"""Chroma vector store access — persistent collection, no startup indexing."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

import chromadb
from chromadb.api.models.Collection import Collection

from rag.config import CHROMA_DIR, COLLECTION_NAME, RAG_ENABLED
from rag.embeddings import get_embedding_function

if TYPE_CHECKING:
    pass

_lock = threading.Lock()
_client: chromadb.PersistentClient | None = None
_collection: Collection | None = None


def _get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client


def get_collection() -> Collection | None:
    """Return the knowledge-base collection, or None if RAG is disabled."""
    if not RAG_ENABLED:
        return None

    global _collection
    with _lock:
        if _collection is not None:
            return _collection
        client = _get_client()
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=get_embedding_function(),
            metadata={"hnsw:space": "cosine"},
        )
        return _collection


def reset_collection() -> Collection:
    """Delete and recreate the collection (used by on-the-fly re-index)."""
    global _collection
    with _lock:
        client = _get_client()
        try:
            client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=get_embedding_function(),
            metadata={"hnsw:space": "cosine"},
        )
        return _collection


def is_ready() -> bool:
    """True when the collection exists and has at least one document."""
    if not RAG_ENABLED:
        return False
    try:
        collection = get_collection()
        if collection is None:
            return False
        return collection.count() > 0
    except Exception:
        return False


def status() -> dict:
    """Return index health for API and dashboard."""
    if not RAG_ENABLED:
        return {
            "enabled": False,
            "ready": False,
            "document_count": 0,
            "persist_dir": str(CHROMA_DIR),
            "message": "RAG is disabled (RAG_ENABLED=false)",
        }

    try:
        collection = get_collection()
        count = collection.count() if collection else 0
        return {
            "enabled": True,
            "ready": count > 0,
            "document_count": count,
            "persist_dir": str(CHROMA_DIR),
            "collection": COLLECTION_NAME,
            "message": (
                "Knowledge base indexed and ready"
                if count > 0
                else "Index empty — run scripts/index_knowledge.py or use dashboard re-index"
            ),
        }
    except Exception as exc:
        return {
            "enabled": True,
            "ready": False,
            "document_count": 0,
            "persist_dir": str(CHROMA_DIR),
            "message": f"Vector store error: {exc}",
        }
