import { cache } from 'react'
import { createInstance } from 'i18next'
import ICU from 'i18next-icu'
import en from '../messages/en.json'
import nl from '../messages/nl.json'
import { defaultLocale, initOptions } from './i18n-config'

const catalogs = { en, nl }

// One i18next instance per locale, created eagerly-on-demand on the server.
const instances = new Map()
function instanceFor(locale) {
  let inst = instances.get(locale)
  if (!inst) {
    inst = createInstance()
    inst.use(ICU).init(initOptions(locale, catalogs[locale]))
    instances.set(locale, inst)
  }
  return inst
}

// React `cache` gives us a per-request slot, so the layout can hand the locale
// to server components further down the tree without threading props through
// the generated components.
const requestLocale = cache(() => ({ current: defaultLocale }))

export function setServerLocale(locale) {
  requestLocale().current = locale
}

export function getServerLocale() {
  return requestLocale().current
}

export function getMessages(locale) {
  return catalogs[locale] ?? catalogs[defaultLocale]
}

/** `t` for the locale of the current request. */
export function getT() {
  return instanceFor(getServerLocale()).getFixedT(null, 'translation')
}
