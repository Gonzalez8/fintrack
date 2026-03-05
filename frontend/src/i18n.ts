import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es'
import en from './locales/en'
import it from './locales/it'
import de from './locales/de'
import fr from './locales/fr'

const STORAGE_KEY = 'fintrack_lang'

const savedLang = localStorage.getItem(STORAGE_KEY)
const browserLang = navigator.language.split('-')[0]
const supportedLangs = ['es', 'en', 'it', 'de', 'fr']
const defaultLang = supportedLangs.includes(browserLang) ? browserLang : 'es'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      it: { translation: it },
      de: { translation: de },
      fr: { translation: fr },
    },
    lng: savedLang ?? defaultLang,
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
  })

i18n.on('languageChanged', (lang) => {
  localStorage.setItem(STORAGE_KEY, lang)
})

export default i18n
