# 🛠️ Docker Daily Ops — Commands, Troubleshooting, Volumes & Networking

**The Docker you use every day.** Container lifecycle, the issue-solving table, volume ops, and network debugging — the practical half of the Docker pages.

---

## **1. Daily Lifecycle Commands**

```bash
docker ps                          # running
docker ps -a                       # all, incl. stopped
docker ps -q | wc -l               # how many running
docker run -d --name api -p 8080:80 img
docker start|stop|restart api
docker rm api; docker rm -f api    # -f kills first
docker logs -f --tail 100 api      # follow logs — the daily #1
docker logs --since 10m api
docker exec -it api sh             # shell inside (bash if present)
docker inspect api                 # full config JSON
docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' api
docker stats                       # live CPU/mem per container
docker stats --no-stream           # one-shot snapshot
docker top api                     # processes inside
docker cp api:/app/log ./log       # file in/out
docker port api                    # published port mappings
```

---

## **2. Image Daily Ops**

```bash
docker images                      # list
docker pull nginx:1.25
docker build -t app:1.0 .
docker tag app:1.0 reg.local/app:1.0
docker push reg.local/app:1.0
docker save -o app.tar app:1.0     # → file (air-gap/transfer)
docker load -i app.tar             # ← file
docker history app:1.0             # layer sizes — find the fat one
docker rmi img; docker image prune # remove one / remove dangling
docker image prune -a              # ⚠️ all unused images
docker inspect img --format '{{.RepoDigests}}'
```

---

## **3. Issue Solving — Symptom → Fix**

| Symptom | Diagnose | Fix |
| --- | --- | --- |
| Container exits immediately | `docker ps -a` exit code + `docker logs` | app crashed on start — run `-it` interactively to see the error; check CMD/entrypoint |
| `port is already allocated` | `ss -tlnp \| grep <port>` or `docker ps` | another container/process owns it — change `-p` host side |
| `Cannot connect to the Docker daemon` | `systemctl status docker` | daemon down; or you're not in `docker` group → `sudo usermod -aG docker $USER` |
| Pull fails `manifest unknown` | tag doesn't exist | `docker pull repo:tag` — list tags on registry UI/API |
| Pull fails `unauthorized` | expired/missing creds | `docker login reg.local`; check robot account perms |
| Container running, can't reach port | `docker port c`; `docker inspect` IP | app binds `127.0.0.1` inside — must bind `0.0.0.0` |
| `no space left on device` | `docker system df` | `docker system prune` — see §5 |
| DNS fails inside container | `docker exec c cat /etc/resolv.conf` | custom DNS in daemon.json, or `--dns 8.8.8.8` per container |
| Time wrong inside container | `docker exec c date` | containers share host clock — check HOST `timedatectl`, not the container |
| Changes don't persist | container has no volume | `-v vol:/data` — container FS is ephemeral |
| OOM: container killed, exit 137 | `docker inspect c` `.State.OOMKilled` | raise `-m` limit or fix the leak |
| "works on my machine" | env/platform differs | `--platform linux/amd64` on ARM macs; pin base image digest |

**Exit codes worth memorizing:** `0` clean · `1` app error · `126/127` command not executable/not found (bad entrypoint) · `137` SIGKILL (OOM or `docker kill`) · `139` SIGSEGV · `143` SIGTERM (graceful stop).

```bash
# Forensics on a dead container:
docker inspect <c> --format '{{.State.ExitCode}} OOM:{{.State.OOMKilled}}'
docker logs <c> 2>&1 | tail -30
docker diff <c>                    # what changed in its FS
docker events --since 30m          # the daemon's event stream
```

---

## **4. Volumes — Daily Ops**

```bash
docker volume ls
docker volume create data
docker run -v data:/app/data img   # named volume — survives container rm
docker run -v /host/dir:/data img  # bind mount — dev configs, live code
docker volume inspect data         # where it lives on host
docker run --rm -v data:/v -v $PWD:/b alpine tar czf /b/data-backup.tgz -C /v .
#                                   ↑ the standard volume backup
docker volume rm data; docker volume prune
```

| Situation | Use |
| --- | --- |
| DB data, uploads | named volume |
| Code you're editing live | bind mount |
| Multiple containers share data | named volume (or `:ro` read-only for config) |
| Temp/scratch | `--tmpfs` or `--rm` + nothing |

```bash
# Fix permission pain — container user vs bind-mounted host files:
docker run -v $PWD:/app -u $(id -u):$(id -g) img   # run as your host UID
docker exec -u root c chown -R 1000:1000 /data     # fix from inside
```

---

## **5. Networking — Daily Ops**

```bash
docker network ls
docker network create appnet
docker run --network appnet --name api img
docker network inspect appnet                  # IPs, connected containers
docker network connect appnet <container>      # join existing container
docker exec api ping -c2 db                    # container→container by NAME
docker exec api getent hosts db                # DNS resolution inside net

# The rules that matter:
# • Same user-defined network → containers resolve each other by name
# • Default "bridge" network → NO name resolution (IP only)
# • --network host → shares host netns (no isolation, no -p needed)
# • --network none → totally isolated
```

```bash
# Debug a container's network like it's the host:
docker run -it --network container:api nicolaka/netshoot   # share its netns
docker exec api ss -tln                                    # listening ports inside
docker exec api cat /etc/resolv.conf /etc/hosts
nsenter -t $(docker inspect -f '{{.State.Pid}}' api) -n ip addr   # from host
```

---

## **6. Compose — Daily Ops**

```bash
docker compose up -d               # create + start
docker compose ps                  # status of the stack
docker compose logs -f api         # one service's logs
docker compose exec api sh         # shell in a service
docker compose up -d --build       # rebuild + recreate changed
docker compose restart api
docker compose down                # stop + remove containers/network
docker compose down -v             # ⚠️ also deletes volumes (data!)
docker compose pull && docker compose up -d   # update images + redeploy
docker compose config              # render the resolved config (validate)
```

---

## **7. Cleanup — Reclaim the Disk**

```bash
docker system df                   # where space is: images/containers/volumes/cache
docker system prune                # stopped containers + dangling images + networks
docker system prune -a --volumes   # ⚠️ nuclear — unused images AND volumes
docker builder prune               # BuildKit cache (often the biggest)
docker container prune             # stopped only
docker image prune -a              # all unused images

# json-file logs eating the host? cap them in daemon.json:
# { "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
```

---

## **8. Production Checklist — What Senior Rigs Have**

```bash
docker run -d \
  --name api \
  --restart unless-stopped \          # auto-restart on crash/reboot
  -m 512m --cpus 1.0 \                # resource limits — always set them
  --read-only --tmpfs /tmp \          # immutable rootfs where possible
  --log-opt max-size=10m --log-opt max-file=3 \
  -p 127.0.0.1:8080:8080 \            # bind localhost only (behind proxy)
  app:1.0
```

---

## 📚 **Learning Resources**

* 🔗 [Docker CLI Reference](https://docs.docker.com/reference/cli/docker/)
* 📦 [Docker Storage Docs](https://docs.docker.com/storage/)
* 🛡️ [Docker Networking Docs](https://docs.docker.com/network/)
