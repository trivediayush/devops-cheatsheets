import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const markdownFiles = []

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.vitepress') continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(absolute)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) markdownFiles.push(absolute)
  }
}

function stripCode(source) {
  const lines = source.split(/\r?\n/)
  const output = []
  let fence = null

  for (const line of lines) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (match) {
      if (!fence) fence = { char: match[1][0], length: match[1].length }
      else if (match[1][0] === fence.char && match[1].length >= fence.length) fence = null
      output.push('')
      continue
    }
    output.push(fence ? '' : line)
  }

  return output.join('\n').replace(/(`+)(.*?)\1/g, '')
}

function resolveTarget(sourceFile, target) {
  const cleanTarget = decodeURIComponent(target.split(/[?#]/, 1)[0])
  if (!cleanTarget) return true

  const resolved = cleanTarget.startsWith('/')
    ? path.resolve(root, `.${cleanTarget}`)
    : path.resolve(path.dirname(sourceFile), cleanTarget)

  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) return false

  const candidates = [resolved]
  if (cleanTarget.startsWith('/')) {
    candidates.push(path.resolve(root, 'public', `.${cleanTarget}`))
  }
  if (!path.extname(resolved)) {
    candidates.push(`${resolved}.md`, `${resolved}.html`)
    candidates.push(path.join(resolved, 'index.md'), path.join(resolved, 'README.md'))
  }
  return candidates.some(candidate => {
    try { return fs.statSync(candidate).isFile() } catch { return false }
  })
}

walk(root)
markdownFiles.sort()
const issues = []
const linkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g
const ignoredProtocols = /^(?:https?:|mailto:|tel:|ftp:|data:|javascript:|#)/i

for (const sourceFile of markdownFiles) {
  const source = stripCode(fs.readFileSync(sourceFile, 'utf8'))
  for (const match of source.matchAll(linkPattern)) {
    let target = match[1].replace(/^<|>$/g, '')
    if (ignoredProtocols.test(target) || target.startsWith('{')) continue
    if (!resolveTarget(sourceFile, target)) {
      const relativeFile = path.relative(root, sourceFile).split(path.sep).join('/')
      issues.push(`${relativeFile}: ${target}`)
    }
  }
}

if (issues.length) {
  console.error(`Found ${issues.length} broken local Markdown link(s):`)
  for (const issue of issues) console.error(`  - ${issue}`)
  process.exitCode = 1
} else {
  console.log(`Checked ${markdownFiles.length} Markdown files: no broken local links found.`)
}
