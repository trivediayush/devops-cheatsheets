# 🐧 Linux Distributions — The Production Set

**Only the distros you'll meet in production** — what they are, their package managers, install commands, and the daily errors each one actually throws.

---

## **1. The Production Lineup**

| Distro | Family | Package mgr | Where you see it | Support model |
| --- | --- | --- | --- | --- |
| **Ubuntu LTS** | Debian | `apt` | cloud VMs, K8s nodes, dev boxes — the default | 5y free (10y w/ Pro) |
| **Debian** | Debian | `apt` | stability-first servers, container bases | community |
| **RHEL** | Fedora/RPM | `dnf` (`yum`) | enterprise/banks/regulated — paid support | 10y+ commercial |
| **CentOS Stream** | RHEL upstream | `dnf` | dev/staging mirroring RHEL | community (rolls) |
| **Rocky / Alma** | RHEL rebuilds | `dnf` | the "free RHEL" — what people moved to when CentOS 8 EOL'd | community, RHEL-binary-compatible |
| **Amazon Linux 2023** | Fedora-like | `dnf` | EC2 — optimized for AWS, pre-tuned for EBS/ENA | AWS |
| **Alpine** | independent | `apk` | container base images (5MB, musl libc) | community |
| **SUSE/openSUSE Leap** | SUSE | `zypper` | SAP environments, EU enterprises, K3s/Rancher | SLES commercial |

**Pick-rule:** cloud/app workloads → Ubuntu LTS. Regulated enterprise → RHEL/Rocky/Alma. Containers → Alpine or distroless. AWS-native → Amazon Linux. Never ship a rolling-release base to prod.

---

## **2. Debian Family — apt**

```bash
# Ubuntu / Debian
apt update                       # refresh index (always first)
apt install -y nginx             # install
apt upgrade -y                   # upgrade all
apt remove nginx; apt purge nginx   # remove (+config for purge)
apt list --installed | grep nginx
apt-cache policy nginx           # versions available
dpkg -l | grep nginx             # installed debs
dpkg -S /usr/sbin/nginx          # which package owns a file
apt autoremove -y                # orphan deps cleanup
```

**Install a .deb file directly:** `apt install ./package.deb` (resolves deps) — not `dpkg -i` alone (breaks on missing deps, fixable with `apt --fix-broken install`).

---

## **3. RHEL Family — dnf/yum**

```bash
# RHEL, CentOS Stream, Rocky, Alma, Amazon Linux, Fedora
dnf check-update                 # = apt update-ish (index is cached)
dnf install -y nginx             # install
dnf upgrade -y                   # update all
dnf remove nginx
dnf list installed | grep nginx
dnf info nginx                   # package details
dnf provides /usr/sbin/nginx     # what owns a file
dnf history; dnf history undo 5  # ⭐ transaction rollback — apt can't do this
dnf clean all                    # clear metadata cache
rpm -qa | grep nginx             # installed RPMs
rpm -ivh file.rpm                # local rpm (rpm doesn't resolve deps)
```

**Amazon Linux 2023** — same `dnf`, plus: `amazon-linux-extras` (older AL2), preinstalled AWS CLI/SSM agent, runs `al2023` kernel tuned for Nitro/ENA.

---

## **4. Alpine — apk**

```bash
# The container distro — musl libc, busybox, no bash by default
apk update                       # refresh
apk add nginx                    # install (no -y needed, it's fast)
apk add --no-cache nginx         # in Dockerfiles — no cache layer
apk del nginx                    # remove
apk info | grep nginx            # installed
apk search nginx                 # find
apk upgrade
```

**The Alpine traps (huge in prod):** uses **musl libc, not glibc** — glibc-linked binaries fail with `not found` despite existing. Fix: rebuild, use `-alpine` image variants, or `apk add libc6-compat` as a crutch. Also **no bash** — `apk add bash` or use `sh`. DNS resolver differences cause the infamous Alpine-5-sec-delay lookups in K8s.

---

## **5. SUSE — zypper**

```bash
# SLES / openSUSE Leap — the SAP/EU enterprise distro
zypper refresh                   # update index
zypper install -y nginx          # install (also: zypper in nginx)
zypper update -y                 # upgrade
zypper remove nginx              # remove
zypper se nginx                  # search
zypper lr                        # list repos
zypper if nginx                  # package info
rpm -qa | grep nginx             # same rpm backend
```

**K3s/Rancher/Tumbleweed note:** K3s ships an openSUSE-based variant; SLES = the SAP-certified distro — that's where you meet it.

---

## **6. Day-to-Day Errors & Fixes — Cross-Distro**

| Error | Distro | Root cause → fix |
| --- | --- | --- |
| `Unable to locate package` | apt | index stale → `apt update`; or repo missing → `add-apt-repository` |
| `dpkg was interrupted` | apt | killed mid-install → `dpkg --configure -a` then `apt --fix-broken install` |
| `Could not get lock /var/lib/dpkg/lock` | apt | another apt running (unattended-upgrades) → wait, or `lsof /var/lib/dpkg/lock-frontend`, kill it, `dpkg --configure -a` |
| `No match for argument` | dnf | typo or repo missing → `dnf repolist`, enable `epel`/`powertools` (`dnf install epel-release`) |
| `GPG check FAILED` | dnf/rpm | unsigned/bad-key package → import the key `rpm --import <keyurl>` (not `--nogpgcheck` unless you know why) |
| `Failed to download metadata for repo` | dnf | repo mirror dead or centos8 EOL → swap repos to `vault.centos.org` / `mirrorlist` fix (the famous CentOS-8-EOL error) |
| `exec format error` | any | wrong-arch binary (arm image on amd64) → rebuild `--platform` or use qemu binfmt |
| `binary exists but "not found"` | Alpine | glibc binary on musl → `apk add libc6-compat` or rebuild |
| `command not found` for basic tools | Alpine | busybox defaults → `apk add bash coreutils curl` |
| `sudo: unable to resolve host` | any | hostname not in `/etc/hosts` → add `127.0.0.1 $(hostname)` |
| `no space left on device` w/ free disk | any | **inode exhaustion** → `df -i`, delete tiny-file flood (logs, docker overlays) |
| repo SSL/cert errors | any | system clock skew (NTP off) → `timedatectl`, `chronyd`; or missing ca-certificates |
| `public key is not installed` | rpm | `rpmkeys --import /etc/pki/rpm-gpg/RPM-GPG-KEY-*` |
| `apt-get: command not found` | RHEL fam | wrong family — you're on a dnf box (or Alpine `apk`, SUSE `zypper`) |
| systemd service won't start | any | `journalctl -u svc -xe` → 90% are permissions, missing env file, or port in use |

```bash
# Universal "what am I on":
cat /etc/os-release
hostnamectl
command -v apt dnf apk zypper        # which family
```

---

## **7. Distro Trivia That Comes Up**

* **CentOS 8 EOL (Dec 2021)** — the industry exodus to Rocky/Alma/Stream. If you see `Failed to download metadata for repo 'appstream'` on CentOS 8 — that's why; point repos at `vault.centos.org` or migrate.
* **Debian stable** = the calm upstream of Ubuntu. Ubuntu = Debian testing + polish + Snap. Pro tip: many "Ubuntu" Docker images are actually `debian:bookworm-slim`.
* **RHEL 9+** dropped `yum` to a `dnf` symlink — same thing.
* **AL2023** is dnf-based but NOT RHEL-compatible — it's its own thing; don't expect `epel` to work.
* **Alpine** isn't a "real" server distro — it's the container base. If a Dockerfile has `apk`, it's Alpine; `apt` = Debian/Ubuntu; `yum/dnf` = RHEL-ish.

---

## 📚 **Learning Resources**

* 🔗 [Debian Admin Handbook](https://www.debian.org/doc/manuals/debian-handbook/)
* 📦 [RHEL Docs](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/)
* 🛠️ [Alpine Linux Wiki](https://wiki.alpinelinux.org/)
