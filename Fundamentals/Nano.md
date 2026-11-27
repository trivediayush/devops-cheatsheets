# 📝 Nano Cheatsheet

**Nano** — the friendly terminal editor. No modes, shortcuts shown at the bottom, opens instantly on nearly every server. For quick config edits it's often the fastest correct tool.

---

## **1. The Basics — Zero Friction**

```bash
nano file.conf          # open (creates if missing)
nano -w file.conf       # ⚠️ -w = disable hard-wrapping — ALWAYS for configs
nano +42 file.conf      # open at line 42
nano -l file.conf       # show line numbers (-l)
nano -m file.conf       # enable mouse support
```

> [!WARNING]
> **Always `nano -w` for config files.** Nano historically wraps long lines visually-AND-literally on save in some builds — a wrapped `sshd_config` or `fstab` line can break the file. `-w` guarantees it never rewrites long lines.

---

## **2. The Shortcuts — `^` = Ctrl, `M-` = Alt/Esc**

Nano prints the shortcuts at the bottom of the screen — `^X` means `Ctrl+X`.

**File ops:**

| Key | Action |
| --- | --- |
| `Ctrl+O` | Write out (save) — asks filename, Enter to confirm |
| `Ctrl+X` | Exit (asks to save if dirty) |
| `Ctrl+R` | Read/insert another file's contents at cursor |
| `Ctrl+S` | Quick-save without prompting (newer versions) |

**Navigation:**

| Key | Action |
| --- | --- |
| `Ctrl+A` / `Ctrl+E` | start / end of line |
| `Ctrl+Y` / `Ctrl+V` | page up / page down |
| `Ctrl+W` | search (find) — `Ctrl+W` again = repeat |
| `Alt+W` | repeat search forward |
| `Ctrl+C` | show cursor position (line/col) |
| `Ctrl+_` then line | **go to line number** (`Ctrl+_` 42 Enter) |
| `Alt+/` / `Alt+?` | end / beginning of file |
| `Alt+A` then move | mark/select text (like shift-select) |

**Editing:**

| Key | Action |
| --- | --- |
| `Ctrl+K` | Cut current line (or marked text) |
| `Ctrl+U` | Paste (uncut) — the "yank" |
| `Alt+6` | Copy line/selection (no cut) |
| `Alt+U` / `Alt+E` | Undo / redo |
| `Ctrl+J` | Justify (wrap) paragraph — avoid on configs |
| `Alt+}` / `Alt+{` | Indent / unindent selected lines |
| `Ctrl+T` | Run spell check |
| `Ctrl+\` | **Search & replace** — the daily driver |

**Replace flow:** `Ctrl+\` → type search → Enter → type replacement → Enter → `Y` per match or `A` for all.

---

## **3. Buffers & Misc**

| Key | Action |
| --- | --- |
| `Alt+<` / `Alt+>` | switch between open buffers (open multiple files: `nano a.conf b.conf`) |
| `Alt+X` | toggle help text at bottom |
| `Alt+N` | toggle line numbers |
| `Alt+P` | toggle soft-wrapping display |
| `Ctrl+L` | refresh screen |
| `Alt+M` | toggle mouse |
| `Ctrl+G` | full help |

---

## **4. Nano vs Vim — When Which**

```text
nano   → quick one-off edits, "I need to fix this line and leave"
vim    → heavy editing, refactoring, macros, remote muscle-memory
sed -i → scripted edits across many files
```

**The muscle-memory traps:** `Ctrl+X` exits nano but in vim `Ctrl+X` decrements a number. `Ctrl+W` in nano searches, in vim deletes a word / window-op. When you bounce between both, the one that bites is `Ctrl+O`/`Ctrl+X` vs `:wq`.

---

## 📚 **Learning Resources**

* 🔗 [GNU Nano Manual](https://www.nano-editor.org/docs.php)
* 📦 `nano --help` and `man nano` — the cheatsheet is built in
