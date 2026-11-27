# 🤖 AI Fundamentals for Engineers

**The vocabulary that makes AI conversations make sense** — ML vs GenAI, training vs inference, tokens, embeddings, GPUs. Written for infrastructure/platform people who need to *run* AI workloads and understand the engineers building them.

---

## **1. The Landscape — Where Things Fit**

```text
AI (broad: systems that mimic intelligence)
└── Machine Learning (learn patterns from data)
    ├── Classical ML (XGBoost, regression, random forests — tabular data, CPU-friendly)
    └── Deep Learning (neural networks — unstructured data: images, text, audio)
        └── Generative AI (models that *generate*: LLMs, image models)
            └── LLMs (GPT, Claude, Llama — text in, text out)
                └── Agents (LLMs + tools + loops — see GenAI-and-Agents)
```

---

## **2. Core Vocabulary**

| Term | Plain-English meaning |
| --- | --- |
| **Model** | A trained function — parameters (weights) + architecture. "The artifact." |
| **Training** | Optimizing weights on data — expensive (GPUs, days/weeks), done once. |
| **Inference** | Running the trained model to get predictions — cheap-ish, done per-request, latency-sensitive. |
| **Fine-tuning** | Continued training on your data — adapts a base model cheaply. |
| **Epoch / batch / learning rate** | One pass over data / chunk processed per step / step size. Training knobs. |
| **Parameters** | The learned weights — "7B model" = 7 billion. Size → memory + quality (roughly). |
| **GPU vs CPU** | GPUs = thousands of simple cores → parallel matrix math. That's the whole reason for the GPU bottleneck. |
| **Quantization** | Compress weights (FP16→INT8/INT4) — smaller/faster, slight quality loss. Runs on less GPU memory. |
| **VRAM** | GPU memory — the real capacity limiter. A 7B model ≈ 14GB at FP16, ~4GB at INT4. |

---

## **3. Training vs Inference — The Infra Split**

| | Training | Inference |
| --- | --- | --- |
| Compute | GPU clusters (multi-GPU, high interconnect) | Single GPU or CPU for small models |
| Pattern | Batch, long-running jobs | Latency-sensitive requests, autoscaling |
| Cost | $$$$ per run | $ per 1K requests/tokens |
| Infra primitives | Spot/preemptible OK, checkpointing, distributed training (Ray, DeepSpeed) | Model servers (vLLM, TGI, Ollama, Triton), autoscaling, batching |
| Data | Massive datasets, pipelines, labeling | Request payloads only |

**Key insight for platform work:** the workloads are opposites — training wants cheap burstable compute with checkpointing; inference wants low-latency, always-on, autoscaling endpoints. Don't conflate them.

---

## **4. LLM-Specific Vocabulary**

| Term | What it is | Why it matters |
| --- | --- | --- |
| **Token** | Text chunk (~4 chars, ¾ word avg) | The billing + context unit — everything is priced per token |
| **Prompt** | Input text | "system prompt" (instructions) vs "user prompt" (input) |
| **Context window** | Max tokens the model sees at once (4K–1M) | Long docs/conversations vs window limit — RAG exists partly for this |
| **Temperature** | Randomness of output (0=deterministic) | Lower for code/facts, higher for creative |
| **Hallucination** | Confidently wrong output | It's a pattern-matching engine, not a knowledge base — verify facts |
| **Embeddings** | Vector representation of text (semantic meaning as numbers) | The basis of search/RAG — "similar meaning = similar vectors" |
| **RAG** | Retrieval-Augmented Generation — fetch relevant docs, put them in the prompt | Grounds the model in *your* data without retraining |
| **Foundation model** | Big pretrained model you build on (GPT-4, Llama, Claude) | vs "fine-tuned model" adapted to your task |
| **Open vs closed weights** | Llama/Mistral (download, self-host) vs GPT/Claude (API only) | Self-host for privacy/cost; API for quality/convenience |

---

## **5. How an LLM Actually Works (One-Paragraph Version)**

Text → tokenizer → tokens → model predicts the *most likely next token* → generates one token at a time → repeat until stop. It's an extremely sophisticated autocomplete trained on massive text. No "thinking" in the human sense — but emergent capabilities (reasoning-like output, code, translation) appear at scale. The generated output depends on: the prompt + context window + temperature + sampling parameters.

```python
# Mental model — the API call is literally "complete this text"
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a concise DevOps expert."},
        {"role": "user", "content": "Explain Kubernetes in one line."}
    ],
    temperature=0.2,        # low = predictable
    max_tokens=100,
)
```

---

## **6. Serving & Infrastructure Vocabulary**

| Term | What it is |
| --- | --- |
| **Model server** | Runtime that serves a model behind an API — vLLM, TGI, Ollama, Triton, SageMaker endpoints |
| **vLLM / continuous batching** | High-throughput inference engine — batches requests mid-generation for 10×+ throughput |
| **KV cache** | Cached attention state per request — the main GPU memory consumer at inference |
| **Batching** | Grouping requests → throughput ↑, latency ↑ slightly. Big win for LLM serving |
| **Streaming** | Token-by-token response (SSE) — better UX, faster time-to-first-token |
| **LoRA / QLoRA** | Cheap fine-tuning: train small adapter layers, not the whole model |
| **GGUF / safetensors** | Model file formats — GGUF for llama.cpp (CPU-friendly), safetensors for PyTorch |
| **Ollama** | Run LLMs locally in one command — `ollama run llama3` |

```bash
# Self-host an LLM locally in 30 seconds
ollama pull llama3
ollama run llama3
ollama serve                       # serves http://localhost:11434 — OpenAI-compatible API
```

---

## **7. The DevOps-Relevant Mental Models**

* **Models are artifacts** — version them (model registry), scan them, deploy them like containers, roll them back.
* **GPU is the scarce resource** — scheduling (NVIDIA device plugin in K8s), sharing (MIG, time-slicing), and cost dominate infra decisions.
* **Inference is a workload like any other** — same ops problems: autoscaling, health checks, canaries, observability. Add: token metrics, latency-per-token, GPU utilization.
* **The API is the contract** — OpenAI-compatible APIs are the de-facto standard (self-hosters emulate it).
* **Data > model** — quality of your data beats a slightly bigger model in almost every applied scenario.

---

## 📚 **Learning Resources**

* 🔗 [LLM Visualization (bbycroft)](https://bbycroft.net/llm) — see the internals visually
* 📦 [Hugging Face](https://huggingface.co/) — model hub, docs, inference endpoints
* 🛡️ [Ollama](https://ollama.com/) / [vLLM](https://docs.vllm.ai/)
* 🧠 [Karpathy's "Intro to LLMs"](https://www.youtube.com/@AndrejKarpathy) — best 1-hour explanation
