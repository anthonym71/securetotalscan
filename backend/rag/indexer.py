"""Load knowledge markdown, chunk, embed, and persist to Chroma."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

from rag.config import CHROMA_DIR, CHUNK_OVERLAP, CHUNK_SIZE, KNOWLEDGE_DIR
from rag.store import get_collection, reset_collection


@dataclass
class KnowledgeDoc:
    path: str
    doc_type: str
    framework: str
    tags: list[str]
    control_ids: list[str]
    body: str


FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


def _parse_frontmatter(text: str, rel_path: str) -> KnowledgeDoc:
    doc_type = "general"
    framework = ""
    tags: list[str] = []
    control_ids: list[str] = []
    body = text

    match = FRONTMATTER_RE.match(text)
    if match:
        meta_block, body = match.group(1), match.group(2)
        for line in meta_block.splitlines():
            if ":" not in line:
                continue
            key, raw = line.split(":", 1)
            value = raw.strip()
            if key.strip() == "doc_type":
                doc_type = value
            elif key.strip() == "framework":
                framework = value
            elif key.strip() == "tags":
                tags = [t.strip() for t in value.strip("[]").split(",") if t.strip()]
            elif key.strip() == "control_ids":
                control_ids = [
                    c.strip() for c in value.strip("[]").split(",") if c.strip()
                ]

    return KnowledgeDoc(
        path=rel_path,
        doc_type=doc_type,
        framework=framework,
        tags=tags,
        control_ids=control_ids,
        body=body.strip(),
    )


def load_knowledge_docs(knowledge_dir: Path | None = None) -> list[KnowledgeDoc]:
    """Read all markdown files under the knowledge directory."""
    root = knowledge_dir or KNOWLEDGE_DIR
    docs: list[KnowledgeDoc] = []
    if not root.exists():
        return docs

    for path in sorted(root.rglob("*.md")):
        rel = str(path.relative_to(root))
        docs.append(_parse_frontmatter(path.read_text(encoding="utf-8"), rel))
    return docs


def _splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n## ", "\n### ", "\n\n", "\n", " "],
    )


def index_knowledge(*, rebuild: bool = True) -> dict:
    """Index bundled knowledge into Chroma. Returns summary stats."""
    docs = load_knowledge_docs()
    if not docs:
        raise FileNotFoundError(f"No markdown files found in {KNOWLEDGE_DIR}")

    collection = reset_collection() if rebuild else get_collection()
    if collection is None:
        raise RuntimeError("RAG is disabled or collection unavailable")

    splitter = _splitter()
    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict] = []

    for doc in docs:
        chunks = splitter.split_text(doc.body)
        for i, chunk in enumerate(chunks):
            if not chunk.strip():
                continue
            chunk_id = f"{doc.path}::{i}"
            ids.append(chunk_id)
            documents.append(chunk)
            metadatas.append(
                {
                    "source": doc.path,
                    "doc_type": doc.doc_type,
                    "framework": doc.framework or "",
                    "tags": ",".join(doc.tags),
                    "control_ids": ",".join(doc.control_ids),
                    "chunk_index": i,
                }
            )

    if not ids:
        raise ValueError("No chunks produced from knowledge documents")

    # Upsert in batches for large corpora
    batch_size = 100
    for start in range(0, len(ids), batch_size):
        end = start + batch_size
        collection.upsert(
            ids=ids[start:end],
            documents=documents[start:end],
            metadatas=metadatas[start:end],
        )

    return {
        "files_indexed": len(docs),
        "chunks_indexed": len(ids),
        "persist_dir": str(CHROMA_DIR),
        "sources": sorted({d.path for d in docs}),
    }
