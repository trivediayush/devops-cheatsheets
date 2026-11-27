# 🧠 GenAI, RAG & Agents — Applied AI Cheatsheet

**How modern GenAI apps are actually built.** Prompting, RAG, function calling, agents — the architecture patterns behind "AI features" in products, plus the infra that runs them.

---

## **1. Prompt Engineering — The Basics That Actually Matter**

| Technique | What it is | Example |
| --- | --- | --- |
| **Zero-shot** | Just ask | "Summarize this log output." |
| **Few-shot** | Give examples | 2–3 input→output pairs before the real input |
| **System prompt** | Persistent instructions/persona | "You are a senior SRE. Respond in JSON." |
| **Chain-of-thought** | Ask it to reason step-by-step | "Think through this step by step before answering." |
| **Structured output** | Demand JSON/specific format | `response_format={"type": "json_object"}` or JSON mode |

Prompt tips that survive contact with prod: put instructions early, be specific about format, give examples for odd formats, use delimiters for untrusted input, and version prompts like code.

---

## **2. RAG — The Pattern Behind "Chat with Your Data"**

```text
Offline (indexing):
docs → chunk → embed → store in vector DB (with metadata)

Runtime (query):
user question → embed → similarity search top-K chunks →
    prompt = question + retrieved chunks → LLM → grounded answer
```

| Component | What it does | Tools |
| --- | --- | --- |
| **Chunking** | Split docs into retrievable pieces (size + overlap matter) | Fixed-size, recursive, semantic chunkers |
| **Embedding model** | Text → vector | OpenAI `text-embedding-3`, open models (bge, e5, nomic) |
| **Vector DB** | Stores vectors + similarity search | pgvector, Qdrant, Weaviate, Pinecone, Milvus, Chroma |
| **Retriever** | Finds relevant chunks | Cosine similarity, hybrid (vector+keyword), reranking |
| **LLM** | Generates answer from retrieved context | Any — the retrieval does the grounding |

**Why RAG instead of fine-tuning?** RAG is *data retrieval* (always current, cited sources, cheap); fine-tuning is *behavior change* (style, format, domain patterns). Most "make it know our docs" requests = RAG. "Make it write like our team" = fine-tuning. Often you want both.

**RAG failure modes:** bad chunking (context split mid-idea), retrieval misses (wrong embeddings for domain), prompt stuffing (too many chunks → noise), stale index (docs change, vectors don't), and no reranking (top-K similarity ≠ most relevant).

```python
# Minimal RAG shape — embeddings + vector search + prompt
query_vec = embed(user_question)
chunks = vector_db.search(query_vec, k=5)
prompt = f"Context:\n{format(chunks)}\n\nQuestion: {user_question}\nAnswer using only the context."
answer = llm.complete(prompt)
```

---

## **3. Function Calling / Tool Use — The Bridge to Actions**

The model outputs structured "call this function with these args" — your code executes it and feeds results back. This is how LLMs *do things*.

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_pod_status",
        "description": "Get status of a Kubernetes pod",
        "parameters": {
            "type": "object",
            "properties": {"pod_name": {"type": "string"}},
            "required": ["pod_name"]
        }
    }
}]

# Loop: LLM → tool call → your code runs it → result back to LLM → final answer
response = client.chat.completions.create(model="gpt-4", messages=msgs, tools=tools)
if response.choices[0].message.tool_calls:
    result = get_pod_status(tool_call.args)      # YOUR code executes
    msgs.append(tool_result_message(result))      # feed result back
    response = client.chat.completions.create(...) # continue
```

**This is the primitive behind every "AI agent"** — the model decides *what* to call, your code decides *whether* to allow it.

---

## **4. Agents — LLMs in a Loop**

```text
ReAct loop (the basic pattern):
while not done:
    thought = LLM reasons about goal + observations
    action  = LLM picks a tool + args
    observation = your code executes action, returns result
return final answer
```

| Pattern | What it is | When |
| --- | --- | --- |
| **ReAct** | Reason + Act loop — think, call tool, observe, repeat | General agents, tool-using assistants |
| **Plan-and-execute** | LLM plans all steps upfront, then executes | Predictable multi-step tasks |
| **Multi-agent** | Specialized agents coordinate (planner/researcher/coder) | Complex tasks — complexity tax is real |
| **Human-in-the-loop** | Pause for approval on risky actions | Prod-grade automation — non-negotiable for writes |
| **MCP (Model Context Protocol)** | Standard protocol for connecting tools/data to LLM apps | Anthropic-originated, becoming the USB-C of tool wiring |

```python
# Minimal agent loop
tools = {"get_status": get_status, "restart_pod": restart_pod}
while True:
    out = llm(messages=history, tools=tool_schemas)
    if out.type == "final_answer":
        return out.text
    fn = tools[out.tool_name]
    if out.tool_name in DANGEROUS_TOOLS:
        confirm_with_human(out)               # HITL gate
    result = fn(**out.tool_args)
    history.append({"role": "tool", "result": result})
```

**Agent realities:** they fail quietly (wrong tool, infinite loop, hallucinated args) — you need: max-iteration limits, structured tool schemas, confirmation for irreversible ops, logging every thought+action (observability), and eval suites because "works on my prompt" isn't testing.

---

## **5. The Ops Side — LLMOps**

| Concern | What it means |
| --- | --- |
| **Prompt/version mgmt** | Prompts are code — version, review, A/B them |
| **Evals** | Automated quality tests (LLM-as-judge, regression suites) — the only way to know a change didn't break it |
| **Observability** | Trace every request: prompt, model, tokens, latency, cost — LangSmith, Langfuse, OTel |
| **Cost** | Per-token pricing → track per-user/feature spend; caching repeated queries; smaller models for simple tasks |
| **Rate limits/fallbacks** | Provider limits → queue, retry, multi-provider failover |
| **PII/guardrails** | Scrub PII from prompts, filter outputs (Guardrails, NeMo), on-prem models for regulated data |
| **Latency** | Time-to-first-token + tokens/sec — streaming UX, model size, prompt length all matter |

```python
# The production call shape — timeouts, retries, fallbacks, tracking
resp = llm.complete(messages, model="gpt-4o-mini",   # cheap model for simple tasks
                    timeout=30, max_retries=2,
                    fallback_models=["claude-haiku"]) # failover
track(user_id, model, resp.usage.prompt_tokens, resp.usage.completion_tokens)
```

---

## **6. Choosing the Right Tool**

```text
FAQ / docs Q&A on YOUR data          → RAG (vector search + LLM)
Deterministic, structured tasks      → Small model / fine-tuned / sometimes just regex
Text generation, summarization       → Any decent LLM via API
Multi-step with tools/actions        → Agent (ReAct + tool calling)
Highly regulated / air-gapped        → Self-hosted open model (Llama/Mistral + vLLM/Ollama)
Real-time classification at scale    → Small specialized model, not a giant LLM
```

---

## 📚 **Learning Resources**

* 🔗 [Prompt Engineering Guide](https://www.promptingguide.ai/)
* 📦 [Model Context Protocol](https://modelcontextprotocol.io/)
* 🛡️ [LangChain](https://python.langchain.com/) / [LlamaIndex](https://www.llamaindex.ai/)
* 🧪 [Langfuse](https://langfuse.com/) — LLM observability/evals
