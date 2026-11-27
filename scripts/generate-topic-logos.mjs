import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const themeFile = path.join(root, '.vitepress/theme/components/TopicBrand.vue')
const outputDir = path.join(root, 'public/topic-logos')
const require = createRequire(import.meta.url)

function readIconCollection() {
  const candidates = [
    '@iconify-json/simple-icons/icons.json',
    '@iconify-json/simple-icons/icons',
  ]

  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate)
      return JSON.parse(fs.readFileSync(resolved, 'utf8'))
    } catch {
      // Try the next package entry; VitePress installs this collection as a dependency.
    }
  }

  const directPath = path.join(root, 'node_modules/@iconify-json/simple-icons/icons.json')
  if (fs.existsSync(directPath)) {
    return JSON.parse(fs.readFileSync(directPath, 'utf8'))
  }

  return null
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character])
}

const collection = readIconCollection()
if (!collection?.icons) {
  console.warn('[topic-logos] Simple Icons collection is unavailable. Text-based topic marks will remain visible.')
  process.exit(0)
}

const component = fs.readFileSync(themeFile, 'utf8')
const slugs = [...new Set([...component.matchAll(/slug:\s*'([^']+)'/g)].map(match => match[1]))]
fs.mkdirSync(outputDir, { recursive: true })

let generated = 0
let missing = 0
for (const slug of slugs) {
  const icon = collection.icons[slug]
  if (!icon?.body) {
    // Keep the local image request successful; TopicBrand's visible text mark
    // remains underneath this transparent fallback.
    fs.writeFileSync(
      path.join(outputDir, `${slug}.svg`),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44"></svg>\n',
    )
    missing += 1
    continue
  }

  const width = Number(icon.width) || Number(collection.width) || 24
  const height = Number(icon.height) || Number(collection.height) || 24
  const left = Number(icon.left) || 0
  const top = Number(icon.top) || 0
  const body = icon.body.replace(/currentColor/g, '#64748b')
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` viewBox="${left} ${top} ${width} ${height}"`,
    ' width="44" height="44"',
    ` role="img" aria-label="${escapeXml(slug)} logo">`,
    body,
    '</svg>',
  ].join('')

  fs.writeFileSync(path.join(outputDir, `${slug}.svg`), `${svg}\n`)
  generated += 1
}

console.log(`[topic-logos] Generated ${generated} local SVG logos${missing ? `; ${missing} marks use instant text fallbacks` : ''}.`)
