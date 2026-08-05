// Next ships no "exports" field, so a bare `next/server` specifier only
// resolves inside a bundler. A proxy file is bundled by Next, so the import in
// src/next-proxy.mjs is correct in real use — but importing that module
// straight from Node, as tests/proxy.mjs does, needs the extension put back.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
}
