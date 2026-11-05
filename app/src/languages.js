// Sprachkatalog für die Teilnehmer-Oberfläche und die Übersetzung von Inhalten.
export const SOURCE = 'de';

export const CATALOG = {
  en: { name: 'English' },
  pl: { name: 'Polski' },
  tr: { name: 'Türkçe' },
  ro: { name: 'Română' },
  bg: { name: 'Български' },
  fr: { name: 'Français' },
  es: { name: 'Español' },
  it: { name: 'Italiano' },
  pt: { name: 'Português' },
  nl: { name: 'Nederlands' },
  cs: { name: 'Čeština' },
  sk: { name: 'Slovenčina' },
  hu: { name: 'Magyar' },
  ru: { name: 'Русский' },
  uk: { name: 'Українська' },
  hr: { name: 'Hrvatski' },
  sl: { name: 'Slovenščina' },
  el: { name: 'Ελληνικά' },
  sv: { name: 'Svenska' },
  da: { name: 'Dansk' },
  fi: { name: 'Suomi' },
  ar: { name: 'العربية', rtl: true },
  zh: { name: '中文' },
  ja: { name: '日本語' },
};

export const DEFAULT_LANGS = 'en,pl,tr,ro,fr,es,it,nl,cs,hu,ru,uk,ar';

export const langInfo = (code) => (CATALOG[code] ? { code, name: CATALOG[code].name, rtl: !!CATALOG[code].rtl } : null);

// Aktivierte Sprachen aus ENABLED_LANGS (ohne Quellsprache, nur Codes aus dem Katalog)
export function enabledLanguages() {
  const raw = process.env.ENABLED_LANGS ?? DEFAULT_LANGS;
  const seen = new Set();
  const out = [];
  for (const c of raw.split(',').map((s) => s.trim().toLowerCase())) {
    if (!c || c === SOURCE || seen.has(c) || !CATALOG[c]) continue;
    seen.add(c);
    out.push(langInfo(c));
  }
  return out;
}

export const isEnabled = (code) => enabledLanguages().some((l) => l.code === code);
