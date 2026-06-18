# Idea: Optimize RAG Section

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** Deferred from [CMS Improvements spec](../done/2026-05-26-cms-improvements-spec.md) (§15). The RAG config UI already saves `model` / `systemPrompt` / `maxTokens` / `documentScope`, but the `queryRag` Cloud Function only consumes `storeName`.

## Problem / goal

Make the RAG section actually apply its saved configuration, and improve answer quality
(model selection, prompt, token budget, document scoping, citations).

## Initial scope (to refine)

- Pass `model` / `systemPrompt` / `maxTokens` / `documentScope` through `queryRag` and apply them.
- Citations / source references in the answer.
- Evaluate retrieval quality (chunking, embeddings, reranking).

## Open questions

- Which embedding/vector store; per-tenant isolation of `storeName`.
- Default model (latest Claude) and guardrails.

## Dependencies

- CMS RAG section (shipped). Requires `queryRag` Cloud Function changes.
