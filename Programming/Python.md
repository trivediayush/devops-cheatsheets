# 🐍 Python Cheatsheet

**Python** — the language of automation, data, and glue code. Readable by design, batteries-included stdlib, and the default scripting choice for ops, data engineering, ML, and backend services.

---

## **1. Core Types & Syntax**

```python
# Variables — dynamically typed
name: str = "api"                 # type hints: optional but use them
count: int = 3
ratio: float = 0.75
active: bool = True
nothing = None                    # Python's null

# Collections
items = ["a", "b", "c"]           # list — ordered, mutable
point = (10, 20)                  # tuple — ordered, immutable
tags = {"dev", "prod"}            # set — unique, unordered
config = {"env": "prod", "replicas": 3}   # dict — key/value
user = {"name": "alice", **config}        # dict merge (3.9+: config | {"env": "prod"})

# Strings — immutable, rich methods
s = "Hello, World"
s.lower()                         # 'hello, world'
s.split(", ")                     # ['Hello', 'World']
"-".join(["a", "b"])              # 'a-b'
s.replace("World", "Ops")
s.startswith("Hello"), "World" in s
f"{name} has {count} replicas"    # f-strings — the default way
```

**Slicing — memorize this:**

```python
items = [1, 2, 3, 4, 5]
items[0]      # 1          items[-1]     # 5
items[1:3]    # [2, 3]     items[:2]     # [1, 2]
items[2:]     # [3, 4, 5]  items[::-1]   # [5, 4, 3, 2, 1]  (reverse)
items[::2]    # [1, 3, 5]  (every 2nd)
```

---

## **2. Comprehensions — The Pythonic Filter/Map**

```python
squares = [x**2 for x in range(10)]
evens = [x for x in nums if x % 2 == 0]
matrix_flat = [x for row in matrix for x in row]

lookup = {name: idx for idx, name in enumerate(servers)}
unique_errs = {e.code for e in errors}

# Generator — lazy, memory-friendly for big data
lines = (line.strip() for line in open("big.log"))
errors = sum(1 for line in lines if "ERROR" in line)
```

```python
# enumerate + zip — loop helpers
for i, svc in enumerate(["api", "web"], start=1):
    print(i, svc)
for name, port in zip(servers, ports):    # pairwise
    ...
dict(zip(keys, values))                    # two lists → dict
```

---

## **3. Functions — Full Pattern Set**

```python
def deploy(env, replicas=1, *, dry_run=False):   # * = keyword-only after
    """Docstring — what it does."""
    return {"env": env, "replicas": replicas}

def log_call(fn):                     # decorator — wrap a function
    def wrapper(*args, **kwargs):     # *args tuple, **kwargs dict
        print(f"calling {fn.__name__}")
        return fn(*args, **kwargs)
    return wrapper

@log_call
def health(): ...

# Lambda — one-expression anonymous function
by_size = sorted(files, key=lambda f: f.stat().st_size)

# Multiple returns = tuple
def parse(line):
    return host, int(port)
h, p = parse(line)                    # unpack
```

---

## **4. Error Handling**

```python
try:
    data = json.loads(raw)
except json.JSONDecodeError as e:      # specific first
    log.warning("bad json: %s", e)
    data = {}
except (KeyError, TypeError):          # multiple
    data = {}
except Exception as e:                 # last resort
    raise ValueError("config broken") from e   # chain — keeps cause
else:
    print("no exception")              # runs if try succeeded
finally:
    conn.close()                       # always runs

# Raise with context
if replicas < 0:
    raise ValueError(f"replicas must be >= 0, got {replicas}")

# Custom exceptions
class DeployError(Exception): pass
```

**EAFP > LBYL** — "easier to ask forgiveness than permission": `try/except` beats preemptive `if` checks in Python idioms (except when the exception is the common path).

---

## **5. Classes, Dataclasses & Protocols**

```python
from dataclasses import dataclass, field

@dataclass
class Server:
    name: str
    port: int = 8080
    tags: list[str] = field(default_factory=list)   # mutable default done right

    def url(self) -> str:
        return f"https://{self.name}:{self.port}"

s = Server("api", tags=["prod"])
dataclasses.asdict(s)                # → dict for JSON/logging

# Inheritance + dunder methods
class Service(Server):
    def __init__(self, name, version, **kw):
        super().__init__(name, **kw)
        self.version = version
    def __repr__(self):
        return f"Service({self.name}@{self.version})"
```

---

## **6. Iterators, Generators & Context Managers**

```python
# Generator — yields values lazily (huge files, streams)
def tail(path, n=10):
    with open(path) as f:
        yield from f.readlines()[-n:]

for line in tail("/var/log/app.log"):
    ...

# Context manager — guaranteed setup/teardown
from contextlib import contextmanager

@contextmanager
def temp_env(**env):
    old = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    try:
        yield
    finally:
        for k, v in old.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

with temp_env(ENV="test"):
    run_tests()
```

---

## **7. The Stdlib You'll Actually Use**

| Module | Use |
| --- | --- |
| `os` | env vars, paths, process — `os.environ`, `os.path.join`, `os.getcwd()` |
| `sys` | `sys.argv`, `sys.exit`, `sys.stdout/stderr` |
| `pathlib` | `Path` objects — join, glob, read/write — modern file handling |
| `json` | `loads/dumps/load/dump` |
| `re` | `re.search(r"error:\s+(\w+)", line)` → `.group(1)` |
| `subprocess` | run external commands — `subprocess.run([...], capture_output=True, text=True, check=True)` |
| `argparse` | proper CLI args — flags, choices, defaults |
| `logging` | `logging.getLogger(__name__)` + levels — not print() |
| `datetime`/`time` | `datetime.now(timezone.utc)`, `time.sleep`, `time.time()` |
| `itertools`/`functools` | `chain`, `groupby`, `lru_cache`, `partial`, `reduce` |
| `collections` | `Counter` (count occurrences), `defaultdict`, `deque` |
| `concurrent.futures` | `ThreadPoolExecutor` / `ProcessPoolExecutor` — parallel work |

```python
from collections import Counter, defaultdict
counts = Counter(p.status for p in pods)          # {'Running': 12, 'Pending': 2}
by_env = defaultdict(list); by_env["prod"].append(svc)

from functools import lru_cache
@lru_cache(maxsize=128)
def expensive_lookup(key): ...

from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(check_host, hosts))   # parallel IO-bound work
```

---

## **8. Files, JSON & HTTP**

```python
from pathlib import Path
import json, yaml, requests

Path("out.txt").write_text(text)
data = Path("cfg.yaml").read_text()
yaml.safe_load(data)                              # always safe_load
json.dumps(obj, indent=2)

resp = requests.get(url, params={"ns": "prod"}, timeout=10)
resp.raise_for_status()
resp.json()

# Streaming large download
with requests.get(url, stream=True) as r, open("f.bin","wb") as f:
    for chunk in r.iter_content(8192): f.write(chunk)
```

---

## **9. Virtual Envs, Deps & Testing**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip freeze > requirements.txt
pipx install <cli-tool>                  # isolated tool installs

# uv — the modern fast toolchain (10-100× faster)
uv venv && uv pip install requests
uv run script.py
```

```python
# pytest — the standard
def test_parse_port():
    assert parse("api:8080") == ("api", 8080)

def test_error():
    with pytest.raises(ValueError):
        parse("bad")

# Fixtures + parametrization
@pytest.fixture
def client(): return make_client()

@pytest.mark.parametrize("inp,out", [("a:1",("a",1)), ("b:2",("b",2))])
def test_multi(inp, out): assert parse(inp) == out
```

```bash
pytest -v              # verbose
pytest -k "parse"      # filter by name
pytest --tb=short      # short tracebacks
```

---

## **10. DevOps Recipes — The Real-World Patterns**

```python
#!/usr/bin/env python3
import argparse, logging, os, sys, subprocess, json
from pathlib import Path

log = logging.getLogger(__name__)

def run(cmd: list[str], check=True) -> subprocess.CompletedProcess:
    """Shell out safely — list args, never shell=True."""
    log.debug("running: %s", " ".join(cmd))
    return subprocess.run(cmd, capture_output=True, text=True, check=check)

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--env", required=True, choices=["dev","staging","prod"])
    args = p.parse_args()

    token = os.environ.get("DEPLOY_TOKEN") or sys.exit("DEPLOY_TOKEN unset")
    out = run(["kubectl","get","pods","-n",args.env,"-o","json"])
    pods = json.loads(out.stdout)
    running = [p["metadata"]["name"] for p in pods["items"]
               if p["status"]["phase"] == "Running"]
    print(f"{len(running)} running pods in {args.env}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

---

## 📚 **Learning Resources**

* 🔗 [Official Python Tutorial](https://docs.python.org/3/tutorial/)
* 📦 [Real Python](https://realpython.com/)
* 🛡️ [Python Standard Library](https://docs.python.org/3/library/)
* 🧪 [pytest docs](https://docs.pytest.org/)
