"""Embedding function for Chroma — local model, no API key required."""

from chromadb.api.types import Documents, EmbeddingFunction, Embeddings


class LocalEmbeddingFunction(EmbeddingFunction[Documents]):
    """Wrap Chroma's default ONNX MiniLM embedder for offline indexing."""

    def __init__(self) -> None:
        from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

        self._ef = DefaultEmbeddingFunction()

    def __call__(self, input: Documents) -> Embeddings:
        return self._ef(input)

    def name(self) -> str:
        return "local-minilm"


def get_embedding_function() -> EmbeddingFunction[Documents]:
    """Return the shared local embedding function."""
    return LocalEmbeddingFunction()
