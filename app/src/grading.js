// Bewertungslogik und Aufbereitung der Fragen für Teilnehmer.
// Ergebnis einer Bewertung: Zahl 0..1 oder null (= muss manuell vom Ausbilder bewertet werden).

export const TYPES = {
  single:     { label: 'Einfachauswahl',            auto: true },
  multi:      { label: 'Mehrfachauswahl',           auto: true },
  strike:     { label: 'Falsches durchstreichen',   auto: true },
  order:      { label: 'Reihenfolge',               auto: true },
  match:      { label: 'Zuordnung',                 auto: true },
  number:     { label: 'Zahlenwert / Berechnung',   auto: true },
  text:       { label: 'Kurztext',                  auto: true },
  imagelabel: { label: 'Bild beschriften',          auto: true },
  hotspot:    { label: 'Im Bild markieren',         auto: true },
  drawing:    { label: 'Zeichnen (Schaltplan)',     auto: false },
  practical:  { label: 'Praktische Aufgabe',        auto: false },
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const arr = (v) => (Array.isArray(v) ? v : []);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

function parseNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  return s === '' ? NaN : Number(s);
}

function inArea(p, a, aspect) {
  const dx = p.x - a.x;
  const dy = (p.y - a.y) * (aspect || 0.5);
  return Math.hypot(dx, dy) <= a.r;
}

export function grade(q, resp) {
  const c = q.config || {};
  const r = resp || {};
  switch (q.type) {
    case 'single':
      return r.value && r.value === c.correct ? 1 : 0;

    case 'multi': {
      const correct = arr(c.correct);
      const picked = arr(r.values);
      if (!correct.length) return picked.length ? 0 : 1;
      const right = picked.filter((x) => correct.includes(x)).length;
      const wrong = picked.filter((x) => !correct.includes(x)).length;
      return clamp01((right - wrong) / correct.length);
    }

    case 'strike': {
      const wrong = arr(c.wrong);
      const struck = arr(r.struck);
      const opts = arr(c.options);
      if (!opts.length) return 0;
      // Jede Option zählt: falsche müssen durchgestrichen, richtige stehen bleiben
      const ok = opts.filter((o) => wrong.includes(o.id) === struck.includes(o.id)).length;
      if (!struck.length) return 0; // nichts bearbeitet
      return clamp01(ok / opts.length);
    }

    case 'order': {
      const items = arr(c.items).map((i) => i.id);
      const given = arr(r.order);
      if (!items.length || !given.length) return 0;
      return items.filter((id, i) => given[i] === id).length / items.length;
    }

    case 'match': {
      const pairs = c.pairs || {};
      const keys = Object.keys(pairs);
      if (!keys.length) return 0;
      const given = r.pairs || {};
      return keys.filter((k) => given[k] === pairs[k]).length / keys.length;
    }

    case 'number': {
      const v = parseNumber(r.value);
      const target = parseNumber(c.answer);
      if (Number.isNaN(v) || Number.isNaN(target)) return 0;
      const tol = Math.abs(parseNumber(c.tolerance) || 0);
      return Math.abs(v - target) <= tol + 1e-9 ? 1 : 0;
    }

    case 'text': {
      const accepted = arr(c.accepted).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
      if (!accepted.length) return null;
      const v = String(r.value ?? '').trim().toLowerCase();
      return v && accepted.includes(v) ? 1 : 0;
    }

    case 'imagelabel': {
      const targets = arr(c.targets);
      if (!targets.length) return 0;
      const placed = r.placements || {};
      const hit = targets.filter((t) => {
        const p = placed[t.label];
        return p && inArea(p, { x: t.x, y: t.y, r: c.radius || 6 }, c.aspect);
      }).length;
      return hit / targets.length;
    }

    case 'hotspot': {
      const areas = arr(c.areas);
      if (!areas.length) return 0;
      const pts = arr(r.points);
      const hit = areas.filter((a) => pts.some((p) => inArea(p, a, c.aspect))).length;
      const stray = pts.filter((p) => !areas.some((a) => inArea(p, a, c.aspect))).length;
      return clamp01((hit - stray) / areas.length);
    }

    case 'drawing':
    case 'practical':
    default:
      return null;
  }
}

// ---------- Aufbereitung für Teilnehmer (ohne Lösungen!) ----------

function hash(n) {
  let x = (n * 2654435761) >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function shuffled(list, seed) {
  const rnd = hash(seed * 31 + 7);
  for (let i = 0; i < 5; i++) rnd(); // Anlaufphase des Zufallsgenerators
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sanitize(q) {
  const c = q.config || {};
  let config = {};
  switch (q.type) {
    case 'single':
      config = { options: arr(c.options) };
      break;
    case 'multi':
      config = { options: arr(c.options), multiple: true };
      break;
    case 'strike':
      config = { options: arr(c.options) };
      break;
    case 'order': {
      let items = shuffled(arr(c.items), q.id);
      const sorted = arr(c.items).map((i) => i.id).join();
      if (items.length > 1 && items.map((i) => i.id).join() === sorted) items = [...items.slice(1), items[0]];
      config = { items };
      break;
    }
    case 'match':
      config = { left: arr(c.left), right: shuffled(arr(c.right), q.id) };
      break;
    case 'number':
      config = { unit: c.unit || '' };
      break;
    case 'text':
      config = {};
      break;
    case 'imagelabel':
      config = { labels: shuffled(arr(c.labels), q.id), aspect: c.aspect || 0.5 };
      break;
    case 'hotspot':
      config = { aspect: c.aspect || 0.5, maxClicks: c.maxClicks || 12 };
      break;
    case 'drawing':
      config = { symbols: arr(c.symbols), note: c.note || '' };
      break;
    case 'practical':
      config = { note: c.note || '' };
      break;
  }
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    image: q.image || null,
    points: q.points,
    topic: q.topic_name || null,
    config,
  };
}

// Mindestprüfung beim Anlegen/Ändern von Fragen im Admin-Bereich
export function validateQuestion(type, config) {
  const c = config || {};
  if (!TYPES[type]) return 'Unbekannter Fragetyp';
  const need = (cond, msg) => (cond ? null : msg);
  switch (type) {
    case 'single':
      return need(arr(c.options).length >= 2 && arr(c.options).some((o) => o.id === c.correct), 'Mind. 2 Optionen und eine richtige Antwort nötig');
    case 'multi':
      return need(arr(c.options).length >= 2 && arr(c.correct).length >= 1, 'Mind. 2 Optionen und eine richtige Antwort nötig');
    case 'strike':
      return need(arr(c.options).length >= 2, 'Mind. 2 Aussagen nötig');
    case 'order':
      return need(arr(c.items).length >= 2, 'Mind. 2 Schritte nötig');
    case 'match':
      return need(arr(c.left).length >= 1 && arr(c.right).length >= 2 && Object.keys(c.pairs || {}).length >= 1, 'Zuordnungen fehlen');
    case 'number':
      return need(!Number.isNaN(parseNumber(c.answer)), 'Richtiger Zahlenwert fehlt');
    case 'imagelabel':
      return need(arr(c.targets).length >= 1 && arr(c.labels).length >= 1, 'Mind. ein Ziel im Bild setzen');
    case 'hotspot':
      return need(arr(c.areas).length >= 1, 'Mind. einen Bereich im Bild markieren');
    default:
      return null;
  }
}
