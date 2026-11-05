// Austauschbarer maschineller Übersetzer (LibreTranslate oder DeepL). Quellsprache ist immer Deutsch.
const MAX_ITEMS = 40;
const MAX_CHARS = 4000;
const REQUEST_TIMEOUT = 60000;
const PROBE_TIMEOUT = 4000;

const env = (k) => (process.env[k] || '').trim();

export function providerName() {
  const p = env('TRANSLATE_PROVIDER').toLowerCase();
  if (['libretranslate', 'deepl', 'none'].includes(p)) return p;
  if (env('DEEPL_API_KEY')) return 'deepl';
  if (env('TRANSLATE_URL')) return 'libretranslate';
  return 'none';
}

export function isConfigured() {
  const p = providerName();
  return p === 'deepl' ? !!env('DEEPL_API_KEY') : p === 'libretranslate' ? !!env('TRANSLATE_URL') : false;
}

const libreBase = () => env('TRANSLATE_URL').replace(/\/+$/, '');
const deeplBase = () => (env('DEEPL_API_KEY').endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');
const DEEPL_TARGET = { en: 'EN-GB', pt: 'PT-PT', zh: 'ZH' };
export const deeplTarget = (code) => DEEPL_TARGET[code] || code.toUpperCase();

async function call(url, opts, ms = REQUEST_TIMEOUT) {
  let res;
  try {
    res = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    const why = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'Zeitüberschreitung' : (e?.cause?.code || e?.message || 'unbekannter Fehler');
    throw new Error(`Übersetzer nicht erreichbar (${new URL(url).host}): ${why}. Läuft der Übersetzer-Dienst (docker compose up -d translate)?`);
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.text()).slice(0, 200); } catch { /* egal */ }
    throw new Error(`Übersetzer meldet Fehler ${res.status}${msg ? `: ${msg}` : ''}`);
  }
  return res.json();
}

// Platzhalter {name} und HTML-Tags durch Tokens ersetzen, damit der Übersetzer sie nicht verändert
const PROTECT = /\{[^{}]*\}|<\/?[a-zA-Z][^>]*>/g;
export function protect(text) {
  const tokens = [];
  const masked = text.replace(PROTECT, (m) => { const t = `XVAR${tokens.length}X`; tokens.push([t, m]); return t; });
  return { masked, tokens };
}
export function restore(text, tokens) {
  if (!tokens.every(([t]) => text.includes(t))) return null;
  let out = text;
  for (const [t, m] of tokens) out = out.split(t).join(m);
  return out;
}

async function requestBatch(list, target) {
  if (providerName() === 'deepl') {
    const body = { text: list, source_lang: 'DE', target_lang: deeplTarget(target) };
    if (env('DEEPL_GLOSSARY_ID')) body.glossary_id = env('DEEPL_GLOSSARY_ID');
    const j = await call(`${deeplBase()}/v2/translate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${env('DEEPL_API_KEY')}` }, body: JSON.stringify(body),
    });
    return (j?.translations || []).map((t) => t?.text);
  }
  const body = { q: list, source: 'de', target, format: 'text' };
  if (env('TRANSLATE_API_KEY')) body.api_key = env('TRANSLATE_API_KEY');
  const j = await call(`${libreBase()}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = j?.translatedText;
  return Array.isArray(t) ? t : typeof t === 'string' ? [t] : [];
}

// Ergebnis: { texts: string[], failed: number[] } – bei fehlenden Platzhaltern bleibt der deutsche Originaltext stehen
export async function translateDetailed(texts, target) {
  if (!isConfigured()) throw new Error('Kein Übersetzer konfiguriert (TRANSLATE_URL oder DEEPL_API_KEY setzen).');
  const out = [...texts];
  const failed = [];
  const todo = [];
  texts.forEach((t, i) => { if (typeof t === 'string' && t.trim() !== '') todo.push({ i, ...protect(t) }); });

  const batches = [];
  let cur = [], chars = 0;
  for (const it of todo) {
    if (cur.length && (cur.length >= MAX_ITEMS || chars + it.masked.length > MAX_CHARS)) { batches.push(cur); cur = []; chars = 0; }
    cur.push(it); chars += it.masked.length;
  }
  if (cur.length) batches.push(cur);

  for (const b of batches) {
    const res = await requestBatch(b.map((x) => x.masked), target);
    if (res.length !== b.length) throw new Error(`Übersetzer lieferte ${res.length} statt ${b.length} Ergebnisse`);
    b.forEach((x, k) => {
      const r = typeof res[k] === 'string' ? restore(res[k], x.tokens) : null;
      if (r === null) failed.push(x.i); else out[x.i] = r;
    });
  }
  return { texts: out, failed };
}

// Liste übersetzen (gleiche Länge/Reihenfolge); Einträge mit Platzhalterverlust stehen in .failed (Indizes)
export async function translateBatch(texts, target) {
  const { texts: out, failed } = await translateDetailed(texts, target);
  out.failed = failed;
  return out;
}

// Erreichbarkeit/Sprachen prüfen (kurzer Timeout, 60 s zwischengespeichert)
let cache = null;
export function resetInfoCache() { cache = null; }

export async function translatorInfo() {
  const provider = providerName();
  const configured = isConfigured();
  const key = `${provider}|${libreBase()}|${env('DEEPL_API_KEY')}`;
  if (cache && cache.key === key && Date.now() - cache.at < 60000) return cache.info;
  const info = { provider, configured, reachable: false, supported: null };
  if (configured) {
    try {
      if (provider === 'deepl') {
        const j = await call(`${deeplBase()}/v2/languages?type=target`, { headers: { Authorization: `DeepL-Auth-Key ${env('DEEPL_API_KEY')}` } }, PROBE_TIMEOUT);
        info.supported = [...new Set(arr(j).map((l) => String(l.language).toLowerCase().split('-')[0]))];
      } else {
        const j = await call(`${libreBase()}/languages`, {}, PROBE_TIMEOUT);
        const de = arr(j).find((l) => l.code === 'de');
        info.supported = (de?.targets || arr(j).map((l) => l.code)).filter((c) => c !== 'de');
      }
      info.reachable = true;
    } catch { /* nicht erreichbar */ }
  }
  cache = { key, at: Date.now(), info };
  return info;
}
const arr = (v) => (Array.isArray(v) ? v : []);
