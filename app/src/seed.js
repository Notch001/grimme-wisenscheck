import { q, pool } from './db.js';
import { TOPICS, QUESTIONS } from './seed-data.js';
import { grade } from './grading.js';
import { newToken } from './auth.js';

// ---- erzeugt richtige bzw. falsche Antworten für die Demo-Daten
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function correctResponse(qu) {
  const c = qu.config;
  switch (qu.type) {
    case 'single': return { value: c.correct };
    case 'multi': return { values: [...c.correct] };
    case 'strike': return { struck: [...c.wrong] };
    case 'order': return { order: c.items.map((i) => i.id) };
    case 'match': return { pairs: { ...c.pairs } };
    case 'number': return { value: String(c.answer).replace('.', ',') };
    case 'text': return { value: c.accepted?.[0] || '' };
    case 'imagelabel': return { placements: Object.fromEntries(c.targets.map((t) => [t.label, { x: t.x + 1, y: t.y - 1 }])) };
    case 'hotspot': return { points: c.areas.map((a) => ({ x: a.x, y: a.y })) };
    case 'drawing': return { elements: demoDrawing() };
    default: return null;
  }
}

export function wrongResponse(qu, rnd = Math.random) {
  const c = qu.config;
  switch (qu.type) {
    case 'single': return { value: c.options.find((o) => o.id !== c.correct).id };
    case 'multi': {
      const extra = c.options.find((o) => !c.correct.includes(o.id));
      return { values: extra ? [extra.id, c.correct[0]] : [c.correct[0]] };
    }
    case 'strike': return { struck: [c.options.find((o) => !c.wrong.includes(o.id)).id] };
    case 'order': return { order: [...c.items].reverse().map((i) => i.id) };
    case 'match': {
      const keys = Object.keys(c.pairs); const vals = keys.map((k) => c.pairs[k]);
      return { pairs: Object.fromEntries(keys.map((k, i) => [k, vals[(i + 1) % vals.length]])) };
    }
    case 'number': return { value: String(Number(c.answer) * 2 + 1) };
    case 'text': return { value: 'weiß nicht' };
    case 'imagelabel': return { placements: Object.fromEntries(c.targets.map((t, i) => [t.label, { x: Math.min(95, t.x + 30 + i), y: Math.max(5, t.y - 25) }])) };
    case 'hotspot': return { points: [{ x: 20, y: 80 }, { x: c.areas[0].x, y: c.areas[0].y }] };
    case 'drawing': return { elements: demoDrawing(true) };
    default: return null;
  }
}

function demoDrawing(weak = false) {
  const els = [
    { t: 'sym', k: 'source', x: 140, y: 200, r: 90 },
    { t: 'sym', k: 'resistor', x: 300, y: 100, r: 0 },
    { t: 'sym', k: 'resistor', x: 480, y: 100, r: 0 },
    { t: 'sym', k: 'resistor', x: 640, y: 200, r: 90 },
    { t: 'line', pts: [[140, 160], [140, 100], [260, 100]] },
    { t: 'line', pts: [[340, 100], [440, 100]] },
    { t: 'line', pts: [[520, 100], [640, 100], [640, 160]] },
    { t: 'line', pts: [[640, 240], [640, 320], [140, 320], [140, 240]] },
  ];
  return weak ? els.slice(0, 5) : els;
}

// Standard-Fähigkeiten je Themenbereich für simulierte Demo-Teilnehmer
const PROFILES = [
  { name: 'Anna Beispiel',  email: 'anna@example.com',  skill: [0.95, 0.8, 0.5, 0.9, 0.7, 0.9, 0.8, 0.9], manual: 0.85 },
  { name: 'Ben Muster',     email: 'ben@example.com',   skill: [0.4, 0.55, 0.3, 0.45, 0.5, 0.6, 0.4, 0.3], manual: 0.4 },
  { name: 'Chris Probe',    email: 'chris@example.com', skill: [0.8, 0.35, 0.85, 0.3, 0.9, 0.5, 0.9, 0.8], manual: null },
];

export async function seedIfEmpty() {
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM topics');
  if (rows[0].n > 0) return;
  console.log('Lege Beispieldaten an …');
  try {
    await seed();
  } catch (err) {
    // keine halbfertigen Daten zurücklassen
    await q('TRUNCATE answers, participants, survey_questions, surveys, questions, topics RESTART IDENTITY CASCADE');
    throw err;
  }
}

async function seed() {
  const tid = {};
  for (const [i, name] of TOPICS.entries()) {
    tid[name] = (await q('INSERT INTO topics (name, sort) VALUES ($1,$2) RETURNING id', [name, i + 1])).rows[0].id;
  }
  const qs = [];
  for (const d of QUESTIONS) {
    const r = await q(
      'INSERT INTO questions (topic_id,type,prompt,objective,points,image,config) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [tid[d.topic], d.type, d.prompt, d.objective || '', d.points || 1, d.image || null, d.config],
    );
    qs.push({ ...r.rows[0], topic_name: d.topic });
  }

  if (process.env.SEED_DEMO === 'false') return;

  const survey = (await q(
    `INSERT INTO surveys (title, description, status) VALUES ($1,$2,'open') RETURNING *`,
    ['Wissenscheck Neueinsteiger (Demo)', 'Grundlegende Kenntnisse in Theorie und Praxis, um einen definierten Kenntnisstand zu ermitteln.'],
  )).rows[0];
  for (const [i, qu] of qs.entries()) await q('INSERT INTO survey_questions VALUES ($1,$2,$3)', [survey.id, qu.id, i]);

  const topicIndex = (qu) => TOPICS.indexOf(qu.topic_name);
  for (const [pi, prof] of PROFILES.entries()) {
    const p = (await q(
      `INSERT INTO participants (survey_id,name,email,token,status,started_at,submitted_at) VALUES ($1,$2,$3,$4,'submitted',now()-interval '2 hours',now()-interval '1 hour') RETURNING id`,
      [survey.id, prof.name, prof.email, newToken()],
    )).rows[0];
    const rnd = lcg(42 + pi);
    for (const qu of qs) {
      if (qu.type === 'practical') {
        if (prof.manual !== null) await q('INSERT INTO answers (participant_id,question_id,manual_score,comment) VALUES ($1,$2,$3,$4)', [p.id, qu.id, Math.min(1, Math.max(0, prof.manual + (rnd() - 0.5) * 0.3)), '']);
        continue;
      }
      const good = rnd() < prof.skill[topicIndex(qu)];
      const resp = good ? correctResponse(qu) : wrongResponse(qu, rnd);
      const manual = qu.type === 'drawing' && prof.manual !== null ? (good ? 1 : 0.4) : null;
      await q('INSERT INTO answers (participant_id,question_id,response,auto_score,manual_score) VALUES ($1,$2,$3,$4,$5)', [p.id, qu.id, resp, grade(qu, resp), manual]);
    }
  }
  // ein noch offener Teilnehmer mit festem Token zum direkten Ausprobieren
  await q(`INSERT INTO participants (survey_id,name,email,token) VALUES ($1,'Test Teilnehmer','test@example.com','demo-test')`, [survey.id]);
  console.log('Demo-Teilnehmer-Link: /t/demo-test');
}

export { pool };
