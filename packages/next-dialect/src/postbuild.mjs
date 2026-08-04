#!/usr/bin/env node
// Static-export fork: turns one `next build` export into a complete,
// self-contained site per locale under dist/<locale>/.
//
// Server deployments do not need this — `next-dialect start` rewrites chunks
// on demand via the bundle proxy and only localized chunks get a locale
// URL. A static host has no request-time hook, so here every asset is forked
// and asset URLs are prefixed wholesale.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const catalogs = require_('./compiler/catalog.cjs')
const { replaceTokens, hasTokens, jsEscape, htmlEscape } = require_('./compiler/tokens.cjs')

const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
}
const outDir = path.resolve(args.out || 'out')
const distDir = path.resolve(args.dist || 'dist')
const messagesDir = path.resolve(args.messages || 'messages')
const defaultLocale = args.default || 'en'
const locales = (args.locales || catalogs.listLocales(messagesDir).join(',')).split(',')

const TEXT_EXT = new Set(['.js', '.mjs', '.css', '.html', '.txt', '.json'])

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, files)
    else files.push(p)
  }
  return files
}

const errors = []
const stats = {}

fs.rmSync(distDir, { recursive: true, force: true })

for (const locale of locales) {
  stats[locale] = { replacements: 0, files: 0 }
  const catalog = catalogs.loadResolved(messagesDir, locale, defaultLocale)
  const localeRoot = path.join(distDir, locale)

  for (const file of walk(outDir)) {
    const rel = path.relative(outDir, file).split(path.sep).join('/')
    const seg0 = rel.split('/')[0]

    let dest
    if (seg0 === '_next') {
      dest = path.join(localeRoot, rel)
    } else if (rel === `${locale}.html`) {
      dest = path.join(localeRoot, 'index.html')
    } else if (rel === `${locale}.txt`) {
      dest = path.join(localeRoot, 'index.txt')
    } else if (seg0 === locale) {
      dest = path.join(localeRoot, rel.split('/').slice(1).join('/'))
    } else if (
      locales.includes(seg0) ||
      locales.some((l) => rel === `${l}.html` || rel === `${l}.txt`)
    ) {
      continue // another locale's pages
    } else {
      dest = path.join(localeRoot, rel) // shared root files (404.html, favicon, ...)
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const ext = path.extname(file)
    if (!TEXT_EXT.has(ext)) {
      fs.copyFileSync(file, dest)
      continue
    }
    const isHtml = ext === '.html'
    const content = fs.readFileSync(file, 'utf8')
    const { out, count, errors: errs } = replaceTokens(content, {
      catalog,
      locale,
      escape: isHtml ? htmlEscape : jsEscape,
      allowIcu: !isHtml,
    })
    for (const e of errs) errors.push(`[${locale}] ${rel}: ${e}`)
    const processed = out.replaceAll('/_next/', `/${locale}/_next/`)
    if (hasTokens(processed)) errors.push(`[${locale}] ${rel}: unreplaced token survived`)
    fs.writeFileSync(dest, processed)
    stats[locale].replacements += count
    stats[locale].files++
  }
}

if (errors.length) {
  console.error('next-dialect: static fork FAILED')
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}

for (const locale of locales) {
  console.log(
    `next-dialect: ${locale} -> ${path.relative(process.cwd(), path.join(distDir, locale))} (${
      stats[locale].files
    } text files, ${stats[locale].replacements} strings inlined)`
  )
}

// Build report: which keys fell back to the default locale.
for (const locale of locales) {
  const missing = catalogs.missingKeys(messagesDir, locale, defaultLocale)
  if (missing.length) {
    console.log(
      `next-dialect: ${locale} is missing ${missing.length} key(s), using ${defaultLocale}: ${missing
        .slice(0, 8)
        .join(', ')}${missing.length > 8 ? ', …' : ''}`
    )
  }
}
