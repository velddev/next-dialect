// Hydrated-UX tests for next-static-intl, run against BOTH serving flows.
// Every test also fails on any browser console error — which catches
// hydration mismatches between server-rendered strings and the inlined
// constants in the per-locale variant chunks.
import { test, expect } from '@playwright/test'

const TARGETS = [
  { name: 'static', base: 'http://localhost:4510' },
  { name: 'ssr', base: 'http://localhost:4620' },
]

function trackConsole(page) {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

for (const { name, base } of TARGETS) {
  test.describe(`${name} flow`, () => {
    test('nl: hydrates, cycles status, compile-time fallback appears', async ({ page }) => {
      const errors = trackConsole(page)
      await page.goto(base + '/nl/')
      await expect(page.getByTestId('status-template')).toHaveText('Actief')
      await page.getByRole('button', { name: 'Wissel status' }).click()
      // status.pending is missing from nl.json — the en string is baked in.
      await expect(page.getByTestId('status-template')).toHaveText('Pending')
      await expect(page.getByTestId('status-dynamic')).toHaveText('Pending')
      await page.getByRole('button', { name: 'Wissel status' }).click()
      await expect(page.getByTestId('status-template')).toHaveText('Gesloten')
      expect(errors).toEqual([])
    })

    test('en: interpolation reacts to typing', async ({ page }) => {
      const errors = trackConsole(page)
      await page.goto(base + '/en/')
      await expect(page.getByTestId('greeting')).toHaveText('Hello, Ada!')
      await page.getByLabel('name').fill('Grace')
      await expect(page.getByTestId('greeting')).toHaveText('Hello, Grace!')
      expect(errors).toEqual([])
    })

    test('nl: lazy panel loads its own localized chunk from the locale prefix', async ({
      page,
    }) => {
      const errors = trackConsole(page)
      // Capture the bodies of chunks fetched after the click. The static flow
      // serves them from a locale-prefixed path; the SSR flow serves the same
      // chunk un-prefixed and resolves the locale from the cookie. Either
      // way the delivered JavaScript must contain Dutch constants.
      const lazyBodies = []
      let capture = false
      page.on('response', async (r) => {
        if (!capture || !r.url().endsWith('.js')) return
        try {
          lazyBodies.push(await r.text())
        } catch {}
      })
      await page.goto(base + '/nl/')
      capture = true
      await page.getByRole('button', { name: 'Laad lazy paneel' }).click()
      await expect(page.getByTestId('lazy-panel')).toContainText('Lazy geladen')
      await expect(page.getByTestId('lazy-panel')).toContainText(
        'De strings van dit paneel leven alleen in zijn eigen lazy chunk.'
      )
      expect(lazyBodies.length).toBeGreaterThan(0)
      expect(lazyBodies.some((b) => b.includes('Lazy geladen'))).toBe(true)
      expect(lazyBodies.some((b) => b.includes('Lazily loaded'))).toBe(false)
      expect(errors).toEqual([])
    })

    for (const [locale, texts] of [
      ['en', ['Your cart is empty', '1 item in your cart', '2 items in your cart']],
      ['nl', ['Je winkelwagen is leeg', '1 artikel in je winkelwagen', '2 artikelen in je winkelwagen']],
    ]) {
      test(`${locale}: ICU plural follows ${locale} plural rules`, async ({ page }) => {
        const errors = trackConsole(page)
        await page.goto(`${base}/${locale}/`)
        await expect(page.getByTestId('cart')).toHaveText(texts[0])
        await page.getByTestId('cart-add').click()
        await expect(page.getByTestId('cart')).toHaveText(texts[1])
        await page.getByTestId('cart-add').click()
        await expect(page.getByTestId('cart')).toHaveText(texts[2])
        await page.getByTestId('cart-clear').click()
        await expect(page.getByTestId('cart')).toHaveText(texts[0])
        expect(errors).toEqual([])
      })
    }

    test('nl: ICU select and number/date formatting', async ({ page }) => {
      const errors = trackConsole(page)
      await page.goto(base + '/nl/')
      await expect(page.getByTestId('plan')).toHaveText('Je hebt het gratis abonnement')
      await page.getByTestId('plan-next').click()
      await expect(page.getByTestId('plan')).toHaveText('Je hebt het Pro-abonnement')
      // 25% + a medium date, formatted by the browser's own Intl for nl.
      await expect(page.getByTestId('discount')).toContainText('25%')
      await expect(page.getByTestId('discount')).toContainText('korting tot')
      expect(errors).toEqual([])
    })

    test('en: complex ICU — multi-var, offset plural, nested #/args, ordinal, hostile chars', async ({
      page,
    }) => {
      const errors = trackConsole(page)
      await page.goto(base + '/en/')
      await expect(page.getByTestId('multi')).toHaveText('Ann, Ben and Chi met at Delft')
      // count = 0: exact =0 branches
      await expect(page.getByTestId('party')).toHaveText('Nobody is coming')
      await expect(page.getByTestId('ordinal')).toHaveText('0th place')
      await expect(page.getByTestId('inbox')).toHaveText('Ada has no messages')
      // hostile characters survive minified-JS inlining + HTML escaping + hydration
      await expect(page.getByTestId('escapes')).toHaveText(
        'He said: "don\'t `break` \\ <this> & that" — 100% $done'
      )
      // count = 1: exact =1 + nested args
      await page.getByTestId('cart-add').click()
      await expect(page.getByTestId('party')).toHaveText('Only Ada is there')
      await expect(page.getByTestId('ordinal')).toHaveText('1st place')
      await expect(page.getByTestId('inbox')).toHaveText('Ada has 1 message from Bob')
      // count = 2: offset:1 -> 'one' branch; ordinal 'two'
      await page.getByTestId('cart-add').click()
      await expect(page.getByTestId('party')).toHaveText('Ada and one guest')
      await expect(page.getByTestId('ordinal')).toHaveText('2nd place')
      await expect(page.getByTestId('inbox')).toHaveText('Ada has 2 messages from Bob')
      // count = 5: offset # renders count - offset
      for (let k = 0; k < 3; k++) await page.getByTestId('cart-add').click()
      await expect(page.getByTestId('party')).toHaveText('Ada and 4 guests')
      await expect(page.getByTestId('ordinal')).toHaveText('5th place')
      expect(errors).toEqual([])
    })

    test('nl: complex ICU follows Dutch rules; hostile-chars string falls back to en', async ({
      page,
    }) => {
      const errors = trackConsole(page)
      await page.goto(base + '/nl/')
      await expect(page.getByTestId('multi')).toHaveText('Ann, Ben en Chi ontmoetten elkaar in Delft')
      await expect(page.getByTestId('party')).toHaveText('Er komt niemand')
      // complex.escapes is missing from nl.json — en string baked into the nl bundle
      await expect(page.getByTestId('escapes')).toHaveText(
        'He said: "don\'t `break` \\ <this> & that" — 100% $done'
      )
      await page.getByTestId('cart-add').click()
      await page.getByTestId('cart-add').click()
      await expect(page.getByTestId('party')).toHaveText('Ada en één gast')
      await expect(page.getByTestId('ordinal')).toHaveText('2e plaats')
      await expect(page.getByTestId('inbox')).toHaveText('Ada heeft 2 berichten van Bob')
      expect(errors).toEqual([])
    })

    test('nl: t.rich renders real elements from ICU tags', async ({ page }) => {
      const errors = trackConsole(page)
      await page.goto(base + '/nl/')
      const rich = page.getByTestId('rich')
      await expect(rich).toContainText('Lees de voorwaarden en de privacyverklaring, Ada.')
      // The tag callbacks produced actual DOM, not escaped markup.
      await expect(rich.locator('a[href="/terms"]')).toHaveText('voorwaarden')
      await expect(rich.locator('em')).toHaveText('privacyverklaring')
      // Rich messages stay reactive to their parameters.
      await page.getByLabel('name').fill('Grace')
      await expect(rich).toContainText('Grace')
      expect(errors).toEqual([])
    })

    test('nl: t.dynamic resolves runtime-computed keys, with fallback', async ({ page }) => {
      const errors = trackConsole(page)
      await page.goto(base + '/nl/')
      await expect(page.getByTestId('dynamic')).toHaveText('Het verzoek duurde te lang.')
      await page.getByTestId('error-next').click()
      await expect(page.getByTestId('dynamic')).toHaveText('Je hebt daar geen toegang toe.')
      // errors.unknown is missing from nl.json -> en baked in at build time.
      await page.getByTestId('error-next').click()
      await expect(page.getByTestId('dynamic')).toHaveText('Something went wrong.')
      expect(errors).toEqual([])
    })

    test('locale switch link crosses trees with a full navigation', async ({ page }) => {
      const errors = trackConsole(page)
      await page.goto(base + '/en/')
      await page.getByRole('link', { name: 'View in Dutch' }).click()
      await expect(page).toHaveURL(/\/nl\/?$/)
      await expect(page.locator('h1')).toHaveText('Lever elke taal als zijn eigen bundel')
      expect(errors).toEqual([])
    })

    test('no sentinel tokens in the rendered DOM', async ({ page }) => {
      await page.goto(base + '/nl/')
      const body = await page.evaluate(() => document.body.innerText)
      expect(body).not.toMatch(//)
      expect(body).not.toContain('home.')
      expect(body).not.toContain('status.')
    })
  })
}

test.describe('ssr only', () => {
  const base = 'http://localhost:4620'

  test('force-dynamic page re-renders per request and stays interactive', async ({ page }) => {
    const errors = trackConsole(page)
    await page.goto(base + '/nl/dynamic')
    const first = await page.locator('main > p').first().textContent()
    await page.getByRole('button', { name: 'Wissel status' }).click()
    await expect(page.getByTestId('status-template')).toHaveText('Pending')
    await page.reload()
    const second = await page.locator('main > p').first().textContent()
    expect(second).not.toEqual(first)
    expect(errors).toEqual([])
  })

  test('root redirect honors Accept-Language', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'nl', extraHTTPHeaders: { 'accept-language': 'nl' } })
    const page = await ctx.newPage()
    await page.goto(base + '/')
    await expect(page).toHaveURL(/\/nl\/?$/)
    await ctx.close()
  })
})
