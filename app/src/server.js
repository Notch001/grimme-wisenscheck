import express from 'express';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, initDb, pool } from './db.js';
import { grade, sanitize, validateQuestion, TYPES } from './grading.js';
import { evaluate, surveyQuestions, participantAnswers } from './results.js';
import { login, issueCookie, clearCookie, currentUser, requireAdmin, newToken, ensureAdminUser, hashPassword } from './auth.js';
import { seedIfEmpty } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const UPLOADS = process.env.UPLOAD_DIR || path.join(here, '..', 'data', 'uploads');
mkdirSync(UPLOADS, { recursive: true });

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// ---------------------------------------------------------------- Login
app.post('/api/login', wrap(async (req, res) => {
  const u = await login(req.body?.username, req.body?.password);
  if (!u) return bad(res, 'Benutzername oder Passwort falsch', 401);
  issueCookie(res, u.id);
  res.json({ ok: true });
}));
app.post('/api/logout', (req, res) => { clearCookie(res); res.json({ ok: true }); });
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

app.get('/api/p/:token', wrap(async (req, res) => {
  const p = await loadParticipant(req, res); if (!p) return;
  await expireIfNeeded(p);
  if (p.status === 'submitted') {
    const out = { participant: { name: p.name, status: p.status }, survey: { title: p.title } };
    if (p.show_results) {
      const survey = (await q('SELECT * FROM surveys WHERE id=$1', [p.survey_id])).rows[0];
      const ev = evaluate(await surveyQuestions(p.survey_id), await participantAnswers(p.id), survey);
      out.results = { pct: ev.pct, level: ev.level, pending: ev.pendingCount, topics: ev.topics.map(({ name, pct, level }) => ({ name, pct, level })) };
    }
    return res.json(out);
  }
  if (p.survey_status !== 'open') return res.json({ participant: { name: p.name, status: 'closed' }, survey: { title: p.title } });
  if (p.status === 'invited') {
    p.started_at = (await q(`UPDATE participants SET status='started', started_at=now() WHERE id=$1 RETURNING started_at`, [p.id])).rows[0].started_at;
  }
  const questions = (await surveyQuestions(p.survey_id)).map(sanitize);
  const answers = {};
  for (const a of await participantAnswers(p.id)) answers[a.question_id] = a.response;
  res.json({
    participant: { name: p.name, status: 'started' },
    survey: { title: p.title, description: p.description },
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
  const response = req.body?.response ?? null;
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

// ---------------------------------------------------------------- Frontend
app.use('/api', (req, res) => bad(res, 'Unbekannter Endpunkt', 404));
app.use(express.static(PUBLIC, { index: 'index.html', maxAge: 0 }));
app.get('/t/:token', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Serverfehler' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initDb();
  await ensureAdminUser();
  await seedIfEmpty();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Wissenscheck läuft auf Port ${port}`));
}
