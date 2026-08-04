#!/usr/bin/env node
// next-dialect CLI: `next-dialect build` | `next-dialect start`
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const cmd = process.argv[2]
const cwd = process.cwd()

async function loadConfig() {
  for (const f of ['next.config.mjs', 'next.config.js']) {
    const p = path.join(cwd, f)
    if (fs.existsSync(p)) return (await import(pathToFileURL(p).href)).default
  }
  throw new Error('[next-dialect] next.config.mjs not found in ' + cwd)
}

const cfg = await loadConfig()
const dialect = cfg.__dialect
if (!dialect) {
  throw new Error('[next-dialect] next.config must use withDialect(...) from next-dialect/config')
}

if (cmd === 'build') {
  const req = createRequire(path.join(cwd, 'package.json'))
  const build = spawnSync(process.execPath, [req.resolve('next/dist/bin/next'), 'build'], {
    stdio: 'inherit',
    cwd,
  })
  if (build.status) process.exit(build.status)

  if (cfg.output === 'export') {
    // No server at runtime: fork the export into one static site per locale.
    const postbuild = fileURLToPath(new URL('../src/postbuild.mjs', import.meta.url))
    const fork = spawnSync(
      process.execPath,
      [
        postbuild,
        '--out',
        'out',
        '--dist',
        'dist',
        '--messages',
        process.env.DIALECT_MESSAGES,
        '--locales',
        dialect.locales.join(','),
        '--default',
        dialect.defaultLocale,
      ],
      { stdio: 'inherit', cwd }
    )
    process.exit(fork.status || 0)
  }

  // Server deployment: chunks stay as built; `next-dialect start` rewrites
  // the localized ones per request. Report fallbacks so build-time
  // resolution does not hide missing translations.
  const catalogs = createRequire(import.meta.url)('../src/compiler/catalog.cjs')
  for (const locale of dialect.locales) {
    const missing = catalogs.missingKeys(
      process.env.DIALECT_MESSAGES,
      locale,
      dialect.defaultLocale
    )
    if (missing.length) {
      console.log(
        `next-dialect: ${locale} is missing ${missing.length} key(s), using ${dialect.defaultLocale}: ${missing
          .slice(0, 8)
          .join(', ')}${missing.length > 8 ? ', …' : ''}`
      )
    }
  }
  console.log('next-dialect: build ready — run `next-dialect start` to serve it.')
} else if (cmd === 'start') {
  const { createDialectServer } = await import(new URL('../src/server.mjs', import.meta.url).href)
  await createDialectServer({ port: Number(process.env.PORT || 3000), dialect, dir: cwd })
} else {
  console.error('usage: next-dialect <build|start>')
  process.exit(1)
}
