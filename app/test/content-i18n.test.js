import test from 'node:test';
import assert from 'node:assert/strict';
import { textsOf, hashOf, applyTranslation, fieldsOf } from '../src/content-i18n.js';
import { sanitize } from '../src/grading.js';
import { enabledLanguages } from '../src/languages.js';

const single = {
  id: 7, type: 'single', prompt: 'Welche Spannung?', topic_name: 'Elektrik', points: 1,
  config: { options: [{ id: 'a', text: 'Zwölf' }, { id: 'b', text: 'Vierundzwanzig' }, { id: 'c', text: 'Sechs' }], correct: 'b' },
};

test('textsOf: nur übersetzbare, nicht-leere Texte', () => {
  assert.deepEqual(textsOf('topic', { id: 1, name: 'Hydraulik' }), { name: 'Hydraulik' });
  assert.deepEqual(textsOf('survey', { title: 'T', description: '' }), { title: 'T' });
  const t = textsOf('question', { ...single, objective: 'Lernziel', config: { ...single.config, note: 'Hinweis' } });
  assert.deepEqual(Object.keys(t), ['prompt', 'note', 'options.a', 'options.b', 'options.c']);
  assert.ok(!JSON.stringify(t).includes('Lernziel'));
  const m = textsOf('question', { id: 2, type: 'match', prompt: 'P', config: { left: [{ id: 'a', text: 'L' }], right: [{ id: 'x', text: 'R' }], pairs: { a: 'x' } } });
  assert.deepEqual(m, { prompt: 'P', 'left.a': 'L', 'right.x': 'R' });
  const d = textsOf('question', { id: 3, type: 'drawing', prompt: 'Zeichne', config: { symbols: ['source'], note: 'N' } });
  assert.deepEqual(d, { prompt: 'Zeichne', note: 'N' });
});

test('fieldsOf: lesbare Bezeichnungen', () => {
  const f = fieldsOf('question', single);
  assert.deepEqual(f.map((x) => x.label), ['Fragetext', 'Antwort a)', 'Antwort b)', 'Antwort c)']);
});

test('hashOf: stabil unabhängig von Schlüsselreihenfolge, ändert sich mit Text', () => {
  assert.equal(hashOf({ a: '1', b: '2' }), hashOf({ b: '2', a: '1' }));
  assert.notEqual(hashOf({ a: '1' }), hashOf({ a: '2' }));
});

test('applyTranslation: Texte überlagert, IDs und Reihenfolge der gemischten Optionen bleiben', () => {
  const s = sanitize(single, 3); // gemischt
  const tr = { prompt: 'Which voltage?', 'options.a': 'Twelve', 'options.b': 'Twenty-four' };
  const out = applyTranslation('question', s, tr);
  assert.equal(out.prompt, 'Which voltage?');
  assert.deepEqual(out.config.options.map((o) => o.id), s.config.options.map((o) => o.id));
  const byId = Object.fromEntries(out.config.options.map((o) => [o.id, o.text]));
  assert.deepEqual(byId, { a: 'Twelve', b: 'Twenty-four', c: 'Sechs' }); // fehlend => deutsch
  assert.equal(s.prompt, 'Welche Spannung?'); // Original unverändert
  assert.ok(!JSON.stringify(out).includes('correct'));
});

test('applyTranslation: Thema, Abfrage, Hinweis, ohne Übersetzung unverändert', () => {
  assert.equal(applyTranslation('topic', { name: 'Elektrik' }, { name: 'Electrics' }).name, 'Electrics');
  const sv = applyTranslation('survey', { title: 'A', description: 'B' }, { title: 'X' });
  assert.deepEqual(sv, { title: 'X', description: 'B' });
  const p = sanitize({ id: 1, type: 'practical', prompt: 'P', config: { note: 'Vor Ort' } });
  assert.equal(applyTranslation('question', p, { note: 'On site' }).config.note, 'On site');
  assert.equal(applyTranslation('question', p, undefined), p);
});

test('enabledLanguages: Katalog, ohne de, Env-Override', () => {
  const old = process.env.ENABLED_LANGS;
  try {
    delete process.env.ENABLED_LANGS;
    const d = enabledLanguages();
    assert.ok(d.some((l) => l.code === 'ar' && l.rtl));
    assert.ok(!d.some((l) => l.code === 'de'));
    process.env.ENABLED_LANGS = 'pl, de, xx, fr, pl';
    assert.deepEqual(enabledLanguages().map((l) => l.code), ['pl', 'fr']);
  } finally { if (old === undefined) delete process.env.ENABLED_LANGS; else process.env.ENABLED_LANGS = old; }
});
