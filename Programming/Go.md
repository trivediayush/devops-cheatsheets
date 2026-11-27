# 🐹 Go Cheatsheet

**Go (Golang)** — compiled, concurrent, single-static-binary language built for infrastructure. Kubernetes, Docker, Terraform, Prometheus, etcd are all written in it. If you work in cloud-native, you read Go whether you write it or not.

---

## **1. Why Go for Infrastructure**

```text
Single static binary   → CGO_ENABLED=0 go build → runs in FROM scratch, no runtime
Fast compile + startup → CLIs that launch instantly
Goroutines             → thousands of concurrent tasks cheaply (controllers, watchers)
Strong stdlib          → HTTP, JSON, crypto, os, testing — batteries included
Cross-compile          → GOOS/GOARCH → build Windows .exe from Linux
Explicit errors        → no exceptions — reliability-critical systems
```

---

## **2. Toolchain**

```bash
go mod init mytool             # new module
go build -o app .              # compile
go run main.go                 # run directly
go test ./...                  # all tests
go vet ./...                   # static analysis
go fmt ./...                   # format (gofmt is law)
gofmt -w . && golangci-lint run
go get github.com/pkg@v1.2.3   # add dependency
go mod tidy                    # sync go.mod with imports

# The famous cross-compile:
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o app-linux .
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o app.exe .
```

---

## **3. Types & Syntax Speedrun**

```go
package main
import "fmt"

// Variables — zero values: int=0, string="", bool=false, pointer=nil
var name string = "api"
count := 3                      // := short-declare (inside funcs only)
const timeout = 30              // compile-time constant

// Types
int, int64, float64, bool, string, rune, byte, error
type ServerID string            // custom named type

// Arrays (fixed) vs Slices (dynamic — what you actually use)
var arr [3]int                  // array — rarely used
s := []string{"a","b"}          // slice — the standard
s = append(s, "c")
s[1:3], len(s), cap(s)          // subslice, len, capacity

// Maps
m := map[string]int{"api": 3}
v, ok := m["web"]               // comma-ok: v=0, ok=false if absent
delete(m, "api")

// Structs
type Server struct {
    Name     string            `json:"name"`
    Replicas int               `json:"replicas,omitempty"`
    Labels   map[string]string `json:"labels"`
}
```

---

## **4. Control Flow**

```go
// if with initializer
if v, ok := m["k"]; ok { use(v) }

// switch — implicit break, can switch on values or no condition
switch {
case err != nil:     return err
case count > 10:     scale()
default:             noop()
}

// for — the ONLY loop keyword (for, while, infinite, range)
for i := 0; i < 10; i++ { }
for len(queue) > 0 { process() }        // while
for { }                                  // infinite
for k, v := range m { }                  // map
for i, s := range slice { }              // slice: index + value
for range ch { }                         // channel until closed
```

---

## **5. Functions, Methods & Defer**

```go
// Multiple return values — (result, error) is THE idiom
func divide(a, b float64) (float64, error) {
    if b == 0 { return 0, errors.New("divide by zero") }
    return a / b, nil
}

// Methods — attach functions to types (no classes)
func (s Server) URL() string {           // value receiver — reads
    return fmt.Sprintf("https://%s:%d", s.Name, s.Port)
}
func (s *Server) Scale(n int) {          // pointer receiver — mutates
    s.Replicas = n
}

// Variadic
func sum(nums ...int) int { }            // sum(1,2,3)
sum(nums...)                             // spread

// defer — runs at function exit (LIFO). The killer feature.
func readFile(p string) ([]byte, error) {
    f, err := os.Open(p)
    if err != nil { return nil, err }
    defer f.Close()                      // always closes — even on early return/panic
    return io.ReadAll(f)
}
```

---

## **6. Interfaces — Structural Typing**

```go
// Satisfied implicitly — if it has the methods, it IS the interface
type Storer interface {
    Get(key string) ([]byte, error)
    Put(key string, v []byte) error
}

// io.Reader / io.Writer — the universal plumbing
type Reader interface { Read(p []byte) (n int, err error) }
io.Copy(dst io.Writer, src io.Reader)    // file→HTTP→buffer, all the same

// any / interface{} — anything
var v any = anything()

// Type assertions & switches
s, ok := v.(string)
switch t := v.(type) {
case string:        fmt.Println("str", t)
case int:           fmt.Println("int", t)
case error:         fmt.Println("err", t.Error())
}
```

**Design rule:** "accept interfaces, return structs" — callers get flexibility, you keep concreteness.

---

## **7. Errors — The Go Way**

```go
// Create
errors.New("msg")
fmt.Errorf("deploy %s failed: %w", env, err)   // %w wraps — preserves chain

// Check — sentinel & typed
if errors.Is(err, os.ErrNotExist) { }
var ae *APIError
if errors.As(err, &ae) { use(ae.Code) }

// Custom error type
type APIError struct{ Code int; Msg string }
func (e *APIError) Error() string { return fmt.Sprintf("api %d: %s", e.Code, e.Msg) }

// panic/recover — only for programmer bugs/unrecoverable, not control flow
func must(v int) { if v < 0 { panic("negative") } }
defer func() { if r := recover(); r != nil { log("recovered", r) } }()
```

---

## **8. Generics (Go 1.18+)**

```go
func Keys[K comparable, V any](m map[K]V) []K {
    keys := make([]K, 0, len(m))
    for k := range m { keys = append(keys, k) }
    return keys
}

func First[T any](s []T) T { return s[0] }
type Stack[T any] struct{ items []T }
```

---

## **9. Concurrency — The Reason Go Exists**

```go
// goroutine — lightweight concurrent function (KBs of stack, not MBs)
go process(pod)

// channel — typed pipe; unbuffered = sync handoff, buffered = queue
ch := make(chan Result)
ch <- res            // send (blocks until received if unbuffered)
r := <-ch            // receive
close(ch)

// select — multiplex channels (the "switch for channels")
select {
case r := <-results:
case <-ctx.Done():            // cancellation
    return ctx.Err()
case <-time.After(5*time.Second):   // timeout
    return errors.New("timeout")
}

// sync package — coordination primitives
var wg sync.WaitGroup
for _, item := range items {
    wg.Add(1)
    go func(it Item) { defer wg.Done(); process(it) }(item)
}
wg.Wait()

var mu sync.Mutex              // guard shared state
mu.Lock(); count++; mu.Unlock()   // or defer mu.Unlock()

// context — request-scoped cancellation/deadline, passed through call chains
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
resp, err := client.Do(req.WithContext(ctx))
```

**Rules:** don't share memory — share by communicating (channels). Every `go` needs a way to finish (context/waitgroup) or it leaks.

---

## **10. Testing — Built In**

```go
// server_test.go
func TestURL(t *testing.T) {
    s := Server{Name: "api", Port: 8080}
    if got := s.URL(); got != "https://api:8080" {
        t.Errorf("URL() = %q, want %q", got, "https://api:8080")
    }
}

// Table-driven — THE Go test idiom
func TestParse(t *testing.T) {
    cases := []struct{ in string; want int }{
        {"1", 1}, {"10", 10},
    }
    for _, c := range cases {
        if got := parse(c.in); got != c.want {
            t.Errorf("parse(%q) = %d, want %d", c.in, got, c.want)
        }
    }
}

// Subtests + benchmarks
t.Run("subtest", func(t *testing.T){...})
func BenchmarkParse(b *testing.B) { for i := 0; i < b.N; i++ { parse("x") } }

// HTTP test server
srv := httptest.NewServer(http.HandlerFunc(handler))
defer srv.Close()
```

---

## **11. DevOps-Specific Patterns**

```go
// HTTP server — production shape
mux := http.NewServeMux()
mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(200); fmt.Fprintln(w, "ok")
})
srv := &http.Server{Addr: ":8080", Handler: mux,
                    ReadTimeout: 5*time.Second, WriteTimeout: 10*time.Second}
log.Fatal(srv.ListenAndServe())

// Graceful shutdown — the production must-have
go func() { srv.ListenAndServe() }()
stop := make(chan os.Signal, 1)
signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
<-stop
ctx, _ := context.WithTimeout(context.Background(), 10*time.Second)
srv.Shutdown(ctx)                                  // drain connections

// exec external commands
cmd := exec.CommandContext(ctx, "kubectl", "get", "pods", "-o", "json")
out, err := cmd.Output()                            // or CombinedOutput/Run

// JSON with struct tags
type Pod struct {
    Name  string `json:"name"`
    Phase string `json:"status.phase"`   // not how nesting works — use nested struct
}
b, _ := json.Marshal(pod)
json.Unmarshal(body, &pod)
```

---

## **12. Gotchas That Bite**

* **`:=` inside a block shadows outer var** — `if x := f(); x != nil` shadows; the outer `x` never gets set.
* **Loop variable capture (pre-1.22)** — `for _, v := range items { go func() { use(v) }() }` used to capture the *same* `v`. Pass it as arg. (Go 1.22+ fixes it.)
* **`nil` map panic** — reading nil map = zero value OK; **writing to nil map panics**. `m := make(map[string]int)` before writes.
* **`defer` in a loop** — `for { f, _ := open(); defer f.Close() }` holds all FDs open. Wrap in a helper func instead.
* **Slice append aliasing** — `append` may share the backing array; subslice + append can mutate the original.
* **`time.After` in loops** — leaks timers; `timer := time.NewTimer(); defer timer.Stop()`.
* **`range` over channels** — `for v := range ch` blocks until `close(ch)`; forgetting close = deadlock.
* **Goroutine leak** — `go f()` with no way to cancel/drain = leak. Pass context, respect `ctx.Done()`.

---

## 📚 **Learning Resources**

* 🔗 [A Tour of Go](https://go.dev/tour/)
* 📦 [Go by Example](https://gobyexample.com/)
* 🛡️ [Effective Go](https://go.dev/doc/effective_go)
* 🧪 [Go Proverbs](https://go-proverbs.github.io/) & [100 Go Mistakes](https://100go.co/)
