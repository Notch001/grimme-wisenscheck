import express from 'express';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, initDb, pool } from './db.js';
import { grade, sanitize, validateQuestion, TYPES } from './grading.js';
import { evaluate, surveyQuestions, participantAnswers } from './results.js';
import { login, issueCookie, clearCookie, currentUser, requireAdmin, newToken, ensureAdminUser, hashPassword } from './auth.js';
import { seedIfEmpty } from './seed.js';
import { SOURCE, enabledLanguages, isEnabled, langInfo } from './languages.js';
import { readDict, fieldsOf, textsOf, hashOf, applyTranslation } from './content-i18n.js';
import { translateDetailed, translatorInfo, isConfigured } from './translate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const UPLOADS = process.env.UPLOAD_DIR || path.join(here, '..', 'data', 'uploads');
mkdirSync(UPLOADS, { recursive: true });

export const app = express();
// Betrieb unter Unterpfad (z. B. https://host/wissen): BASE_PATH=/wissen. Funktioniert mit und ohne Prefix-Entfernung im Reverse-Proxy.
export const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '').replace(/^(?!\/)(?=.)/, '/');
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Basispfad: aus BASE_PATH oder – falls der Proxy den Prefix entfernt – aus dem Header X-Forwarded-Prefix (Traefik/Coolify setzen ihn)
const baseFor = (req) => {
  if (BASE) return BASE;
  const h = String(req.headers['x-forwarded-prefix'] || '').trim().replace(/\/+$/, '');
  return /^\/[\w./-]*$/.test(h) && !h.includes('..') ? h : '';
};
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// ---------------------------------------------------------------- Login
app.post('/api/login', wrap(async (req, res) => {
  const u = await login(req.body?.username, req.body?.password);
  if (!u) return bad(res, 'Benutzername oder Passwort falsch', 401);
  issueCookie(res, u.id, baseFor(req));
  res.json({ ok: true });
}));
app.post('/api/logout', (req, res) => { clearCookie(res, baseFor(req)); res.json({ ok: true }); });
app.get('/api/me', wrap(async (req, res) => { const u = await currentUser(req); res.json({ admin: !!u, user: u }); }));

// ---------------------------------------------------------------- Admin: Benutzer
app.get('/api/users', requireAdmin, wrap(async (req, res) => {
  res.json((await q('SELECT id, username, created_at FROM users ORDER BY username')).rows);
}));
app.post('/api/users', requireAdmin, wrap(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[\w.@-]{2,40}$/.test(username)) return bad(res, 'Benutzername: 2–40 Zeichen (Buchstaben, Ziffern, . _ - @)');
  if (password.length < 6) return bad(res, 'Passwort: mindestens 6 Zeichen');
  try {
    const { rows } = await q('INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING id, username', [username, hashPassword(password)]);
    res.json(rows[0]);
  } catch (e) { if (e.code === '23505') return bad(res, 'Benutzername existiert bereits', 409); throw e; }
}));
app.put('/api/users/:id/password', requireAdmin, wrap(async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 6) return bad(res, 'Passwort: mindestens 6 Zeichen');
  await q('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(password), req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/users/:id', requireAdmin, wrap(async (req, res) => {
  const me = await currentUser(req);
  if (me.id === Number(req.params.id)) return bad(res, 'Du kannst dich nicht selbst löschen', 409);
  await q('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Teilnehmer-API (Zugang per Token)
async function loadParticipant(req, res) {
  const { rows } = await q(
    `SELECT p.*, s.title, s.description, s.status AS survey_status, s.time_limit_min, s.show_results FROM participants p JOIN surveys s ON s.id = p.survey_id WHERE p.token = $1`,
    [req.params.token],
  );
  if (!rows[0]) { bad(res, 'Link ungültig', 404); return null; }
  return rows[0];
}

const deadlineOf = (p) => (p.time_limit_min && p.started_at ? new Date(new Date(p.started_at).getTime() + p.time_limit_min * 60000) : null);

// Abgelaufene Zeit => automatisch abgeben (Antworten bleiben erhalten)
async function expireIfNeeded(p) {
  const d = deadlineOf(p);
  if (p.status === 'started' && d && Date.now() > d.getTime() + 5000) {
    await q(`UPDATE participants SET status='submitted', submitted_at=$2 WHERE id=$1`, [p.id, d]);
    p.status = 'submitted';
  }
}

// Gewünschte Sprache: nur aktivierte Sprachen, sonst Deutsch
const pickLang = (v) => { const c = String(v || '').trim().toLowerCase(); return c && isEnabled(c) ? c : SOURCE; };

// Übersetzungen einer Sprache: Map "kind:ref_id" -> data
async function translationMap(lang, { surveyId, topicIds = [], questionIds = [] }) {
  const { rows } = await q(
    `SELECT kind, ref_id, data FROM translations WHERE lang=$1 AND (
       (kind='survey' AND ref_id=$2) OR (kind='topic' AND ref_id = ANY($3::int[])) OR (kind='question' AND ref_id = ANY($4::int[])))`,
    [lang, surveyId, topicIds, questionIds],
  );
  return new Map(rows.map((r) => [`${r.kind}:${r.ref_id}`, r.data]));
}

app.get('/api/p/:token', wrap(async (req, res) => {
  const p = await loadParticipant(req, res); if (!p) return;
  await expireIfNeeded(p);
  const lang = pickLang(req.query.lang);
  if (p.status === 'submitted') {
    let tr = new Map();
    if (lang !== SOURCE) tr = await translationMap(lang, { surveyId: p.survey_id, topicIds: (await q('SELECT id FROM topics')).rows.map((r) => r.id) });
    const out = { participant: { name: p.name, status: p.status }, survey: applyTranslation('survey', { title: p.title }, tr.get(`survey:${p.survey_id}`)), lang };
    if (p.show_results) {
      const survey = (await q('SELECT * FROM surveys WHERE id=$1', [p.survey_id])).rows[0];
      const ev = evaluate(await surveyQuestions(p.survey_id), await participantAnswers(p.id), survey);
      out.results = {
        pct: ev.pct, level: ev.level, pending: ev.pendingCount,
        topics: ev.topics.map(({ id, name, pct, level }) => ({ name: applyTranslation('topic', { name }, tr.get(`topic:${id}`)).name, pct, level })),
      };
    }
    return res.json(out);
  }
  if (p.survey_status !== 'open') {
    const tr = lang !== SOURCE ? await translationMap(lang, { surveyId: p.survey_id }) : new Map();
    return res.json({ participant: { name: p.name, status: 'closed' }, survey: applyTranslation('survey', { title: p.title }, tr.get(`survey:${p.survey_id}`)), lang });
  }
  if (p.status === 'invited') {
    p.started_at = (await q(`UPDATE participants SET status='started', started_at=now() WHERE id=$1 RETURNING started_at`, [p.id])).rows[0].started_at;
  }
  const rawQuestions = await surveyQuestions(p.survey_id);
  let questions = rawQuestions.map((x) => sanitize(x, p.id)); // Mischen passiert hier, vor dem Überlagern der Texte
  let survey = { title: p.title, description: p.description };
  if (lang !== SOURCE) {
    const tr = await translationMap(lang, {
      surveyId: p.survey_id, topicIds: [...new Set(rawQuestions.map((x) => x.topic_id).filter(Boolean))], questionIds: rawQuestions.map((x) => x.id),
    });
    questions = questions.map((o, i) => {
      const out = applyTranslation('question', o, tr.get(`question:${o.id}`));
      const tid = rawQuestions[i].topic_id;
      if (out.topic && tid) out.topic = applyTranslation('topic', { name: out.topic }, tr.get(`topic:${tid}`)).name;
      return out;
    });
    survey = applyTranslation('survey', survey, tr.get(`survey:${p.survey_id}`));
  }
  const answers = {};
  for (const a of await participantAnswers(p.id)) answers[a.question_id] = a.response;
  res.json({
    participant: { name: p.name, status: 'started' },
    survey,
    lang,
    deadline: deadlineOf(p),
    now: new Date(),
    questions,
    answers,
  });
}));

app.put('/api/p/:token/answers/:qid', wrap(async (req, res) => {
  const p = await loadParticipant(req, res); if (!p) return;
  await expireIfNeeded(p);
  if (p.status === 'submitted' || p.survey_status !== 'open') return bad(res, 'Abfrage ist abgeschlossen (oder Zeit abgelaufen)', 409);
  const qid = Number(req.params.qid);
  const { rows } = await q(
    `SELECT qu.* FROM survey_questions sq JOIN questions qu ON qu.id=sq.question_id WHERE sq.survey_id=$1 AND qu.id=$2`,
    [p.survey_id, qid],
  );
  if (!rows[0]) return bad(res, 'Frage nicht Teil dieser Abfrage', 404);
  let response = req.body?.response ?? null;
  // Kurztext in anderer Sprache: Sprache mitspeichern (grade() => manuelle Bewertung); Fremdangaben von lang werden verworfen
  if (rows[0].type === 'text' && response && typeof response === 'object' && !Array.isArray(response)) {
    const { lang: _ignored, ...rest } = response; // eslint-disable-line no-unused-vars
    const lang = pickLang(req.body?.lang);
    response = lang !== SOURCE ? { ...rest, lang } : rest;
  }
  await q(
    `INSERT INTO answers (participant_id, question_id, response, auto_score) VALUES ($1,$2,$3,$4)
     ON CONFLICT (participant_id, question_id) DO UPDATE SET response=EXCLUDED.response, auto_score=EXCLUDED.auto_score, updated_at=now()`,
    [p.id, qid, response, grade(rows[0], response)],
  );
  res.json({ ok: true });
}));

app.post('/api/p/:token/submit', wrap(async (req, res) => {
  const p = await loadParticipant(req, res); if (!p) return;
  if (p.survey_status !== 'open') return bad(res, 'Abfrage ist abgeschlossen', 409);
  await q(`UPDATE participants SET status='submitted', submitted_at=now() WHERE id=$1 AND status<>'submitted'`, [p.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Medien
app.use('/media', express.static(path.join(PUBLIC, 'media'), { maxAge: '1h' }));
app.use('/uploads', express.static(UPLOADS, { maxAge: '1h' }));

const IMG = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
app.post('/api/media', requireAdmin, express.raw({ type: Object.keys(IMG), limit: '10mb' }), (req, res) => {
  const ext = IMG[req.headers['content-type']];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Nur PNG, JPG, WEBP oder GIF erlaubt');
  const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
  writeFileSync(path.join(UPLOADS, name), req.body);
  res.json({ url: `/uploads/${name}` });
});

app.get('/api/media', requireAdmin, (req, res) => {
  const list = (dir, prefix) => { try { return readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).map((f) => `${prefix}/${f}`); } catch { return []; } };
  res.json([...list(path.join(PUBLIC, 'media'), '/media'), ...list(UPLOADS, '/uploads')]);
});

// ---------------------------------------------------------------- Admin: Themen & Fragen
app.get('/api/meta', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM topics ORDER BY sort, name');
  res.json({ topics: rows, types: TYPES });
}));
app.post('/api/topics', requireAdmin, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return bad(res, 'Name fehlt');
  const { rows } = await q(
    `INSERT INTO topics (name, sort) VALUES ($1, COALESCE((SELECT MAX(sort)+1 FROM topics),1)) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING *`,
    [name],
  );
  res.json(rows[0]);
}));

app.get('/api/questions', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q(
    `SELECT qu.*, t.name AS topic_name,
            (SELECT COUNT(*) FROM survey_questions sq WHERE sq.question_id=qu.id)::int AS used_in
       FROM questions qu LEFT JOIN topics t ON t.id=qu.topic_id ORDER BY t.sort NULLS LAST, qu.id`,
  );
  res.json(rows);
}));

function questionInput(req, res) {
  const b = req.body || {};
  const type = b.type;
  const prompt = String(b.prompt || '').trim();
  if (!prompt) { bad(res, 'Fragetext fehlt'); return null; }
  const err = validateQuestion(type, b.config);
  if (err) { bad(res, err); return null; }
  return [b.topic_id || null, type, prompt, String(b.objective || ''), Number(b.points) > 0 ? Number(b.points) : 1, b.image || null, b.config || {}];
}

app.post('/api/questions', requireAdmin, wrap(async (req, res) => {
  const v = questionInput(req, res); if (!v) return;
  const { rows } = await q(`INSERT INTO questions (topic_id,type,prompt,objective,points,image,config) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, v);
  res.json(rows[0]);
}));

app.put('/api/questions/:id', requireAdmin, wrap(async (req, res) => {
  const v = questionInput(req, res); if (!v) return;
  const { rows } = await q(
    `UPDATE questions SET topic_id=$1,type=$2,prompt=$3,objective=$4,points=$5,image=$6,config=$7 WHERE id=$8 RETURNING *`,
    [...v, req.params.id],
  );
  if (!rows[0]) return bad(res, 'Nicht gefunden', 404);
  // Automatische Punkte aller bereits abgegebenen Antworten neu berechnen
  const { rows: ans } = await q('SELECT participant_id, response FROM answers WHERE question_id=$1', [rows[0].id]);
  for (const a of ans) await q('UPDATE answers SET auto_score=$1 WHERE participant_id=$2 AND question_id=$3', [grade(rows[0], a.response), a.participant_id, rows[0].id]);
  res.json(rows[0]);
}));

app.delete('/api/questions/:id', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q('SELECT 1 FROM survey_questions WHERE question_id=$1 LIMIT 1', [req.params.id]);
  if (rows.length) return bad(res, 'Frage wird in einer Abfrage verwendet und kann nicht gelöscht werden', 409);
  await q('DELETE FROM questions WHERE id=$1', [req.params.id]);
  await q(`DELETE FROM translations WHERE kind='question' AND ref_id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Admin: Abfragen
app.get('/api/surveys', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q(
    `SELECT s.*,
       (SELECT COUNT(*) FROM survey_questions WHERE survey_id=s.id)::int AS question_count,
       (SELECT COUNT(*) FROM participants WHERE survey_id=s.id)::int AS participant_count,
       (SELECT COUNT(*) FROM participants WHERE survey_id=s.id AND status='submitted')::int AS submitted_count
     FROM surveys s ORDER BY s.id DESC`,
  );
  res.json(rows);
}));

app.post('/api/surveys', requireAdmin, wrap(async (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return bad(res, 'Titel fehlt');
  const { rows } = await q('INSERT INTO surveys (title, description) VALUES ($1,$2) RETURNING *', [title, String(req.body?.description || '')]);
  res.json(rows[0]);
}));

app.get('/api/surveys/:id', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM surveys WHERE id=$1', [req.params.id]);
  if (!rows[0]) return bad(res, 'Nicht gefunden', 404);
  const questions = await surveyQuestions(rows[0].id);
  const { rows: participants } = await q(
    `SELECT p.id,p.name,p.email,p.token,p.status,p.started_at,p.submitted_at,
            (SELECT COUNT(*) FROM answers a WHERE a.participant_id=p.id AND a.response IS NOT NULL)::int AS answered
       FROM participants p WHERE survey_id=$1 ORDER BY p.name`,
    [rows[0].id],
  );
  res.json({ ...rows[0], questions: questions.map((x) => ({ id: x.id, prompt: x.prompt, type: x.type, topic_name: x.topic_name })), participants });
}));

app.put('/api/surveys/:id', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = (await client.query('SELECT * FROM surveys WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!cur) { await client.query('ROLLBACK'); return bad(res, 'Nicht gefunden', 404); }
    const status = ['draft', 'open', 'closed'].includes(b.status) ? b.status : cur.status;
    const low = Math.round(Number(b.threshold_low ?? cur.threshold_low)), high = Math.round(Number(b.threshold_high ?? cur.threshold_high));
    if (!(low >= 0 && high <= 100 && low < high)) { await client.query('ROLLBACK'); return bad(res, 'Schwellenwerte: 0 ≤ unten < oben ≤ 100'); }
    await client.query(
      `UPDATE surveys SET title=$1, description=$2, status=$3, threshold_low=$4, threshold_high=$5, time_limit_min=$6, show_results=$7 WHERE id=$8`,
      [b.title?.trim() || cur.title, b.description ?? cur.description, status, low, high,
        'time_limit_min' in b ? (Number(b.time_limit_min) > 0 ? Math.round(Number(b.time_limit_min)) : null) : cur.time_limit_min,
        'show_results' in b ? !!b.show_results : cur.show_results, cur.id],
    );
    if (Array.isArray(b.question_ids)) {
      if (cur.status !== 'draft') { await client.query('ROLLBACK'); return bad(res, 'Fragen können nur im Entwurf geändert werden', 409); }
      await client.query('DELETE FROM survey_questions WHERE survey_id=$1', [cur.id]);
      for (const [i, qid] of b.question_ids.entries()) {
        await client.query('INSERT INTO survey_questions (survey_id, question_id, position) VALUES ($1,$2,$3)', [cur.id, qid, i]);
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}));

app.delete('/api/surveys/:id', requireAdmin, wrap(async (req, res) => {
  await q('DELETE FROM surveys WHERE id=$1', [req.params.id]);
  await q(`DELETE FROM translations WHERE kind='survey' AND ref_id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/surveys/:id/participants', requireAdmin, wrap(async (req, res) => {
  const list = Array.isArray(req.body?.list) ? req.body.list : [];
  const added = [];
  for (const p of list) {
    const name = String(p.name || '').trim();
    if (!name) continue;
    const { rows } = await q('INSERT INTO participants (survey_id,name,email,token) VALUES ($1,$2,$3,$4) RETURNING id,name,token', [req.params.id, name, String(p.email || '').trim(), newToken()]);
    added.push(rows[0]);
  }
  res.json({ added });
}));

app.delete('/api/participants/:id', requireAdmin, wrap(async (req, res) => {
  await q('DELETE FROM participants WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/participants/:id/reopen', requireAdmin, wrap(async (req, res) => {
  await q(`UPDATE participants SET status='started', submitted_at=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Admin: Auswertung
app.get('/api/surveys/:id/results', requireAdmin, wrap(async (req, res) => {
  const survey = (await q('SELECT * FROM surveys WHERE id=$1', [req.params.id])).rows[0];
  if (!survey) return bad(res, 'Nicht gefunden', 404);
  const questions = await surveyQuestions(survey.id);
  const { rows: participants } = await q('SELECT id,name,email,status,submitted_at FROM participants WHERE survey_id=$1 ORDER BY name', [survey.id]);
  const { rows: allAnswers } = await q('SELECT a.* FROM answers a JOIN participants p ON p.id=a.participant_id WHERE p.survey_id=$1', [survey.id]);
  const out = participants.map((p) => {
    const ev = evaluate(questions, allAnswers.filter((a) => a.participant_id === p.id), survey);
    const done = p.status === 'submitted'; // Zwischenstände nicht als Ergebnis ausweisen
    return {
      ...p, pct: done ? ev.pct : null, level: done ? ev.level : 'pending', pendingCount: done ? ev.pendingCount : 0,
      topics: ev.topics.map(({ id, name, pct, level }) => ({ id, name, pct: done ? pct : null, level: done ? level : 'pending' })),
    };
  });
  // Gruppendurchschnitt je Thema (nur abgegebene Teilnehmer)
  const submitted = out.filter((p) => p.status === 'submitted');
  const topicNames = [...new Map(questions.map((x) => [x.topic_id || 0, { id: x.topic_id || 0, name: x.topic_name || 'Ohne Themenbereich', sort: x.topic_sort ?? 999 }])).values()].sort((a, b) => a.sort - b.sort);
  const avg = topicNames.map((t) => {
    const vals = submitted.map((p) => p.topics.find((x) => x.id === t.id)?.pct).filter((v) => v !== null && v !== undefined);
    return { id: t.id, name: t.name, pct: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
  });
  res.json({
    survey: { id: survey.id, title: survey.title, status: survey.status, threshold_low: survey.threshold_low, threshold_high: survey.threshold_high },
    topics: topicNames, participants: out, average: avg,
    complete: out.length > 0 && out.every((p) => p.status === 'submitted'),
    submitted: submitted.length,
  });
}));

app.get('/api/participants/:id/result', requireAdmin, wrap(async (req, res) => {
  const p = (await q('SELECT p.*, s.title AS survey_title FROM participants p JOIN surveys s ON s.id=p.survey_id WHERE p.id=$1', [req.params.id])).rows[0];
  if (!p) return bad(res, 'Nicht gefunden', 404);
  const survey = (await q('SELECT * FROM surveys WHERE id=$1', [p.survey_id])).rows[0];
  const questions = await surveyQuestions(p.survey_id);
  const ev = evaluate(questions, await participantAnswers(p.id), survey);
  const items = ev.items.map((it) => {
    const qu = questions.find((x) => x.id === it.question_id);
    return { ...it, question: { id: qu.id, type: qu.type, prompt: qu.prompt, image: qu.image, points: qu.points, config: qu.config } };
  });
  res.json({
    participant: { id: p.id, name: p.name, email: p.email, status: p.status, submitted_at: p.submitted_at, survey_id: p.survey_id },
    survey: { id: survey.id, title: survey.title, threshold_low: survey.threshold_low, threshold_high: survey.threshold_high },
    ...ev, items,
  });
}));

app.put('/api/participants/:pid/answers/:qid/grade', requireAdmin, wrap(async (req, res) => {
  const raw = req.body?.score;
  const score = raw === null || raw === '' ? null : Math.max(0, Math.min(1, Number(raw)));
  if (score !== null && Number.isNaN(score)) return bad(res, 'Ungültige Punktzahl');
  await q(
    `INSERT INTO answers (participant_id, question_id, manual_score, comment) VALUES ($1,$2,$3,$4)
     ON CONFLICT (participant_id, question_id) DO UPDATE SET manual_score=EXCLUDED.manual_score, comment=EXCLUDED.comment, updated_at=now()`,
    [req.params.pid, req.params.qid, score, String(req.body?.comment || '')],
  );
  res.json({ ok: true });
}));

app.get('/api/surveys/:id/export.csv', requireAdmin, wrap(async (req, res) => {
  const survey = (await q('SELECT * FROM surveys WHERE id=$1', [req.params.id])).rows[0];
  if (!survey) return bad(res, 'Nicht gefunden', 404);
  const questions = await surveyQuestions(survey.id);
  const { rows: ps } = await q('SELECT * FROM participants WHERE survey_id=$1 ORDER BY name', [survey.id]);
  const { rows: allAnswers } = await q('SELECT a.* FROM answers a JOIN participants p ON p.id=a.participant_id WHERE p.survey_id=$1', [survey.id]);
  const evs = ps.map((p) => ({ p, ev: evaluate(questions, allAnswers.filter((a) => a.participant_id === p.id), survey) }));
  const topicNames = evs[0]?.ev.topics.map((t) => t.name) || [];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Name', 'E-Mail', 'Status', 'Gesamt %', ...topicNames.map((n) => `${n} %`)].map(esc).join(';')];
  for (const { p, ev } of evs) lines.push([p.name, p.email, p.status, ev.pct ?? '', ...ev.topics.map((t) => t.pct ?? '')].map(esc).join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="auswertung-${survey.id}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
}));

// ---------------------------------------------------------------- Komfort: Duplizieren
app.post('/api/surveys/:id/duplicate', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q(
    `INSERT INTO surveys (title, description, threshold_low, threshold_high, time_limit_min, show_results)
     SELECT title || ' (Kopie)', description, threshold_low, threshold_high, time_limit_min, show_results FROM surveys WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!rows[0]) return bad(res, 'Nicht gefunden', 404);
  await q('INSERT INTO survey_questions SELECT $1, question_id, position FROM survey_questions WHERE survey_id=$2', [rows[0].id, req.params.id]);
  res.json({ id: rows[0].id });
}));

app.post('/api/questions/:id/duplicate', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q(
    `INSERT INTO questions (topic_id,type,prompt,objective,points,image,config)
     SELECT topic_id,type,prompt || ' (Kopie)',objective,points,image,config FROM questions WHERE id=$1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return bad(res, 'Nicht gefunden', 404);
  res.json(rows[0]);
}));

// ---------------------------------------------------------------- Komfort: Fragen exportieren / importieren (inkl. Bilder)
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
function imageToData(url) {
  const m = /^\/(media|uploads)\/([\w.-]+)$/.exec(url || '');
  if (!m) return null;
  try {
    const file = path.join(m[1] === 'media' ? path.join(PUBLIC, 'media') : UPLOADS, m[2]);
    const ext = m[2].split('.').pop().toLowerCase();
    return MIME[ext] ? `data:${MIME[ext]};base64,${readFileSync(file).toString('base64')}` : null;
  } catch { return null; }
}
app.get('/api/questions-export', requireAdmin, wrap(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
  const { rows } = await q(
    `SELECT qu.*, t.name AS topic_name FROM questions qu LEFT JOIN topics t ON t.id=qu.topic_id
      WHERE ($1::int[] IS NULL OR qu.id = ANY($1)) ORDER BY qu.id`, [ids.length ? ids : null]);
  const questions = rows.map((r) => ({ topic: r.topic_name, type: r.type, prompt: r.prompt, objective: r.objective, points: r.points,
    image: r.image, imageData: imageToData(r.image), config: r.config }));
  res.setHeader('Content-Disposition', 'attachment; filename="fragen-export.json"');
  res.json({ format: 'wissenscheck-fragen', version: 1, questions });
}));
app.post('/api/questions-import', requireAdmin, express.json({ limit: '60mb' }), wrap(async (req, res) => {
  const b = req.body;
  if (b?.format !== 'wissenscheck-fragen' || !Array.isArray(b.questions)) return bad(res, 'Keine gültige Fragen-Exportdatei');
  let n = 0;
  for (const d of b.questions) {
    const err = validateQuestion(d.type, d.config) || (!d.prompt ? 'Fragetext fehlt' : null);
    if (err) return bad(res, `Frage „${String(d.prompt).slice(0, 40)}“: ${err}`);
  }
  for (const d of b.questions) {
    let topicId = null;
    if (d.topic) {
      topicId = (await q(`INSERT INTO topics (name, sort) VALUES ($1, COALESCE((SELECT MAX(sort)+1 FROM topics),1)) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [String(d.topic)])).rows[0].id;
    }
    let image = d.image || null;
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(d.imageData || '');
    if (m) {
      const ext = IMG[m[1]];
      const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
      writeFileSync(path.join(UPLOADS, name), Buffer.from(m[2], 'base64'));
      image = `/uploads/${name}`;
    } else if (image && !/^\/(media|uploads)\//.test(image)) image = null;
    await q('INSERT INTO questions (topic_id,type,prompt,objective,points,image,config) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [topicId, d.type, String(d.prompt), String(d.objective || ''), Number(d.points) > 0 ? Number(d.points) : 1, image, d.config || {}]);
    n++;
  }
  res.json({ imported: n });
}));

// ---------------------------------------------------------------- Auswertung über mehrere Abfragen (Verlauf, Vorher/Nachher)
const personKey = (p) => (p.email || '').trim().toLowerCase() || (p.name || '').trim().toLowerCase();

// Abgegebene Teilnahmen einer Abfrage inkl. Auswertung
async function evaluatedParticipations(survey) {
  const questions = await surveyQuestions(survey.id);
  const { rows: ps } = await q(`SELECT * FROM participants WHERE survey_id=$1 AND status='submitted' ORDER BY name`, [survey.id]);
  const { rows: all } = await q('SELECT a.* FROM answers a JOIN participants p ON p.id=a.participant_id WHERE p.survey_id=$1', [survey.id]);
  return ps.map((p) => ({ p, key: personKey(p), ev: evaluate(questions, all.filter((a) => a.participant_id === p.id), survey) }));
}
const slim = (ev) => ({ pct: ev.pct, pending: ev.pendingCount, topics: ev.topics.map((t) => ({ name: t.name, pct: t.pct })) });

app.get('/api/people', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q(`SELECT id, name, email, submitted_at, survey_id FROM participants WHERE status='submitted' ORDER BY submitted_at`);
  const map = new Map();
  for (const r of rows) {
    const k = personKey(r);
    const e = map.get(k) || { key: k, name: r.name, email: r.email, count: 0, last: null };
    e.count++; e.name = r.name; e.last = r.submitted_at; map.set(k, e);
  }
  res.json([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
}));

app.get('/api/people/history', requireAdmin, wrap(async (req, res) => {
  const key = String(req.query.key || '').toLowerCase();
  const { rows: surveys } = await q(`SELECT DISTINCT s.* FROM surveys s JOIN participants p ON p.survey_id=s.id WHERE p.status='submitted'`);
  const out = [];
  for (const s of surveys) {
    for (const x of await evaluatedParticipations(s)) {
      if (x.key === key) out.push({ participant_id: x.p.id, name: x.p.name, survey_id: s.id, survey: s.title, submitted_at: x.p.submitted_at, ...slim(x.ev) });
    }
  }
  out.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
  res.json({ key, name: out.at(-1)?.name || key, history: out });
}));

app.get('/api/compare', requireAdmin, wrap(async (req, res) => {
  const [sa, sb] = await Promise.all([req.query.a, req.query.b].map(async (id) => (await q('SELECT * FROM surveys WHERE id=$1', [id])).rows[0]));
  if (!sa || !sb) return bad(res, 'Abfrage nicht gefunden', 404);
  const [A, B] = await Promise.all([evaluatedParticipations(sa), evaluatedParticipations(sb)]);
  const topics = [...new Set([...A, ...B].flatMap((x) => x.ev.topics.map((t) => t.name)))];
  const people = [];
  for (const a of A) {
    const b = B.find((y) => y.key === a.key);
    if (!b) continue;
    const pct = (ev, n) => ev.topics.find((t) => t.name === n)?.pct ?? null;
    people.push({ name: b.p.name, participant_a: a.p.id, participant_b: b.p.id, a: a.ev.pct, b: b.ev.pct,
      topics: topics.map((n) => ({ name: n, a: pct(a.ev, n), b: pct(b.ev, n) })) });
  }
  const avg = (vals) => { const v = vals.filter((x) => x !== null && x !== undefined); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
  res.json({
    a: { id: sa.id, title: sa.title }, b: { id: sb.id, title: sb.title }, topics, people,
    average: { a: avg(people.map((p) => p.a)), b: avg(people.map((p) => p.b)),
      topics: topics.map((n, i) => ({ name: n, a: avg(people.map((p) => p.topics[i].a)), b: avg(people.map((p) => p.topics[i].b)) })) },
    unmatched: { a: A.length - people.length, b: B.length - people.length },
  });
}));

// ---------------------------------------------------------------- Weiterbildungsplan
app.get('/api/participants/:id/plan', requireAdmin, wrap(async (req, res) => {
  const { rows } = await q('SELECT items, notes, updated_at, updated_by FROM plans WHERE participant_id=$1', [req.params.id]);
  res.json(rows[0] || null);
}));
app.put('/api/participants/:id/plan', requireAdmin, wrap(async (req, res) => {
  const me = await currentUser(req);
  const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 100).map((i) => ({
    topic: String(i.topic || '').slice(0, 200), measure: String(i.measure || '').slice(0, 1000), responsible: String(i.responsible || '').slice(0, 200),
    due: /^\d{4}-\d{2}-\d{2}$/.test(i.due || '') ? i.due : '', status: ['open', 'planned', 'done'].includes(i.status) ? i.status : 'open',
  }));
  await q(`INSERT INTO plans (participant_id, items, notes, updated_by) VALUES ($1,$2,$3,$4)
           ON CONFLICT (participant_id) DO UPDATE SET items=EXCLUDED.items, notes=EXCLUDED.notes, updated_at=now(), updated_by=EXCLUDED.updated_by`,
    [req.params.id, JSON.stringify(items), String(req.body?.notes || '').slice(0, 5000), me.username]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Sprachen (öffentlich)
app.get('/api/languages', wrap(async (req, res) => {
  const { rows } = await q(`SELECT DISTINCT lang FROM translations WHERE kind='ui' AND data <> '{}'::jsonb`);
  const have = new Set(rows.map((r) => r.lang));
  if (Object.keys(readDict('en')).length) have.add('en');
  const languages = [{ code: SOURCE, name: 'Deutsch', rtl: false }, ...enabledLanguages().filter((l) => have.has(l.code))];
  res.json({ source: SOURCE, languages });
}));

app.get('/api/i18n/:lang', wrap(async (req, res) => {
  const lang = req.params.lang;
  const info = lang === SOURCE ? { code: SOURCE, rtl: false } : isEnabled(lang) ? langInfo(lang) : null;
  if (!info) return bad(res, 'Sprache unbekannt', 404);
  let dict = readDict(SOURCE);
  if (lang !== SOURCE) {
    if (lang === 'en') dict = { ...dict, ...readDict('en') };
    const row = (await q(`SELECT data FROM translations WHERE kind='ui' AND ref_id=0 AND lang=$1`, [lang])).rows[0];
    dict = { ...dict, ...Object.fromEntries(Object.entries(row?.data || {}).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) };
  }
  res.json({ lang, rtl: !!info.rtl, dict });
}));

// ---------------------------------------------------------------- Admin: Übersetzungen
const KINDS = ['ui', 'topic', 'survey', 'question'];

// Alle übersetzbaren Einheiten mit deutschen Texten und Hash
async function loadEntities() {
  const ents = [];
  const push = (kind, row, extra = {}) => {
    const texts = textsOf(kind, row);
    if (Object.keys(texts).length) ents.push({ kind, ref_id: kind === 'ui' ? 0 : row.id, row, texts, hash: hashOf(texts), ...extra });
  };
  push('ui', readDict(SOURCE));
  for (const t of (await q('SELECT * FROM topics ORDER BY sort, name')).rows) push('topic', t);
  for (const s of (await q('SELECT * FROM surveys ORDER BY id DESC')).rows) push('survey', s);
  const { rows } = await q('SELECT qu.*, t.name AS topic_name FROM questions qu LEFT JOIN topics t ON t.id=qu.topic_id ORDER BY t.sort NULLS LAST, qu.id');
  for (const x of rows) push('question', x);
  return ents;
}
const trKey = (kind, id) => `${kind}:${id}`;
async function loadTranslations(lang) {
  const { rows } = await q('SELECT * FROM translations WHERE lang=$1', [lang]);
  return new Map(rows.map((r) => [trKey(r.kind, r.ref_id), r]));
}
const hasText = (v) => typeof v === 'string' && v.trim() !== '';
// Vorhandene Oberflächen-Texte, die nicht aus der DB kommen (handgepflegte en.json)
const uiBase = (lang) => (lang === 'en' ? readDict('en') : {});

function entityStatus(ent, tr, lang) {
  if (!tr) {
    const base = uiBase(lang);
    return ent.kind === 'ui' && Object.keys(ent.texts).every((k) => hasText(base[k])) ? 'ok' : 'missing';
  }
  return tr.source_hash === ent.hash ? 'ok' : 'stale';
}

function checkLang(req, res) {
  const lang = String(req.params.lang || '').toLowerCase();
  if (!isEnabled(lang)) { bad(res, 'Ungültige Sprache'); return null; }
  return lang;
}

app.get('/api/translate/status', requireAdmin, wrap(async (req, res) => {
  const info = await translatorInfo();
  const ents = await loadEntities();
  const languages = [];
  for (const l of enabledLanguages()) {
    const trs = await loadTranslations(l.code);
    const base = uiBase(l.code);
    const ui = { total: 0, translated: 0, stale: 0 };
    const content = { total: 0, translated: 0, reviewed: 0, stale: 0 };
    for (const e of ents) {
      const tr = trs.get(trKey(e.kind, e.ref_id));
      if (e.kind === 'ui') {
        const keys = Object.keys(e.texts);
        ui.total = keys.length;
        ui.translated = keys.filter((k) => hasText(tr?.data?.[k]) || hasText(base[k])).length;
        if (tr && tr.source_hash !== e.hash) ui.stale = keys.filter((k) => hasText(tr.data?.[k])).length;
        continue;
      }
      content.total++;
      if (!tr) continue;
      if (tr.source_hash === e.hash) { content.translated++; if (tr.reviewed) content.reviewed++; } else content.stale++;
    }
    languages.push({ ...l, ui, content });
  }
  res.json({ ...info, languages });
}));

app.get('/api/translations/:lang', requireAdmin, wrap(async (req, res) => {
  const lang = checkLang(req, res); if (!lang) return;
  const trs = await loadTranslations(lang);
  const base = uiBase(lang);
  const groups = (await loadEntities()).map((e) => {
    const tr = trs.get(trKey(e.kind, e.ref_id));
    const status = entityStatus(e, tr, lang);
    const fields = fieldsOf(e.kind, e.row).map((f) => ({ ...f, text: hasText(tr?.data?.[f.key]) ? tr.data[f.key] : (e.kind === 'ui' && hasText(base[f.key]) ? base[f.key] : null) }));
    const g = { kind: e.kind, ref_id: e.ref_id, status, reviewed: tr ? tr.reviewed : (e.kind === 'ui' && status === 'ok'), fields };
    if (e.kind === 'ui') g.title = 'Oberfläche (Teilnehmer-Texte)';
    else if (e.kind === 'topic') g.title = e.row.name;
    else if (e.kind === 'survey') g.title = e.row.title;
    else {
      g.title = e.row.prompt.length > 70 ? `${e.row.prompt.slice(0, 70)}…` : e.row.prompt;
      g.subtitle = [TYPES[e.row.type]?.label || e.row.type, e.row.topic_name].filter(Boolean).join(' · ');
    }
    return g;
  });
  const order = (g) => KINDS.indexOf(g.kind);
  groups.sort((a, b) => order(a) - order(b)); // stabil: Reihenfolge innerhalb der Art bleibt
  res.json({ lang, groups });
}));

app.put('/api/translations/:lang/:kind/:refId', requireAdmin, wrap(async (req, res) => {
  const lang = checkLang(req, res); if (!lang) return;
  const { kind } = req.params;
  if (!KINDS.includes(kind)) return bad(res, 'Ungültige Art');
  const refId = kind === 'ui' ? 0 : Number(req.params.refId);
  if (!Number.isInteger(refId)) return bad(res, 'Ungültige ID');
  const ent = (await loadEntities()).find((e) => e.kind === kind && e.ref_id === refId);
  if (!ent) return bad(res, 'Nicht gefunden', 404);
  const given = req.body?.texts && typeof req.body.texts === 'object' ? req.body.texts : {};
  const data = {};
  for (const k of Object.keys(ent.texts)) if (hasText(given[k])) data[k] = String(given[k]);
  await q(
    `INSERT INTO translations (kind, ref_id, lang, data, source_hash, reviewed) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (kind, ref_id, lang) DO UPDATE SET data=EXCLUDED.data, source_hash=EXCLUDED.source_hash, reviewed=EXCLUDED.reviewed, updated_at=now()`,
    [kind, refId, lang, JSON.stringify(data), ent.hash, !!req.body?.reviewed],
  );
  res.json({ ok: true });
}));

app.delete('/api/translations/:lang/:kind/:refId', requireAdmin, wrap(async (req, res) => {
  const lang = checkLang(req, res); if (!lang) return;
  const { kind } = req.params;
  if (!KINDS.includes(kind)) return bad(res, 'Ungültige Art');
  await q('DELETE FROM translations WHERE lang=$1 AND kind=$2 AND ref_id=$3', [lang, kind, kind === 'ui' ? 0 : Number(req.params.refId) || 0]);
  res.json({ ok: true });
}));

app.post('/api/translations/:lang/auto', requireAdmin, wrap(async (req, res) => {
  const lang = checkLang(req, res); if (!lang) return;
  if (!isConfigured()) return bad(res, 'Kein Übersetzer konfiguriert. Übersetzer starten (docker compose up -d translate) und TRANSLATE_URL bzw. DEEPL_API_KEY setzen.', 503);
  const b = req.body || {};
  const kinds = Array.isArray(b.kinds) && b.kinds.length ? b.kinds.filter((k) => KINDS.includes(k)) : KINDS;
  const only = b.only && KINDS.includes(b.only.kind) ? { kind: b.only.kind, ref_id: b.only.kind === 'ui' ? 0 : Number(b.only.ref_id) } : null;
  const force = !!b.force;
  const trs = await loadTranslations(lang);
  const result = { translated: 0, skipped: 0, failed: 0, errors: [] };
  let todo = (await loadEntities()).filter((e) => (only ? e.kind === only.kind && e.ref_id === only.ref_id : kinds.includes(e.kind)));
  if (only && !todo.length) return bad(res, 'Nicht gefunden', 404);
  todo = todo.filter((e) => {
    const tr = trs.get(trKey(e.kind, e.ref_id));
    const skip = !force && entityStatus(e, tr, lang) === 'ok'; // aktuell (auch geprüft) => nichts zu tun
    if (skip) result.skipped++;
    return !skip;
  });

  const CHUNK = 25; // je Durchgang speichern, damit Fortschritt bei Abbruch erhalten bleibt
  for (let c = 0; c < todo.length; c += CHUNK) {
    const chunk = todo.slice(c, c + CHUNK);
    const flat = chunk.flatMap((e, ei) => Object.entries(e.texts).map(([key, text]) => ({ ei, key, text })));
    let out;
    try {
      out = await translateDetailed(flat.map((f) => f.text), lang);
    } catch (e) {
      result.failed += todo.length - c;
      result.errors.push(e.message);
      break;
    }
    const failedIdx = new Set(out.failed);
    for (const [ei, e] of chunk.entries()) {
      const data = {};
      let broken = false;
      flat.forEach((f, i) => {
        if (f.ei !== ei) return;
        if (failedIdx.has(i)) broken = true; else data[f.key] = out.texts[i];
      });
      // Bei Platzhalterverlust bleibt der Eintrag "veraltet" (leerer Hash), damit er erneut versucht wird
      await q(
        `INSERT INTO translations (kind, ref_id, lang, data, source_hash, reviewed) VALUES ($1,$2,$3,$4,$5,false)
         ON CONFLICT (kind, ref_id, lang) DO UPDATE SET data=EXCLUDED.data, source_hash=EXCLUDED.source_hash, reviewed=false, updated_at=now()`,
        [e.kind, e.ref_id, lang, JSON.stringify(data), broken ? '' : e.hash],
      );
      if (broken) { result.failed++; result.errors.push(`${e.kind} ${e.ref_id}: Platzhalter im Ergebnis verloren, Originaltext beibehalten`); } else result.translated++;
    }
  }
  res.json(result);
}));

// ---------------------------------------------------------------- Frontend
app.use('/api', (req, res) => bad(res, 'Unbekannter Endpunkt', 404));
const INDEX = readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const sendIndex = (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.type('html').send(INDEX.replaceAll('%BASE%', baseFor(req))); };
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC, { index: false, maxAge: 0 }));
app.get('/t/:token', sendIndex);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Serverfehler' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initDb();
  await ensureAdminUser();
  await seedIfEmpty();
  const port = Number(process.env.PORT) || 3000;
  const root = express();
  if (BASE) root.use(BASE, app); // direkt unter dem Unterpfad …
  root.use(app); // … und zusätzlich auf /, falls der Proxy den Prefix entfernt
  root.listen(port, () => console.log(`Wissenscheck läuft auf Port ${port}${BASE ? ` (Unterpfad ${BASE})` : ''}`));
}
