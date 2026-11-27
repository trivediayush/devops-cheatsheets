# 🎯 DevOps Interview — Fresher (0–1 Years)

**What interviewers test at this level**: fundamentals, curiosity, and whether you can explain *why* — not just commands. They don't expect production war stories; they expect you to not freeze on "what happens when you type a URL?"

| Expectation | What it means |
| --- | --- |
| Strong fundamentals | Linux, Git, networking, one scripting language |
| DevOps vocabulary | CI/CD, IaC, containers, monitoring — can define each in one line |
| Hands-on basics | You've built *something*: a Dockerfile, a simple pipeline, a cloud VM |
| Learning attitude | "I don't know, but here's how I'd find out" beats a wrong guess |

---

## **1. Linux & OS Essentials**

**Q: Difference between a process and a thread?**
A: A process is an independent program with its own memory space; threads share the process's memory and are lighter. Containers isolate *processes* — that's why they're cheap.

**Q: What are file permissions `rwx`? How does `chmod 755` decode?**
A: `7` = rwx (owner), `5` = r-x (group), `5` = r-x (others). `chmod 755 script.sh` → owner can execute, others read+execute.

```bash
chmod 755 deploy.sh        # owner rwx, group/other r-x
chown ubuntu:app app.log   # change owner:group
ps aux | grep nginx        # find process
top / htop                 # live resource usage
df -h && du -sh /var/log   # disk space / dir size
free -h                    # memory
kill -9 <PID>              # SIGKILL — last resort; try SIGTERM (-15) first
journalctl -u nginx        # systemd service logs
```

**Q: What does `grep`, `awk`, `sed` do — one line each?**
A: `grep` filters lines by pattern, `awk` processes columns/fields, `sed` edits streams (find/replace).

**Q: Soft link vs hard link?**
A: Soft (symbolic) points to a *path* — breaks if target deleted, can cross filesystems. Hard points to the *inode* — survives target "deletion" (same inode), same filesystem only.

**Q: Load average of 8 on a 4-CPU box — problem?**
A: Yes — roughly 2× oversubscribed; processes are queuing for CPU. Check `top`, `iostat`, and `vmstat` to see if it's CPU-bound, IO-bound, or a runaway process.

---

## **2. Networking Basics**

**Q: What happens when you type `google.com` in a browser?** *(the classic)*
A: DNS resolution → TCP handshake (TLS handshake for HTTPS) → HTTP request → server responds → browser renders. Mention: local DNS cache → resolver → root/TLD/authoritative servers.

**Q: TCP vs UDP?**
A: TCP = connection-oriented, ordered, reliable (web, SSH). UDP = connectionless, fast, no guarantee (DNS, streaming, gaming).

**Q: Common ports to memorize:**

| Port | Service | Port | Service |
| --- | --- | --- | --- |
| 22 | SSH | 80 | HTTP |
| 443 | HTTPS | 53 | DNS |
| 21 | FTP | 25 | SMTP |
| 3306 | MySQL | 5432 | PostgreSQL |
| 6379 | Redis | 8080 | Alt HTTP/proxy |

```bash
ping host                 # ICMP reachability
curl -v https://api.com   # see the full HTTP exchange
nslookup domain.com       # DNS lookup
netstat -tulpn            # listening ports (ss -tulpn on modern Linux)
traceroute host           # hop-by-hop path
ssh -i key.pem user@host  # connect with a key
```

**Q: Public vs private IP? NAT?**
A: Private ranges (10.x, 172.16–31.x, 192.168.x) aren't routable on the internet; NAT translates private → public at the router/cloud edge.

---

## **3. Git — You Will Be Asked**

**Q: `git pull` vs `git fetch`?**
A: `fetch` downloads changes but doesn't touch your working tree; `pull` = fetch + merge (or rebase).

**Q: Merge vs rebase?**
A: Merge preserves history with a merge commit; rebase replays your commits on top of the target branch for a linear history — cleaner, but rewrites history (never rebase shared branches).

**Q: You committed a secret to your branch — what now?**
A: Rotate the secret *first*, then remove it from history (`git filter-repo`, `git revert` for unpushed, amend for last commit). "Delete the commit" is a wrong answer if it's already pushed/shared — the secret is compromised.

```bash
git clone <url>              # copy a repo
git checkout -b feature-x    # new branch (or git switch -c)
git stash / git stash pop    # shelve & restore work
git log --oneline --graph    # history visualization
git reset --soft HEAD~1      # undo commit, keep changes staged
git cherry-pick <sha>        # apply one commit to another branch
```

---

## **4. Containers & Docker**

**Q: Container vs VM?**
A: VMs virtualize hardware and run a full guest OS (heavy, minutes to boot); containers share the host kernel and isolate processes via namespaces + cgroups (light, milliseconds).

**Q: Image vs container?**
A: Image = immutable template (the class); container = running instance of it (the object).

```bash
docker build -t app:1.0 .           # build image
docker run -d -p 8080:80 app:1.0    # run detached, port-map
docker ps / docker ps -a            # running / all containers
docker logs -f <id>                 # follow logs
docker exec -it <id> sh             # shell into container
docker stop / rm <id>               # lifecycle
docker images / rmi <img>           # image management
```

**Q: What is a Dockerfile? Multi-stage build?**
A: A recipe to build an image (FROM, RUN, COPY, CMD). Multi-stage = build in one stage (with compilers), copy only artifacts to a small runtime stage → smaller, more secure images.

**Q: `CMD` vs `ENTRYPOINT`?**
A: `ENTRYPOINT` is the fixed executable; `CMD` provides default arguments that `docker run` args can override.

---

## **5. CI/CD & DevOps Concepts**

**Q: Define CI vs CD (delivery vs deployment)?**
A: CI = merge + build + test frequently. CD *delivery* = artifact always deployable, human presses the button. CD *deployment* = auto-released to production.

**Q: What is a pipeline? A build artifact?**
A: Pipeline = automated sequence of stages (build → test → package → deploy). Artifact = versioned output (Docker image, JAR, zip) that flows through it.

**Q: What is IaC? Why?**
A: Infrastructure defined as versioned code (Terraform, Ansible) → repeatable, reviewable, no click-ops drift.

**Q: Blue-green vs canary deployment?**
A: Blue-green = two identical environments, flip traffic all at once (instant rollback). Canary = route a small % of traffic to the new version, gradually increase — safer for big user bases.

**Q: What is DevOps in one line?**
A: A culture + practices that unify dev and ops so software ships faster and more reliably — automation, CI/CD, IaC, monitoring, shared ownership.

---

## **6. Cloud Basics**

**Q: IaaS vs PaaS vs SaaS?**
A: IaaS = rent infra (EC2, VMs). PaaS = rent a platform (Elastic Beanstalk, App Engine). SaaS = rent the software (Gmail, Salesforce). Analogy: make pizza at home vs buy base vs eat out.

**Q: Region vs Availability Zone?**
A: Region = geographic area (us-east-1); AZ = isolated data center(s) inside a region — deploy across AZs for high availability.

**Q: What's object storage vs block storage?**
A: Object (S3) = files as objects over HTTP, infinitely scalable, no filesystem. Block (EBS) = virtual disk attached to a VM.

---

## **7. Grilling Traps & How to Handle**

* ❌ "I don't know" → ✅ "I haven't used X, but based on Y I'd approach it by…"
* ❌ Memorized definitions with no example → ✅ always add a real usage: "I used GitHub Actions to build and push a Docker image on every PR."
* ❌ Claiming expertise in 15 tools → ✅ depth in 3–4 beats a buzzword bingo resume.
* **Be honest about projects**: if you followed a tutorial, say so and explain what you'd do differently.

## **8. Questions to Ask Them**

* "What does the on-call/incident process look like?"
* "How do new engineers get to production in their first month?"
* "What does the team wish it had automated but hasn't yet?"

---

## 📚 **Learning Resources**

* 🔗 [90DaysOfDevOps](https://github.com/MichaelCade/90DaysOfDevOps)
* 📦 [DevOps Exercises (practice Q&A)](https://github.com/bregman-arie/devops-exercises)
* 🛡️ [Linux Journey](https://linuxjourney.com/)
