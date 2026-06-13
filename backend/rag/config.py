"""RAG configuration — paths and retrieval defaults."""

import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = BACKEND_ROOT / "data" / "knowledge"
CHROMA_DIR = Path(os.getenv("CHROMA_PERSIST_DIR", str(BACKEND_ROOT / "data" / "chroma")))
COLLECTION_NAME = "cybersentinel_kb"

RAG_ENABLED = os.getenv("RAG_ENABLED", "true").lower() in ("1", "true", "yes")
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "3"))
RAG_MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.35"))
CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "800"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "100"))
