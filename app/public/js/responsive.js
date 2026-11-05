// Tabellen für schmale Bildschirme: jede Zeile wird als Karte gezeigt (Beschriftung aus der Kopfzeile).
// Matrix-Tabellen (.heat) bleiben tabellarisch und scrollen waagerecht.
function label(table) {
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  if (!heads.length) return;
  table.classList.add('stack');
  for (const tr of table.querySelectorAll('tbody tr')) {
    [...tr.children].forEach((td, i) => { if (td.tagName === 'TD' && td.dataset.label === undefined) td.dataset.label = heads[i] || ''; });
  }
}

export function stackTables(root) {
  let queued = false;
  const run = () => { queued = false; root.querySelectorAll('table.tbl:not(.heat)').forEach(label); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(root, { childList: true, subtree: true });
  run();
}
