/**
 * i18n initialization with react-i18next
 */

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import {
  DEFAULT_LANGUAGE,
  DEFAULT_NAMESPACE,
  NAMESPACES,
  STORAGE_KEY,
  SUPPORTED_LANGUAGES,
} from './config'
// Import German translations
import deAdvanced from './locales/de/advanced.json'
import deCommon from './locales/de/common.json'
import deGuide from './locales/de/guide.json'
import deHardware from './locales/de/hardware.json'
import deHelp from './locales/de/help.json'
import deOutput from './locales/de/output.json'
import dePdf from './locales/de/pdf.json'
import deTopology from './locales/de/topology.json'
import deValidation from './locales/de/validation.json'
import deWorkload from './locales/de/workload.json'
// Import English translations (always bundled as fallback)
import enAdvanced from './locales/en/advanced.json'
import enCommon from './locales/en/common.json'
import enGuide from './locales/en/guide.json'
import enHardware from './locales/en/hardware.json'
import enHelp from './locales/en/help.json'
import enOutput from './locales/en/output.json'
import enPdf from './locales/en/pdf.json'
import enTopology from './locales/en/topology.json'
import enValidation from './locales/en/validation.json'
import enWorkload from './locales/en/workload.json'
// Import French translations
import frAdvanced from './locales/fr/advanced.json'
import frCommon from './locales/fr/common.json'
import frGuide from './locales/fr/guide.json'
import frHardware from './locales/fr/hardware.json'
import frHelp from './locales/fr/help.json'
import frOutput from './locales/fr/output.json'
import frPdf from './locales/fr/pdf.json'
import frTopology from './locales/fr/topology.json'
import frValidation from './locales/fr/validation.json'
import frWorkload from './locales/fr/workload.json'

// Import Italian translations
import itAdvanced from './locales/it/advanced.json'
import itCommon from './locales/it/common.json'
import itGuide from './locales/it/guide.json'
import itHardware from './locales/it/hardware.json'
import itHelp from './locales/it/help.json'
import itOutput from './locales/it/output.json'
import itPdf from './locales/it/pdf.json'
import itTopology from './locales/it/topology.json'
import itValidation from './locales/it/validation.json'
import itWorkload from './locales/it/workload.json'

const resources = {
  en: {
    common: enCommon,
    topology: enTopology,
    hardware: enHardware,
    workload: enWorkload,
    advanced: enAdvanced,
    output: enOutput,
    validation: enValidation,
    pdf: enPdf,
    help: enHelp,
    guide: enGuide,
  },
  fr: {
    common: frCommon,
    topology: frTopology,
    hardware: frHardware,
    workload: frWorkload,
    advanced: frAdvanced,
    output: frOutput,
    validation: frValidation,
    pdf: frPdf,
    help: frHelp,
    guide: frGuide,
  },
  de: {
    common: deCommon,
    topology: deTopology,
    hardware: deHardware,
    workload: deWorkload,
    advanced: deAdvanced,
    output: deOutput,
    validation: deValidation,
    pdf: dePdf,
    help: deHelp,
    guide: deGuide,
  },
  it: {
    common: itCommon,
    topology: itTopology,
    hardware: itHardware,
    workload: itWorkload,
    advanced: itAdvanced,
    output: itOutput,
    validation: itValidation,
    pdf: itPdf,
    help: itHelp,
    guide: itGuide,
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: DEFAULT_NAMESPACE,
    ns: NAMESPACES,

    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: true,
    },
  })

export default i18n
