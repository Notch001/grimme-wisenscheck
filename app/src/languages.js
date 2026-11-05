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

// Aktivierte Sprachen: Auswahl aus dem Admin-Bereich (in der DB gespeichert), sonst Startwert aus ENABLED_LANGS.
let chosen = null;

function parseCodes(raw) {
  const seen = new Set();
  const out = [];
  for (const c of raw) {
    const code = String(c).trim().toLowerCase();
    if (!code || code === SOURCE || seen.has(code) || !CATALOG[code]) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function setEnabledCodes(codes) {
  chosen = parseCodes(codes);
  return chosen;
}

export function enabledLanguages() {
  const codes = chosen ?? parseCodes((process.env.ENABLED_LANGS ?? DEFAULT_LANGS).split(','));
  return codes.map(langInfo);
}

export const isEnabled = (code) => enabledLanguages().some((l) => l.code === code);

// Alle wählbaren Sprachen mit Markierung, ob sie aktiv sind
export const catalogList = () => {
  const on = new Set(enabledLanguages().map((l) => l.code));
  return Object.keys(CATALOG).map((code) => ({ ...langInfo(code), enabled: on.has(code) }));
};
