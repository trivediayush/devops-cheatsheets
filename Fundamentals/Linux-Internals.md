# 🐧 Linux Internals for DevOps

**The layer under everything.** Every container, every VM, every CI runner is Linux. This sheet covers the internals that actually matter in production — processes, memory, IO, namespaces, systemd — not textbook OS theory.

---

## **1. Processes — How Linux Really Runs Your Code**

| Concept | What it actually is |
| --- | --- |
| **Process** | A running program with its own virtual memory, file descriptors, and a PID. Created via `fork()`/`clone()` then `exec()`. |
| **Thread** | A task sharing the process's memory/FDs (created with `clone()` flags). Cheaper to create/context-switch. |
| **Zombie** | Dead child whose exit status the parent hasn't reaped — leaks a process-table slot, not memory. Parent bug. |
| **Orphan** | Parent died → reparented to PID 1 (or a subreaper). PID 1's real job in containers: **reaping zombies**. |
| **Daemon** | Background process detached from terminal — today: just a systemd service. |

**Q: Why does `kill -9` sometimes not kill a process?**
A: It's in **uninterruptible sleep (`D` state)** — blocked on kernel IO (usually NFS/disk). The signal queues until the syscall returns. No amount of `-9` fixes it; find the blocked IO with `ps -o state,wchan` or check NFS/storage.

**Q: What is PID 1 and why do containers break without a proper one?**
A: PID 1 reaps orphans and handles signals differently (Linux ignores unhandled signals for PID 1). Your app as PID 1 won't reap grandchildren zombies and won't get SIGTERM unless it installs a handler — that's why `--init` (tini) exists.

```bash
ps aux --sort=-%cpu | head           # top CPU consumers
ps -eo pid,ppid,stat,wchan,cmd       # states + what each is blocked on
ps -ef --forest                      # process tree
pstree -p <pid>                      # children of a process
ls /proc/<pid>/fd | wc -l            # open FDs (leak check)
cat /proc/<pid>/limits               # ulimits (nofile etc.)
strace -p <pid> -c                   # which syscalls is it making
lsof -p <pid>                        # open files/sockets
```

---

## **2. Memory — What the Numbers Actually Mean**

| Metric | Meaning |
| --- | --- |
| **VSZ** | Virtual size — mostly meaningless (includes reserved, never-touched pages). |
| **RSS** | Resident — physical pages actually in RAM. *This* is what OOM-killer scores. |
| **Shared** | Pages shared between processes (libc, mmap'd files) — RSS overcounts. |
| **Buffers/cache** | Kernel page cache — **free memory ≠ wasted memory**. Linux uses spare RAM as disk cache; `free -h` shows it as `buff/cache` with `available` = real headroom. |
| **Swap** | Disk overflow. Swapping isn't evil; constant swap *activity* (`si/so` in `vmstat`) is. |

```bash
free -h                    # 'available' is the real number, not 'free'
vmstat 1 5                 # si/so = swap in/out, cs = context switches
cat /proc/meminfo          # raw counters
pmap -x <pid>              # per-mapping memory of a process
cat /proc/<pid>/status | grep VmRSS
dmesg | grep -i "oom"      # who did OOM-killer kill?
```

**OOM killer:** picks the process with the worst `oom_score` (roughly: memory used + `oom_score_adj` bias). Kubernetes translates `requests/limits` into `oom_score_adj` — that's why exceeding your *limit* (not node pressure) kills your pod.

---

## **3. Disk & IO**

**Q: Disk is full but `du` shows nothing — the classic trap.**
A: A deleted file held open by a running process still occupies space. `lsof +L1` or `lsof | grep deleted` finds it; restart/truncate the holder (`: > /proc/<pid>/fd/<fd>`).

```bash
df -h                      # filesystem usage
df -i                      # INODES — yes, you can run out with free space
du -sh /* 2>/dev/null | sort -rh | head   # what's eating the disk
lsof +L1                   # deleted-but-open files holding space
iostat -xz 1               # %util ≈ saturation; await = latency
lsblk                      # block device tree
iotop -o                   # per-process IO
```

**inode exhaustion:** millions of tiny files (Docker layers, node_modules, build caches) exhaust inodes while bytes remain. `df -i` shows it; fix = delete files, not grow disk.

---

## **4. File Descriptors & ulimits — The Silent Killer**

Every socket, file, pipe = an FD. Default limit is often **1024** — a moderately busy service hits it fast and fails with `Too many open files`.

```bash
ulimit -n                  # current soft limit (often 1024)
cat /proc/<pid>/limits | grep "open files"
ls /proc/<pid>/fd | wc -l  # current usage

# Raise for a systemd service — .service file:
[Service]
LimitNOFILE=65536
```

> [!IMPORTANT]
> For systemd services, `ulimit` in shell profiles does **nothing** — set `LimitNOFILE=` in the unit file. This bites everyone exactly once.

---

## **5. systemd — The Real Init System**

```bash
systemctl status/start/stop/enable <svc>   # lifecycle (enable = start at boot)
systemctl daemon-reload                    # after editing a unit file
journalctl -u <svc> -f                     # live service logs
journalctl -u <svc> --since "1h ago" -p err
systemd-analyze blame                      # boot-time breakdown
systemctl cat <svc>                        # unit file + drop-ins
systemd-run --scope --user <cmd>           # run a command under systemd
```

Key concepts: **units** (service/socket/timer/mount), `After=`/`Wants=`/`Requires=` dependencies, `Restart=always|on-failure` (your process supervisor), `*.timer` units (better cron — logs, deps, random delays), `systemd-cgls` to view the cgroup tree.

---

## **6. Namespaces & cgroups — What Containers Actually Are**

A container is **not a lightweight VM** — it's a normal Linux process with:

| Mechanism | What it does |
| --- | --- |
| **Namespaces** (isolation) | What the process *sees*: `mnt` (filesystem), `net` (own IP/ports), `pid` (own PID 1), `uts` (hostname), `ipc`, `user` (UID mapping — rootless!), `cgroup`, `time` |
| **cgroups** (limits) | What the process *gets*: CPU shares/quota, memory limit, IO, PID count. OOM + throttling enforced here. |

```bash
lsns                          # list namespaces on the host
lsns -p <pid>                 # namespaces of a process
nsenter -t <pid> -n curl localhost:8080   # enter container's net namespace
systemd-cgls                  # cgroup tree
cat /sys/fs/cgroup/.../memory.max         # cgroup v2 memory limit
cat /sys/fs/cgroup/.../cpu.stat           # nr_throttled = CPU throttling!
```

**Q: Container CPU-throttled but host CPU is idle — why?**
A: cgroup CPU quota (`cpu.max`) throttles by *time slice*, not cores — your app hits its `limits.cpu` budget even on an idle box. Check `cpu.stat` `nr_throttled`. Classic cause of mystery latency.

---

## **7. Debugging Toolkit — The Senior's Arsenal**

```bash
strace -f -p <pid>                    # every syscall live (-c for summary)
strace -e trace=openat,connect <cmd>  # what it opens/connects to
ss -tulpn                             # listening sockets (replaces netstat)
ss -s                                 # socket summary — find FD leaks
tcpdump -i any port 443 -w cap.pcap   # packet capture
nc -zv host 443                       # TCP connectivity test
perf top                              # kernel-level CPU hotspots
```

**Method that beats tools:** check in order — is it running? → is it listening? (`ss`) → can you reach it? (`nc`/`curl`) → is it doing what you think? (`strace`/`logs`) → is it starved? (`vmstat`/`iostat`/throttling).

---

## **8. Kernel Architecture — The Big Picture**

```text
┌──────────────────────────── USER SPACE ────────────────────────────┐
│  your app   shell   nginx   systemd   dockerd   kubectl            │
│        │                                                            │
│        ▼  (libc wrappers: printf→write, malloc→brk/mmap)            │
│  glibc / musl                                                       │
├──────────────────────── SYSTEM CALL INTERFACE ─────────────────────┤
│  read() write() open() fork() execve() mmap() socket() clone()     │
├──────────────────────────── KERNEL SPACE ──────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│ │ Process  │ │ Memory   │ │   VFS    │ │ Network  │ │   IPC     │ │
│ │Scheduler │ │ Mgmt(mm) │ │+Filesystems│ │  Stack  │ │ signals  │ │
│ │  (CFS)   │ │ paging,  │ │ ext4,xfs,│ │TCP/IP,   │ │ pipes,   │ │
│ │          │ │ OOM,swap │ │overlayfs │ │netfilter │ │ sockets  │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────────┘ │
│ ┌─────────────────── BLOCK I/O + DEVICE DRIVERS ──────────────────┐│
│ │  block layer (mq, iosched)  NIC drivers  GPU  USB  ...          ││
│ └─────────────────────────────────────────────────────────────────┘│
├───────────────────────────── HARDWARE ─────────────────────────────┤
│  CPU cores    RAM    NVMe/SATA    NIC    interrupts                 │
└────────────────────────────────────────────────────────────────────┘

Everything user space does that touches hardware or shared state
goes through one door: the syscall interface.
```

---

## **9. Process Lifecycle — fork → exec → exit**

```text
parent process                     child
     │                                │
     ├── fork() ──► clone() syscall   │  child = copy of parent
     │   (copy-on-write pages,        │  (same memory until written)
     │    new PID, shares FDs)        │
     │                                ├── execve("/bin/app")
     │                                │   → replace image entirely
     ├── wait() ◄──── zombie ◄────────┤  exit() → status stored
     │   (parent reads exit code)     │  until parent wait()s
     ▼                                ▼
   reaped — entry gone from process table
```

**Process states you'll see in `ps`/`top`:**

| State | Meaning | Why you care |
| --- | --- | --- |
| `R` | Running/runnable | On CPU or queued |
| `S` | Sleeping (interruptible) | Waiting for IO/event — normal |
| `D` | Uninterruptible sleep | Disk/NFS IO wait — **can't be killed**; high D count = storage problems |
| `Z` | Zombie | Exited, parent didn't `wait()` — leaks a PID slot |
| `T` | Stopped | SIGSTOP/debugger |

```bash
ps aux | awk '$8 ~ /Z/ {print}'        # find zombies
ps -o ppid= -p <zombie_pid>            # who's the bad parent — kill THAT
cat /proc/<pid>/status                 # raw process state, threads, memory
```

---

## **10. Virtual Memory Layout — Where Things Live**

```text
high addr ┌─────────────────────────┐
          │  Kernel space           │  (unmapped for user processes)
          ├─────────────────────────┤
          │  Stack        ↓ grows   │  local vars, call frames (~8MB default)
          ├─────────────────────────┤
          │  Memory mappings        │  shared libs, mmap'd files
          │  (mmap region) ↑ grows  │
          ├─────────────────────────┤
          │  Heap         ↑ grows   │  malloc/new (brk/sbrk)
          ├─────────────────────────┤
          │  BSS                    │  uninitialized globals
          │  Data                   │  initialized globals
          │  Text                   │  your compiled code (read-only, exec)
low addr  └─────────────────────────┘
```

**Page fault flow** — every memory access goes through it:

```text
app accesses addr → MMU looks up page table
        │
        ├── page present → translate VA→PA, done (fast, ~ns)
        │
        └── page fault → kernel mm handler:
                ├── minor fault: page exists (page cache/COW) → map it, resume
                ├── major fault: must read from disk → block process, IO, resume
                └── invalid access → SIGSEGV → segfault/core dump
```

```bash
cat /proc/<pid>/maps          # the actual memory map of a process
cat /proc/<pid>/smaps | less  # per-mapping RSS/PSS/Dirty detail
```

**The RSS illusion:** `ps` RSS counts *shared* pages fully in every process — 10 processes sharing libc look 10× heavier than they are. **PSS** (proportional set size, in smaps) is the honest number.

---

## **11. The I/O Path — `read()` to Disk and Back**

```text
app: read(fd, buf, n)
   │
   ▼ syscall
VFS (virtual filesystem switch — same API for ext4/xfs/nfs/procfs)
   │
   ▼
Page Cache ──── hit? ──► copy to user buffer, done (RAM speed)
   │ miss
   ▼
Filesystem (ext4/xfs) — map file offset → block number
   │
   ▼
Block layer + IO scheduler (mq-deadline/none/bfq)
   │
   ▼
Device driver → disk/NVMe → DMA → kernel buffer
   │
   ▼
Page cache (now cached) → user buffer — process resumes
```

**The write path** — `write()` returns BEFORE data hits disk:

```text
write() → copy to page cache (dirty page) → return "success"
              │
              ├── pdflush/writeback threads flush later (dirty_ratio)
              ├── fsync() forces it NOW
              └── O_DIRECT bypasses cache entirely (databases use this)
```

**Why it matters:** "file copied but disk full next boot" — write sat in cache, never flushed, then OOM/reboot. `sync` and `fsync` exist for a reason. `free -h` showing low "available" is usually fine — the page cache is reclaimable.

---

## **12. Network Packet Path — Through the Kernel Stack**

**Inbound (packet arrives at NIC):**

```text
NIC → DMA → ring buffer → IRQ → driver (NAPI poll)
   │
   ▼
netfilter PREROUTING (conntrack, DNAT, mangle)
   │
   ▼
Routing decision ──── forward? ──► FORWARD chain → POSTROUTING → out
   │ local delivery
   ▼
INPUT chain (iptables/nftables filter)
   │
   ▼
TCP/UDP stack → socket receive buffer → app reads it
```

**Outbound (app sends):**

```text
app: send() → socket buffer → TCP stack (segments, retransmit queue)
   │
   ▼
OUTPUT chain (local process filter)
   │
   ▼
Routing decision → netfilter POSTROUTING (SNAT/MASQUERADE)
   │
   ▼
qdisc (queue discipline: pacing, shaping, tc) → driver → NIC
```

```bash
# Trace where a packet dies:
conntrack -L | grep <ip>            # connection tracking table
iptables -L -n -v                   # rule hit counters — which rules are dropping
nft list ruleset                    # modern equivalent
tc -s qdisc                         # queue stats — drops/overlimits
ss -tinp 'dst = :443'               # per-socket TCP internals (cwnd, rtt)
ethtool -S eth0                     # NIC-level drops (ring buffer overrun)
```

**The netfilter hooks** are exactly where `kube-proxy`, Docker port mapping, and CNI policy engines hang their rules — same machinery, different frontend.

---

## **13. Boot Sequence — Power Button to Login**

```text
Power on
  │
  ▼
Firmware (UEFI/BIOS) — POST, finds boot device
  │
  ▼
Bootloader (GRUB2) — loads kernel + initramfs into RAM
  │
  ▼
Kernel decompresses, mounts initramfs (early drivers),
pivots to real root filesystem
  │
  ▼
/sbin/init = PID 1 (systemd) — the ancestor of EVERYTHING
  │
  ▼
systemd: mounts filesystems, starts targets
(default.target → multi-user/graphical)
  │
  ▼
services, sockets, timers → getty → login → shell
```

```bash
systemd-analyze                # total boot time breakdown
systemd-analyze blame          # which service took longest
journalctl -b                  # logs since this boot
journalctl -b -1               # previous boot — post-crash forensics
systemctl list-dependencies    # unit dependency tree
```

---

## **14. Where Containers Plug In — The Kernel Hooks**

```text
docker run app
   │
   ▼ clone() with namespace flags
   ├── CLONE_NEWNS    mount ns  → own / view (overlay root)
   ├── CLONE_NEWUTS   hostname  → own hostname
   ├── CLONE_NEWIPC   IPC       → own shared memory/semaphores
   ├── CLONE_NEWPID   PID ns    → app is PID 1 inside
   ├── CLONE_NEWNET   net ns    → own interfaces/iptables/lo
   └── CLONE_NEWUSER  user ns   → root-in-container ≠ root-on-host
   │
   ▼ cgroup v2 attach
   ├── cpu.max          CPU quota/throttle
   ├── memory.max       memory limit → OOM-kill boundary
   ├── io.max           disk bandwidth limits
   └── pids.max         fork-bomb protection
   │
   ▼ security layers
   ├── seccomp-bpf      syscall filter (which syscalls allowed)
   ├── capabilities     split root powers (CAP_NET_ADMIN etc.)
   └── SELinux/AppArmor mandatory access control labels
```

**One command that proves it all:**

```bash
lsns -p <container_pid>     # list the actual namespaces a container joined
cat /proc/<pid>/cgroup      # which cgroup it lives in
```

---

## 📚 **Learning Resources**

* 🔗 [Linux Performance — Brendan Gregg](https://www.brendangregg.com/linuxperf.html)
* 📦 [USE Method](https://www.brendangregg.com/usemethod.html) — Utilization/Saturation/Errors debugging
* 🛠️ [cgroups v2 docs](https://docs.kernel.org/admin-guide/cgroup-v2.html)
