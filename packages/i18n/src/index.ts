import { createContext, useContext } from 'react';
import { en } from './locales/en';
import { zh } from './locales/zh';

export type Lang = 'en' | 'zh';
export type Dictionary = typeof en;

export const dictionaries: Record<Lang, Dictionary> = { en, zh };

export const LangContext = createContext<{ lang: Lang; dict: Dictionary; setLang: (l: Lang) => void }>({
  lang: 'zh',
  dict: zh,
  setLang: () => {},
});

/** Falls back to EN when a key is missing, per V1 dev notes. Phase 2 will migrate the full translations.ts from gci-living-engineering-studio into this package. */
export function useI18n() {
  return useContext(LangContext);
}

export { en, zh };
