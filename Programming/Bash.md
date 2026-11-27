# 🐚 Bash & Shell Scripting Cheatsheet

**Bash** — the lingua franca of automation. Every CI pipeline, Docker entrypoint, cron job, and ops script touches it. This is the version that survives production: strict mode, quoting discipline, and the text-processing toolkit.

---

## **1. Script Skeleton — Always Start This Way**

```bash
#!/usr/bin/env bash
set -euo pipefail           # THE strict mode — non-negotiable for anything real
IFS=$'\n\t'                # safer word splitting

# Flags that save you:
# -e          exit on any command failure
# -u          treat unset variables as errors
# -o pipefail pipeline fails if ANY stage fails (not just the last)
# -x          trace mode — debug (set -x on / +x off)

trap 'echo "failed at line $LINENO" >&2' ERR   # show where it died
```

```bash
bash -x script.sh          # debug a run
bash -n script.sh          # syntax check only
shellcheck script.sh       # LINT — catch 90% of bugs before running
```

---

## **2. Variables & Expansion — Where Bugs Live**

```bash
name="prod"
echo "$name"               # ✅ ALWAYS quote — preserves spaces & special chars
echo $name                 # ⚠️ word-splits + glob-expands — breaks on spaces

# Parameter expansion — the Swiss army table
${var:-default}            # use default if unset/empty
${var:=default}            # set default if unset
${var:?error msg}          # fail if unset
${var:+alt}                # use alt if set
${var%pattern}             # remove shortest suffix match
${var%%pattern}            # remove longest suffix
${var#pattern}             # remove shortest prefix
${var##pattern}            # remove longest prefix
${var/pat/rep}             # replace first match
${var//pat/rep}            # replace all
${var:offset:len}          # substring
${#var}                    # string length
${var^^} / ${var,,}        # uppercase / lowercase (bash 4+)

path="/var/log/app.log"
echo "${path##*/}"         # → app.log    (basename)
echo "${path%/*}"          # → /var/log   (dirname)
echo "${path%.log}.txt"    # → /var/log/app.txt
```

---

## **3. Command Substitution & Arithmetic**

```bash
# Command substitution — always $(...)
pods=$(kubectl get pods -o name)     # ✅
count=$(wc -l < file)

# Arithmetic
echo $((2 + 3))            # → 5
((count++))
[[ $count -eq 5 ]]         # numeric test: -eq -ne -lt -le -gt -ge
```

---

## **4. Conditionals — `[[ ]]` vs `[ ]`**

```bash
# [[ ]] is the bash way — handles empties, regex, pattern matching
if [[ -f "$file" ]]; then echo "exists"; fi
if [[ -z "$var" ]]; then echo "empty"; fi
if [[ "$env" == "prod" ]]; then confirm; fi
if [[ "$line" =~ ^error ]]; then alert; fi     # regex — no quotes on pattern!
if [[ "$f" == *.yaml ]]; then process; fi      # glob match

# Tests to memorize:
# -f file exists   -d dir   -e exists(any)   -z empty   -n non-empty   -x exec
# $a == $b   $a != $b   $a =~ regex   -eq/-lt/-gt numeric

# And/Or short-circuit
[[ -f "$f" && -r "$f" ]] && process "$f"
cmd || die "cmd failed"
```

---

## **5. Loops — All the Forms**

```bash
for svc in api web worker; do
  kubectl rollout restart "deploy/$svc"
done

for f in *.yaml; do                 # glob — handles spaces right
  apply "$f"
done

# C-style for arithmetic
for ((i=0; i<10; i++)); do echo "$i"; done

# Reading lines — THE safe pattern (not `for line in $(cat file)`)
while IFS= read -r line; do
  echo "got: $line"
done < hosts.txt

while IFS= read -r pod; do
  process "$pod"
done < <(kubectl get pods -o name)   # process substitution — keeps vars in current shell

# Until a condition — wait loops
until curl -sf localhost:8080/health; do sleep 2; done
while ! kubectl rollout status deploy/api; do sleep 5; done
```

---

## **6. Functions, Args & Exit**

```bash
die() { echo "ERROR: $*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

deploy() {
  local env="$1" tag="${2:?tag required}"        # local = scoped
  [[ $# -ge 1 ]] || die "usage: deploy ENV TAG"
  kubectl set image "deploy/app" "app=img:$tag" -n "$env" || die "deploy failed"
  log "deployed $tag to $env"
}

deploy prod v1.2.3        # positional args inside: $1, $2, $#, $@

# Positional params outside functions:
# $0 script name, $1..$N args, $# count, $@ all args, $$ pid, $? last exit code
```

```bash
# getopts — flag parsing
while getopts "e:t:h" opt; do
  case $opt in
    e) ENV="$OPTARG" ;;
    t) TAG="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done
```

---

## **7. Arrays & Associative Arrays**

```bash
arr=("a" "b c" "d")
echo "${arr[0]}"            # a
echo "${arr[@]}"            # all elements (safe iteration)
echo "${#arr[@]}"           # length
arr+=("new")

for x in "${arr[@]}"; do echo "$x"; done   # quoted @ = safe for spaces

# Associative arrays (bash 4+)
declare -A cfg
cfg[env]="prod"
cfg[replicas]="3"
echo "${cfg[env]}"
for k in "${!cfg[@]}"; do echo "$k=${cfg[$k]}"; done
```

---

## **8. trap — Cleanup That Always Runs**

```bash
TMP=$(mktemp -d)
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT                    # runs on exit, success or fail
trap 'log "failed at $LINENO"' ERR   # on error
trap 'echo "interrupted"; exit 130' INT TERM   # signals
```

---

## **9. Text Processing — The Real Toolkit**

```bash
# grep — find/filter
grep -E "error|fail" app.log          # extended regex
grep -v "health" app.log              # invert
grep -c "error" app.log               # count
grep -A3 -B2 "panic" app.log          # context lines
grep -rl "TODO" src/                  # files containing

# sed — stream edit
sed 's/old/new/g' file                # replace all
sed -i.bak 's/v1/v2/g' deploy.yaml    # in-place w/ backup
sed -n '10,20p' file                  # lines 10-20
sed '1d' file                         # delete first line
sed '/^#/d;/^$/d' conf                # strip comments+blank

# awk — column/programmable processing
ps aux | awk '{print $2, $11}'                     # columns
kubectl get pods | awk '$3 != "Running" {print $1}'
awk -F: '{print $1}' /etc/passwd                   # delimiter
awk '{sum+=$1} END {print sum/1024 "MB"}' sizes   # aggregate
awk 'NR>=5 && NR<=10' file                          # line range

# xargs — lines → arguments
find . -name "*.log" -mtime +30 | xargs rm -f
find . -name "*.tmp" -print0 | xargs -0 rm         # -print0/-0 = safe for spaces
ls *.yaml | xargs -I{} kubectl apply -f {}
xargs -P 8 -I{} job {}                             # parallel (8 workers)

# jq — JSON (the ONLY sane way to parse JSON in shell)
jq '.status.phase' pod.json
jq -r '.items[].metadata.name' pods.json           # -r = raw
jq '.[] | select(.active) | .email' users.json
jq 'to_entries | map("\(.key)=\(.value)") | .[]' cfg.json   # dict → k=v lines
jq --arg v "$val" '.field = $v' cfg.json | sponge cfg.json  # edit in place (moreutils)

# cut / sort / uniq / comm
cut -d: -f1 /etc/passwd
sort -rn | head -5                  # numeric reverse sort
sort file | uniq -c | sort -rn      # frequency count (the histogram trick)
```

---

## **10. Redirection & Pipes**

```bash
cmd > out.log          # stdout → file (overwrite)
cmd >> out.log         # append
cmd 2> err.log         # stderr
cmd > out.log 2>&1     # both → file
cmd &> all.log         # both (bash)
cmd 2>/dev/null        # silence errors
cmd1 | cmd2            # stdout → stdin
cmd < input.txt        # file → stdin
cmd <<< "text"         # here-string
cmd > >(gzip > out.gz) # stdout → process

# Here-docs — multi-line text/templates
cat > deploy.yaml <<EOF
env: ${ENV}
replicas: ${REPLICAS}
EOF

cat <<'EOF'            # quoted = NO variable expansion (literal)
apiVersion: v1
kind: Pod
EOF

kubectl apply -f - <<EOF    # stream YAML to kubectl
$(envsubst < template.yaml)
EOF
```

---

## **11. Exit Codes & Job Control**

```bash
echo $?                  # last command's exit code (0 = success)
cmd && echo "ok" || echo "failed"
exit 1                   # non-zero = failure → pipelines detect

# Background/jobs
long_cmd &               # run in background
jobs                     # list
fg %1 / bg %1            # foreground/background
wait                     # wait for all background jobs
nohup cmd > log 2>&1 &   # survive terminal close
disown                   # detach from shell's job table
```

---

## **12. Gotchas — Read Before You Ship**

| Gotcha | The fix |
| --- | --- |
| `for f in $(ls)` breaks on spaces | `for f in *` or `find -print0 \| xargs -0` |
| `cat f \| while read; do X++` → X stays 0 | pipes run in subshells — use `while ... done < <(cmd)` |
| `cd /path && rm -rf *` — if cd fails, deletes cwd | `cd /path \|\| exit` or `set -e` |
| `$var` unquoted splits/globs | `"$var"` always — unless you *want* splitting |
| `[ ]` breaks on empty/regex | `[[ ]]` — and `=~` patterns stay unquoted |
| `echo -e`/`-n` non-portable | `printf` is the portable one |
| Windows CRLF → `^M` errors | `sed -i 's/\r$//' script.sh` or `dos2unix` |
| `cmd1; cmd2` runs both even if cmd1 fails | `set -e` or `cmd1 && cmd2` |
| `read` strips leading/trailing whitespace | `IFS= read -r line` |
| Glob with no matches passes literally | `shopt -s nullglob` or check `[[ -e "$f" ]]` |

---

## **13. One-Liners for Daily Ops**

```bash
du -sh /* 2>/dev/null | sort -rh | head                    # what eats disk
ss -tulpn | grep :8080                                   # who's listening
ps aux --sort=-%mem | head                               # top memory hogs
history | awk '{print $2}' | sort | uniq -c | sort -rn | head   # most-used commands
find /var/log -name "*.log" -mtime +7 -delete            # cleanup old logs
grep -r "password" --include="*.yaml" .                  # find secrets in configs
last reboot | head                                       # recent reboots
ps -eo pid,etime,cmd --sort=-etime | head                # longest-running processes
tar czf backup-$(date +%F).tar.gz ./app                  # dated archive
watch -n2 'kubectl get pods'                             # live refresh
df -h / | awk 'NR==2{print $5}'                          # disk % of root fs
diff <(sort a.txt) <(sort b.txt)                         # set-compare two files
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" URL      # status+timing
```

---

## 📚 **Learning Resources**

* 🔗 [Greg's Bash Guide](https://mywiki.wooledge.org/BashGuide) — the definitive reference
* 📦 [ShellCheck](https://www.shellcheck.net/) — lint everything
* 🛡️ [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html)
* 🧪 [Bash Pitfalls](https://mywiki.wooledge.org/BashPitfalls) — the canonical "don'ts"
