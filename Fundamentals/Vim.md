# ⌨️ Vim Cheatsheet

**Vim** — the editor that's on every server, in every container, in every rescue shell. Learn the language (verb + motion) and every `git commit`, `kubectl edit`, and emergency `vi /etc/fstab` becomes easy.

---

## **1. The Mental Model — Modes**

```text
            i,a,o,O,s,R etc.
NORMAL  ──────────────►  INSERT     (typing text)
  ▲  ◄──────────────
  │        Esc/Ctrl+[
  │   :                ▼
  ├──────────────►  COMMAND-LINE   (:w :q :s /search)
  │   v,V,Ctrl+v       ▼
  └──────────────►  VISUAL         (select then operate)
```

**The one thing that matters:** `verb + motion` — `d` = delete, `y` = yank, `c` = change; `w` = word, `$` = line end, `}` = paragraph. `dw` delete word, `y$` copy to end, `ci"` change inside quotes.

---

## **2. Survive & Exit (Everyone's First Lesson)**

```vim
:w            write
:q            quit
:wq / :x / ZZ write + quit
:q! / ZQ      quit, discard changes
:w !sudo tee %   write when you forgot sudo (the famous one)
```

---

## **3. Movement — The Motions**

```vim
h j k l       left/down/up/right        w b e      word fwd/back/end
0 ^ $         line start/first-char/end  gg G       file top/bottom (:42 = line 42)
} {           paragraph fwd/back         %          match bracket
f x F x       jump fwd/back to char x    t x        jump TILL char x
; ,           repeat last f/t jump       * #        next/prev occurrence of word under cursor
Ctrl+d/u      half page down/up          Ctrl+f/b   full page
zz            center cursor line         H M L      screen top/mid/bottom
```

---

## **4. Editing — Verbs**

```vim
i I a A o O   insert: here/line-start/after/line-end/below/above
x             delete char            dd         delete line
yy            yank line              y          yank (with motion)
p P           paste after/before     cc         change line (delete+insert)
r             replace one char       R          replace mode
u             undo                   Ctrl+r     redo
.             repeat last change     ~          toggle case
>> <<         indent in/out          J          join lines
```

---

## **5. Combos That Make You Fast**

```vim
dw / d$ / dd      delete word / to-end / line
di( / da(         delete inside / around parens  (also " ' { [ w)
ciw               change this word               ← daily driver
yap               yank a paragraph
dtx               delete till char x
5dd / 3yy         delete 5 lines / copy 3        ← count prefixes!
10j               down 10 lines
dj                delete this line and next
gUw / guw         upper/lowercase a word
```

---

## **6. Search, Replace & Command-Line**

```vim
/pattern        search forward          ?pattern   backward
n / N           next / prev             *          word under cursor → forward
:%s/old/new/g   replace all (whole file)
:%s/old/new/gc  replace all, confirm each  ← safe mode
:5,20s/a/b/g    replace in lines 5-20
:noh            clear highlight
:g/pattern/d    delete all lines matching
:v/pattern/d    delete lines NOT matching
:g/^$/d         delete all blank lines
```

---

## **7. Visual Mode & Yank/Paste**

```vim
v        char select        V       line select       Ctrl+v  BLOCK select
         → then: y d c > ~ or :s/.../
Ctrl+v, move down, I, type, Esc   → insert text on EVERY line (multi-cursor trick)
```

---

## **8. Buffers, Windows & Tabs**

```vim
:e file         open file        :ls          list buffers
:b n / :bn :bp  buffer by num/next/prev        :bd        close buffer
:sp file        horizontal split  :vsp file   vertical split
Ctrl+w w        cycle splits      Ctrl+w h/j/k/l  move focus
Ctrl+w =        equalize          :tabnew     new tab
gt / gT         tab next/prev
```

---

## **9. Registers & Macros**

```vim
"ayy            yank line into register a
"ap             paste register a
:reg            show all registers
"+y             yank to system clipboard
"+p             paste from system clipboard

qa <cmds> q     record macro into a    @a play it    10@a play 10×
```

---

## **10. Config — Minimal Sane .vimrc**

```vim
set number relativenumber   " line numbers + relative (jump with 5j/12k)
set ignorecase smartcase    " case-insensitive unless you type caps
set incsearch hlsearch      " live search highlight
set expandtab tabstop=2 shiftwidth=2
set autoindent
syntax on
filetype plugin indent on
set clipboard=unnamedplus   " yank → system clipboard
```

---

## **11. Vim vs Neovim vs vi**

`vi` = the POSIX original (on every rescue disk). `vim` = vi-improved, the standard. `nvim` (Neovim) = modern fork: Lua config, built-in LSP, async. On servers it's `vi`/`vim` that matters — everything else is local dev preference.

---

## 📚 **Learning Resources**

* 🔗 [vimtutor](https://vimhelp.org/) — run `vimtutor` in your shell for the built-in course
* 📦 [Vim Help](https://vimhelp.org/) — `:help <anything>`
