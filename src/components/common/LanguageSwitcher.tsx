/**
 * Language switcher component for selecting UI language.
 */

import { useTranslation } from 'react-i18next'
import { LANGUAGE_LABELS, type Language, SUPPORTED_LANGUAGES } from '@/i18n/config'
import { Select } from './FormControls'

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((lang) => ({
  value: lang,
  label: LANGUAGE_LABELS[lang],
}))

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const handleChange = (value: string) => {
    i18n.changeLanguage(value as Language)
  }

  return (
    <Select
      id="language-select"
      value={i18n.language as Language}
      options={LANGUAGE_OPTIONS}
      onChange={handleChange}
    />
  )
}
