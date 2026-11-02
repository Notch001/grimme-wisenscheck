import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, sanitize } from '../src/grading.js';
import { QUESTIONS } from '../src/seed-data.js';
import { correctResponse, wrongResponse } from '../src/seed.js';

const mk = (type, config, id = 1) => ({ id, type, prompt: 'x', config, points: 1 });

test('single / multi', () => {
  const s = mk('single', { options: [{ id: 'a' }, { id: 'b' }], correct: 'b' });
  assert.equal(grade(s, { value: 'b' }), 1);
  assert.equal(grade(s, { value: 'a' }), 0);
  assert.equal(grade(s, null), 0);
  const m = mk('multi', { options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], correct: ['a', 'b'] });
  assert.equal(grade(m, { values: ['a', 'b'] }), 1);
  assert.equal(grade(m, { values: ['a'] }), 0.5);
  assert.equal(grade(m, { values: ['a', 'c'] }), 0);
  assert.equal(grade(m, { values: ['c'] }), 0);
});

test('order, match, number', () => {
  const o = mk('order', { items: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] });
  assert.equal(grade(o, { order: ['1', '2', '3', '4'] }), 1);
  assert.equal(grade(o, { order: ['1', '2', '4', '3'] }), 0.5);
  const m = mk('match', { pairs: { a: 'x', b: 'y' } });
  assert.equal(grade(m, { pairs: { a: 'x', b: 'z' } }), 0.5);
  const n = mk('number', { answer: 5.45, tolerance: 0.05 });
  assert.equal(grade(n, { value: '5,4' }), 1);
  assert.equal(grade(n, { value: '5,3' }), 0);
  assert.equal(grade(n, { value: 'abc' }), 0);
});

test('hotspot und imagelabel', () => {
  const hs = mk('hotspot', { aspect: 0.5, areas: [{ x: 10, y: 10, r: 5 }, { x: 50, y: 50, r: 5 }] });
  assert.equal(grade(hs, { points: [{ x: 11, y: 10 }, { x: 50, y: 52 }] }), 1);
  assert.equal(grade(hs, { points: [{ x: 11, y: 10 }] }), 0.5);
  assert.equal(grade(hs, { points: [{ x: 11, y: 10 }, { x: 90, y: 90 }] }), 0); // Fehlklick wird abgezogen
  const il = mk('imagelabel', { aspect: 0.5, radius: 6, targets: [{ label: 'a', x: 20, y: 20 }, { label: 'b', x: 70, y: 40 }] });
  assert.equal(grade(il, { placements: { a: { x: 22, y: 21 }, b: { x: 10, y: 10 } } }), 0.5);
});

test('manuelle Typen liefern null', () => {
  assert.equal(grade(mk('drawing', {}), { elements: [1] }), null);
  assert.equal(grade(mk('practical', {}), null), null);
});

test('Teilnehmeransicht enthält keine Lösungen', () => {
  const secret = ['correct', 'wrong', 'pairs', 'targets', 'areas', 'accepted', 'answer', 'tolerance', 'criteria'];
  for (const [i, d] of QUESTIONS.entries()) {
    const json = JSON.stringify(sanitize({ id: i + 1, type: d.type, prompt: d.prompt, image: d.image, points: 1, config: d.config }));
    for (const k of secret) assert.ok(!json.includes(`"${k}"`), `${d.type} leakt "${k}"`);
  }
});

test('Beispieldaten: richtige Antwort = 100 %, falsche < 100 %', () => {
  for (const [i, d] of QUESTIONS.entries()) {
    const q = { id: i + 1, type: d.type, prompt: d.prompt, config: d.config, points: 1 };
    const g = grade(q, correctResponse(q));
    if (g === null) continue; // manuell
    assert.equal(g, 1, `Frage ${i + 1} (${d.type}) richtige Antwort nicht 100 %`);
    assert.ok(grade(q, wrongResponse(q)) < 1, `Frage ${i + 1} (${d.type}) falsche Antwort nicht < 100 %`);
  }
});
