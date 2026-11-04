import test from 'node:test';
import assert from 'node:assert/strict';
import { translateBatch, translateDetailed, translatorInfo, resetInfoCache, protect, restore, deeplTarget } from '../src/translate.js';

const KEYS = ['TRANSLATE_PROVIDER', 'TRANSLATE_URL', 'TRANSLATE_API_KEY', 'DEEPL_API_KEY', 'DEEPL_GLOSSARY_ID'];
const realFetch = globalThis.fetch;
function setup(env, handler) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  resetInfoCache();
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), opts, body });
    const r = await handler(String(url), body, opts);
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json, text: async () => JSON.stringify(r.json ?? '') };
  };
  return calls;
}
test.afterEach(() => { globalThis.fetch = realFetch; for (const k of KEYS) delete process.env[k]; resetInfoCache(); });

const libre = (q) => ({ json: { translatedText: q.map((t) => `[en] ${t}`) } });

test('protect/restore: Platzhalter und Tags', () => {
  const { masked, tokens } = protect('Hallo {name}, <b>los</b>!');
  assert.ok(!masked.includes('{name}') && !masked.includes('<b>'));
  assert.equal(restore(masked, tokens), 'Hallo {name}, <b>los</b>!');
  assert.equal(restore('ohne token', tokens), null);
});

test('LibreTranslate: Platzhalter werden geschützt und zurückgetauscht', async () => {
  const calls = setup({ TRANSLATE_URL: 'http://tr:5000/' }, (u, b) => libre(b.q));
  const out = await translateBatch(['Hallo {name}', 'Zeile 1\nZeile 2', ''], 'en');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://tr:5000/translate');
  assert.deepEqual([calls[0].body.source, calls[0].body.target, calls[0].body.format], ['de', 'en', 'text']);
  assert.ok(!calls[0].body.q.join().includes('{name}'));
  assert.deepEqual([...out], ['[en] Hallo {name}', '[en] Zeile 1\nZeile 2', '']);
  assert.deepEqual(out.failed, []);
});

test('verlorener Platzhalter: Originaltext bleibt, Eintrag zählt als Fehler', async () => {
  setup({ TRANSLATE_URL: 'http://tr:5000' }, (u, b) => ({ json: { translatedText: b.q.map((t) => t.replace(/XVAR\d+X/g, '')) } }));
  const { texts, failed } = await translateDetailed(['Hallo {name}', 'Ohne'], 'pl');
  assert.deepEqual(texts, ['Hallo {name}', 'Ohne']);
  assert.deepEqual(failed, [0]);
});

test('Batching: höchstens 40 Texte bzw. ~4000 Zeichen je Anfrage', async () => {
  const calls = setup({ TRANSLATE_URL: 'http://tr:5000' }, (u, b) => libre(b.q));
  const many = Array.from({ length: 95 }, (_, i) => `Text ${i}`);
  const out = await translateBatch(many, 'fr');
  assert.deepEqual(calls.map((c) => c.body.q.length), [40, 40, 15]);
  assert.equal(out.length, 95);
  assert.equal(out[94], '[en] Text 94');

  calls.length = 0;
  const big = Array.from({ length: 5 }, () => 'x'.repeat(1500));
  await translateBatch(big, 'fr');
  assert.deepEqual(calls.map((c) => c.body.q.length), [2, 2, 1]);
  assert.ok(calls.every((c) => c.body.q.join('').length <= 4000));
});

test('DeepL: Endpunkt, Header, Zielsprachen-Mapping, Glossar', async () => {
  const calls = setup({ DEEPL_API_KEY: 'abc:fx', DEEPL_GLOSSARY_ID: 'g1' }, (u, b) => ({ json: { translations: b.text.map((t) => ({ text: `<${t}>` })) } }));
  const out = await translateBatch(['Hallo {x}'], 'en');
  assert.equal(calls[0].url, 'https://api-free.deepl.com/v2/translate');
  assert.equal(calls[0].opts.headers.Authorization, 'DeepL-Auth-Key abc:fx');
  assert.deepEqual([calls[0].body.source_lang, calls[0].body.target_lang, calls[0].body.glossary_id], ['DE', 'EN-GB', 'g1']);
  assert.equal(out[0].includes('{x}'), true);
  assert.deepEqual(['en', 'pt', 'zh', 'pl'].map(deeplTarget), ['EN-GB', 'PT-PT', 'ZH', 'PL']);
  setup({ DEEPL_API_KEY: 'pro-key' }, (u, b) => ({ json: { translations: b.text.map((t) => ({ text: t })) } }));
  await translateBatch(['a'], 'pl');
  assert.ok(globalThis.fetch);
});

test('Fehler: Server nicht erreichbar / HTTP-Fehler / nicht konfiguriert', async () => {
  setup({ TRANSLATE_URL: 'http://tr:5000' }, () => { throw new TypeError('fetch failed'); });
  await assert.rejects(translateBatch(['a'], 'en'), /Übersetzer nicht erreichbar/);
  setup({ TRANSLATE_URL: 'http://tr:5000' }, () => ({ ok: false, status: 500, json: 'boom' }));
  await assert.rejects(translateBatch(['a'], 'en'), /Fehler 500/);
  setup({}, () => ({ json: {} }));
  await assert.rejects(translateBatch(['a'], 'en'), /Kein Übersetzer/);
});

test('translatorInfo: Sprachen, Erreichbarkeit, none', async () => {
  setup({ TRANSLATE_URL: 'http://tr:5000' }, () => ({ json: [{ code: 'de', targets: ['en', 'pl', 'de'] }, { code: 'en', targets: ['de'] }] }));
  const info = await translatorInfo();
  assert.deepEqual([info.provider, info.configured, info.reachable, info.supported], ['libretranslate', true, true, ['en', 'pl']]);
  setup({ TRANSLATE_URL: 'http://tr:5000' }, () => { throw new Error('down'); });
  assert.equal((await translatorInfo()).reachable, false);
  setup({}, () => ({ json: {} }));
  assert.deepEqual(await translatorInfo(), { provider: 'none', configured: false, reachable: false, supported: null });
});
