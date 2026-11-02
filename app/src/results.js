// Auswertung: Punkte je Teilnehmer und Themenbereich, Schwächen, Weiterbildungsvorschlag.
import { q } from './db.js';

export async function surveyQuestions(surveyId) {
  const { rows } = await q(
    `SELECT qu.*, t.name AS topic_name, t.sort AS topic_sort, sq.position
       FROM survey_questions sq
       JOIN questions qu ON qu.id = sq.question_id
       LEFT JOIN topics t ON t.id = qu.topic_id
      WHERE sq.survey_id = $1
      ORDER BY sq.position`,
    [surveyId],
  );
  return rows;
}

export const levelOf = (pct, survey) => (pct < survey.threshold_low ? 'low' : pct < survey.threshold_high ? 'mid' : 'ok');

export function evaluate(questions, answerRows, survey) {
  const byQ = new Map(answerRows.map((a) => [a.question_id, a]));
  const topics = new Map();
  const items = [];

  for (const qu of questions) {
    const a = byQ.get(qu.id);
    const answered = !!(a && a.response && Object.keys(a.response).length);
    let score = a ? (a.manual_score ?? a.auto_score) : null;
    if (score === null || score === undefined) {
      // nicht bewertet: ohne Antwort zählt eine Zeichenaufgabe/Kurztext als 0, sonst "offen"
      score = (qu.type === 'drawing' || qu.type === 'text') && !answered ? 0 : null;
    }
    const pending = score === null;
    const tid = qu.topic_id || 0;
    const tname = qu.topic_name || 'Ohne Themenbereich';
    if (!topics.has(tid)) topics.set(tid, { id: tid, name: tname, sort: qu.topic_sort ?? 999, earned: 0, max: 0, pendingCount: 0, total: 0, answered: 0 });
    const t = topics.get(tid);
    t.total += 1;
    if (answered) t.answered += 1;
    if (pending) t.pendingCount += 1;
    else {
      t.earned += score * qu.points;
      t.max += Number(qu.points);
    }
    items.push({
      question_id: qu.id,
      topic_id: tid,
      topic: tname,
      objective: qu.objective,
      score,
      pending,
      answered,
      manual: a?.manual_score ?? null,
      comment: a?.comment || '',
      response: a?.response ?? null,
    });
  }

  const topicList = [...topics.values()]
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((t) => {
      const pct = t.max ? Math.round((t.earned / t.max) * 100) : null;
      return { ...t, pct, level: pct === null ? 'pending' : levelOf(pct, survey) };
    });

  const earned = topicList.reduce((s, t) => s + t.earned, 0);
  const max = topicList.reduce((s, t) => s + t.max, 0);
  const pct = max ? Math.round((earned / max) * 100) : null;

  // Weiterbildungsvorschlag: je schwachem Themenbereich die Lernziele der nicht voll gelösten Aufgaben
  const plan = topicList
    .filter((t) => t.level === 'low' || t.level === 'mid')
    .map((t) => ({
      topic: t.name,
      level: t.level,
      pct: t.pct,
      objectives: [...new Set(items.filter((i) => i.topic_id === t.id && !i.pending && i.score < 1 && i.objective).map((i) => i.objective))],
    }));

  return { topics: topicList, pct, level: pct === null ? 'pending' : levelOf(pct, survey), pendingCount: items.filter((i) => i.pending).length, items, plan };
}

export async function participantAnswers(participantId) {
  const { rows } = await q('SELECT * FROM answers WHERE participant_id = $1', [participantId]);
  return rows;
}
