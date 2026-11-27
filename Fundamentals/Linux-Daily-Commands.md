# 🛠️ Linux Daily Commands — The Ops Workbench

**The commands you actually type every day.** Organized by task, not alphabet — system info, disk, memory, processes, services, files, network, packages, logs.

---

## **1. System & Hardware Info**

```bash
uname -a                    # kernel version
hostnamectl                 # hostname + OS
cat /etc/os-release         # distro + version
uptime                      # load average (1/5/15 min) — >CPU count = overloaded
lscpu                       # CPU count/arch
lsblk                       # disks + partitions
lspci | grep -i net         # hardware (NIC, GPU)
free -h                     # RAM usage — check "available", not "free"
df -h                       # disk usage per mount
du -sh /var/* 2>/dev/null | sort -rh | head   # what's eating space
date; timedatectl           # time/timezone/NTP sync
whoami; id                  # current user + groups
w; last | head              # who's logged in / login history
```

---

## **2. Processes — Find, Watch, Kill**

```bash
ps aux | grep <name>        # find a process
ps aux --sort=-%cpu | head  # top CPU hogs
ps aux --sort=-%mem | head  # top memory hogs
pgrep -fl nginx             # find PID by name
top / htop                  # live view (htop is better — install it)
kill <pid>                  # SIGTERM — ask nicely first
kill -9 <pid>               # SIGKILL — last resort, no cleanup
kill -HUP <pid>             # reload signal (nginx, sshd respect it)
pkill -f pattern            # kill by name/pattern
jobs; fg %1; bg %1          # job control
nohup cmd > out.log 2>&1 &  # survive terminal close
```

---

## **3. Files & Text — The Daily Grind**

```bash
ls -lah                     # size-readable list
find /var -name "*.log" -mtime +30     # find old files
find / -size +500M -type f 2>/dev/null # space hogs
find . -type f -name "*.conf" -exec grep -l "pattern" {} \;
tail -f app.log             # follow a log — the #1 command
tail -n 500 app.log         # last 500 lines
head -50 file; less +F file # read start / follow in less
wc -l file                  # line count
cp -r src dest; mv old new  # copy/move
rm -rf dir                  # ⚠️ triple-check the path first
ln -s /real/path link       # symlink
chmod 755 file; chown user:group file
stat file                   # full metadata (atime/mtime/inode)
file mystery.bin            # what is this file?
which cmd; type cmd         # where does this command come from
```

---

## **4. Archives & Transfer**

```bash
tar czf app.tar.gz app/           # compress
tar xzf app.tar.gz                # extract
tar tzf app.tar.gz | head         # list contents first
zip -r app.zip app/               # zip
scp file user@host:/path/         # copy to remote
rsync -avz --progress src/ user@host:/dest/   # incremental sync (the right way)
rsync -avz --delete src/ dest/    # mirror — deletes extras at dest
curl -O https://x/file            # download
wget -q https://x/file
```

---

## **5. Services & systemd**

```bash
systemctl status nginx            # is it up?
systemctl start|stop|restart nginx
systemctl reload nginx            # reread config, no drop
systemctl enable nginx            # start on boot
systemctl list-units --failed     # what's broken right now
journalctl -u nginx -f            # live logs for a service
journalctl -u nginx --since "10 min ago"
journalctl -p err -b              # errors only, this boot
journalctl --disk-usage           # log space
```

---

## **6. Networking — Daily Checks**

```bash
ip addr; ip route                 # interfaces + routes
ss -tlnp                          # who's listening on which port
ss -tn state established          # active connections
ping -c4 host                     # alive?
curl -vI https://site.com         # HTTP + headers + TLS info
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" url
dig domain.com; nslookup domain.com
dig domain.com @8.8.8.8           # bypass local DNS
traceroute host / mtr host        # path to a host (mtr is better)
nc -zv host 443                   # is the port open? (refused vs timeout!)
ethtool eth0                      # NIC speed/duplex
ip link show                      # interface up/down + MAC
hostname -I                       # all local IPs quickly
```

---

## **7. Packages**

```bash
# Debian/Ubuntu
apt update && apt upgrade -y
apt install htop -y; apt remove pkg
apt list --installed | grep pkg
dpkg -l | grep pkg; dpkg -S /path/file   # which package owns a file

# RHEL/CentOS/Fedora
dnf install htop -y   # or yum on older
rpm -qa | grep pkg; rpm -qf /path/file
```

---

## **8. Users & Permissions**

```bash
useradd -m -s /bin/bash deploy    # create user
usermod -aG sudo deploy           # add to sudo group
passwd deploy                     # set password
su - deploy                       # switch user (with env)
sudo -i                           # root shell
groups deploy                     # group membership
ls -l /etc/sudoers.d/             # sudo rules
chmod 644 file; chmod 755 dir     # file=644 dir=755 (the safe defaults)
chown -R deploy:deploy /app
getent passwd | tail              # list local users
```

---

## **9. Cron — Scheduled Tasks**

```bash
crontab -e                        # edit your crontab
crontab -l                        # list
# ┌min ┬hour ┬dom ┬month ┬dow
#  0   3     *    *      *     → 3:00 AM daily
#  */5 *     *    *      *     → every 5 min
#  0   0     *    *      0     → Sunday midnight

0 3 * * * /opt/backup.sh >> /var/log/backup.log 2>&1
# ⚠️ cron has a minimal env — use ABSOLUTE paths, declare needed vars
grep CRON /var/log/syslog         # did it run?
```

---

## **10. The "Something's Wrong" Sequence**

```bash
# When a server feels sick, in order:
uptime                            # load — is it overloaded?
df -h                             # disk full? (the #1 silent killer)
free -h                           # out of memory?
dmesg | tail -20                  # OOM kills, hardware errors
journalctl -p err -b | tail -20   # recent errors
systemctl list-units --failed     # failed services
ss -s                             # connection overload?
top                               # what's consuming
```

---

## 📚 **Learning Resources**

* 🔗 [Linux man pages](https://man7.org/linux/man-pages/)
* 📦 [tldr — simplified man pages](https://tldr.sh/) — `tldr tar` for instant examples
* 🛠️ [explainshell](https://explainshell.com/) — paste a command, get it decoded
