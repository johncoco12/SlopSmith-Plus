import { createI18n } from 'vue-i18n'
import enEN from './locales/en-EN.json'
import deDE from './locales/de-DE.json'
import frFR from './locales/fr-FR.json'
import plPL from './locales/pl-PL.json'
import nlNL from './locales/nl-NL.json'
import jaJP from './locales/ja-JP.json'
import esES from './locales/es-ES.json'

export type SupportedLocale = 'en-EN' | 'de-DE' | 'fr-FR' | 'pl-PL' | 'nl-NL' | 'ja-JP' | 'es-ES'

const savedLocale = localStorage.getItem('locale') as SupportedLocale | null

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale || 'en-EN',
  fallbackLocale: 'en-EN',
  messages: {
    'en-EN': enEN,
    'de-DE': deDE,
    'fr-FR': frFR,
    'pl-PL': plPL,
    'nl-NL': nlNL,
    'ja-JP': jaJP,
    'es-ES': esES,
  },
})

export function setLocale(locale: SupportedLocale): void {
  ;(i18n.global.locale as unknown as { value: string }).value = locale
  localStorage.setItem('locale', locale)
  document.documentElement.setAttribute('lang', locale.split('-')[0])
}

export function getLocale(): SupportedLocale {
  return (i18n.global.locale as unknown as { value: string }).value as SupportedLocale
}
