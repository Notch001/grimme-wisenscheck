// Übersetzbare Texte von Themen, Abfragen, Fragen und der Oberfläche.
// Schlüssel sind flach (z. B. "prompt", "options.a"); IDs und Reihenfolge der Antworten bleiben unangetastet.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const I18N_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'i18n');

const has = (v) => typeof v === 'string' && v.trim() !== '';
const arr = (v) => (Array.isArray(v) ? v : []);

// Wörterbuch-Datei lesen; fehlende oder defekte Datei => {}
export function readDict(lang) {
  try {
    const d = JSON.parse(readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf8'));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch { return {}; }
}

// Listen je Fragetyp, deren Einträge { id, text } übersetzt werden
const LISTS = {
  single: ['options'], multi: ['options'], strike: ['options'],
  order: ['items'], match: ['left', 'right'], imagelabel: ['labels'],
};
const LIST_LABEL = { options: 'Antwort', items: 'Schritt', left: 'Zeile', right: 'Zuordnung', labels: 'Beschriftung' };
const LETTERS = new Set(['options', 'left']);

// [{ key, label, source }] in Anzeigereihenfolge
export function fieldsOf(kind, row) {
  const out = [];
  const add = (key, label, source) => { if (has(source)) out.push({ key, label, source }); };
  const r = row || {};
  if (kind === 'topic') add('name', 'Name', r.name);
  else if (kind === 'survey') { add('title', 'Titel', r.title); add('description', 'Beschreibung', r.description); }
  else if (kind === 'ui') for (const [k, v] of Object.entries(r)) add(k, k, v);
  else if (kind === 'question') {
    const c = r.config || {};
    add('prompt', 'Fragetext', r.prompt);
    add('note', 'Hinweis', c.note);
    for (const list of LISTS[r.type] || []) {
      arr(c[list]).forEach((it, i) => {
        if (it && it.id !== undefined) add(`${list}.${it.id}`, `${LIST_LABEL[list]} ${LETTERS.has(list) ? String.fromCharCode(97 + (i % 26)) + ')' : i + 1}`, it.text);
      });
    }
  }
  return out;
}

export function textsOf(kind, row) {
  return Object.fromEntries(fieldsOf(kind, row).map((f) => [f.key, f.source]));
}

export function hashOf(texts) {
  const sorted = Object.keys(texts || {}).sort().map((k) => [k, texts[k]]);
  return crypto.createHash('sha1').update(JSON.stringify(sorted)).digest('hex');
}

// Überlagert ein aufbereitetes Objekt (Ergebnis von sanitize() bzw. Topic/Survey-Zeile) mit Übersetzungen.
// Fehlende Schlüssel bleiben deutsch; IDs und Reihenfolge ändern sich nie.
export function applyTranslation(kind, obj, texts) {
  if (!obj || !texts) return obj;
  const pick = (k, fallback) => (has(texts[k]) ? texts[k] : fallback);
  switch (kind) {
    case 'topic':
      return { ...obj, name: pick('name', obj.name) };
    case 'survey':
      return { ...obj, title: pick('title', obj.title), ...('description' in obj ? { description: pick('description', obj.description) } : {}) };
    case 'ui':
      return { ...obj, ...Object.fromEntries(Object.entries(texts).filter(([, v]) => has(v))) };
    case 'question': {
      const config = { ...(obj.config || {}) };
      if ('note' in config) config.note = pick('note', config.note);
      for (const list of ['options', 'items', 'left', 'right', 'labels']) {
        if (Array.isArray(config[list])) {
          config[list] = config[list].map((it) => (it && it.id !== undefined && has(texts[`${list}.${it.id}`]) ? { ...it, text: texts[`${list}.${it.id}`] } : it));
        }
      }
      return { ...obj, prompt: pick('prompt', obj.prompt), config };
    }
    default:
      return obj;
  }
}
