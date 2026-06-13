#!/usr/bin/env python3
"""Build the Chroma knowledge index before deploy (Railway / production).

Usage (from backend/):
    python -m scripts.index_knowledge

Requires bundled markdown under data/knowledge/. Does not run on app startup.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow running as `python -m scripts.index_knowledge` from backend/
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from rag.indexer import index_knowledge  # noqa: E402
from rag.store import status  # noqa: E402


def main() -> int:
    print("Indexing CyberSentinel knowledge base…")
    try:
        summary = index_knowledge(rebuild=True)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(summary, indent=2))
    st = status()
    print(f"Status: ready={st['ready']} chunks={st['document_count']}")
    return 0 if st["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
