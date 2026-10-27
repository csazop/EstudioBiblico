// ── Bible versions metadata ─────────────────────────────────────
const VERSIONS = [
  { id: 'rv1960',       abbr: 'RV1960',    name: 'Reina Valera 1960',                lang: 'es',  badge: '',         color: '#1a3a5c' },
  { id: 'lbla',         abbr: 'LBLA',      name: 'La Biblia de las Américas (RV1995)',lang: 'es',  badge: '',         color: '#1a3a5c' },
  { id: 'nvi',          abbr: 'NVI',       name: 'Nueva Versión Internacional',       lang: 'es',  badge: '',         color: '#1a3a5c' },
  { id: 'ntv',          abbr: 'NTV',       name: 'Nueva Traducción Viviente',         lang: 'es',  badge: '',         color: '#1a3a5c' },
  { id: 'tischendorf',  abbr: 'GRC-NT',    name: 'Tischendorf 8ª Ed.',               lang: 'grc', badge: 'Solo NT',  color: '#2d6a4f' },
  { id: 'gnt-parallel', abbr: 'GRC+ESP',   name: 'Griego NT + RV1960 (Paralelo)',    lang: 'grc', badge: 'Paralelo', color: '#1b5e20' },
  { id: 'lxx',          abbr: 'LXX',       name: 'Septuaginta – Griego AT',          lang: 'el',  badge: 'Solo AT',  color: '#2d6a4f' },
  { id: 'codex',        abbr: 'WLC',       name: 'Texto Hebreo Masorético',          lang: 'he',  badge: 'Hebreo',   color: '#9c4a00' },
];

const LANG_FLAG = { es: '🇪🇸', grc: '🏛️', el: '🇬🇷', he: '✡️' };

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  renderVersionsGrid();
  await loadDashboard();
});

async function loadDashboard() {
  try {
    const [notes, sermons] = await Promise.allSettled([
      StudyNotesApi.list(),
      SermonsApi.list(),
    ]);

    const notesData   = notes.status   === 'fulfilled' ? notes.value   : [];
    const sermonsData = sermons.status === 'fulfilled' ? sermons.value : [];

    renderStats(notesData, sermonsData);
    renderNotesList(notesData);
    renderSermonsList(sermonsData);
    renderActivityFeed(notesData, sermonsData);
    renderWelcome(notesData, sermonsData);
  } catch (e) {
    showToast('Error al cargar el dashboard: ' + e.message, 'danger');
    renderErrorState();
  }
}

// ── Welcome banner ────────────────────────────────────────────────
function renderWelcome(notes, sermons) {
  const total = notes.length + sermons.length;
  const titleEl = document.getElementById('welcomeTitle');
  const subEl   = document.getElementById('welcomeSub');

  if (total === 0) {
    titleEl.textContent = 'Bienvenido a tu Estudio Bíblico';
    subEl.textContent   = 'Crea tu primera nota o sermón para comenzar.';
    return;
  }

  const allItems = [
    ...notes.map(n   => ({ date: n.studyDate,   type: 'nota',    title: n.title })),
    ...sermons.map(s => ({ date: s.sermonDate,   type: 'sermón',  title: s.title })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const last = allItems[0];
  titleEl.textContent = 'Bienvenido de nuevo';
  subEl.textContent   = `Última actividad: ${last.type} "${trunc(last.title, 40)}" — ${formatDate(last.date)}`;
}

// ── Stats ─────────────────────────────────────────────────────────
function renderStats(notes, sermons) {
  document.getElementById('statNotes').textContent   = notes.length;
  document.getElementById('statSermons').textContent = sermons.length;

  const lastNote = mostRecent(notes, 'studyDate');
  document.getElementById('statNotesLast').textContent =
    lastNote ? formatDate(lastNote.studyDate) : 'Sin notas';

  const lastSermon = mostRecent(sermons, 'sermonDate');
  document.getElementById('statSermonsLast').textContent =
    lastSermon ? formatDate(lastSermon.sermonDate) : 'Sin sermones';

  // Last activity across both
  const candidates = [
    lastNote   && { date: lastNote.studyDate,    label: lastNote.title,   type: 'nota' },
    lastSermon && { date: lastSermon.sermonDate, label: lastSermon.title, type: 'sermón' },
  ].filter(Boolean);

  if (candidates.length) {
    const last = candidates.sort((a, b) => b.date.localeCompare(a.date))[0];
    document.getElementById('statLastActivity').textContent = formatDate(last.date);
    document.getElementById('statLastItem').textContent     = trunc(last.label, 30) + ` (${last.type})`;
  }
}

// ── Notes List ────────────────────────────────────────────────────
function renderNotesList(notes) {
  const el = document.getElementById('notesList');
  if (!notes.length) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-journal-plus" style="color:var(--brand-primary);opacity:.3"></i>
        <p class="mb-2">No hay notas de estudio todavía.</p>
        <a href="study-notes.html?new=1" class="btn btn-primary btn-sm">
          <i class="bi bi-plus-lg me-1"></i>Crear primera nota
        </a>
      </div>`;
    return;
  }

  const sorted = [...notes]
    .sort((a, b) => b.studyDate.localeCompare(a.studyDate))
    .slice(0, 8);

  el.innerHTML = sorted.map(n => `
    <div class="item-row" onclick="window.location='study-notes.html?id=${n.id}'">
      <div style="min-width:0">
        <div class="item-title">${escHtml(n.title)}</div>
        <div class="item-meta">
          <i class="bi bi-calendar3 me-1"></i>${formatDate(n.studyDate)}
          <span class="ms-2 text-muted" style="font-size:.7rem">Editado ${relativeTime(n.updatedAt)}</span>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="item-tag" style="background:#eaf1fb; color:var(--brand-primary)">NOTA</span>
        <i class="bi bi-chevron-right text-muted small"></i>
      </div>
    </div>`).join('');
}

// ── Sermons List ──────────────────────────────────────────────────
function renderSermonsList(sermons) {
  const el = document.getElementById('sermonsList');
  if (!sermons.length) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-mic" style="color:var(--brand-accent);opacity:.3"></i>
        <p class="mb-2">No hay sermones preparados todavía.</p>
        <a href="sermon-prep.html?new=1" class="btn btn-warning btn-sm text-dark">
          <i class="bi bi-plus-lg me-1"></i>Preparar primer sermón
        </a>
      </div>`;
    return;
  }

  const sorted = [...sermons]
    .sort((a, b) => b.sermonDate.localeCompare(a.sermonDate))
    .slice(0, 8);

  el.innerHTML = sorted.map(s => `
    <div class="item-row" onclick="window.location='sermon-prep.html?id=${s.id}'">
      <div style="min-width:0">
        <div class="item-title">${escHtml(s.title)}</div>
        <div class="item-meta">
          <i class="bi bi-calendar3 me-1"></i>${formatDate(s.sermonDate)}
          ${s.theme ? `<span class="ms-2 fst-italic text-muted small">${escHtml(trunc(s.theme, 35))}</span>` : ''}
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="item-tag" style="background:#fff4e6; color:var(--brand-accent)">SERMÓN</span>
        <i class="bi bi-chevron-right text-muted small"></i>
      </div>
    </div>`).join('');
}

// ── Activity Feed ─────────────────────────────────────────────────
function renderActivityFeed(notes, sermons) {
  const el = document.getElementById('activityFeed');

  const all = [
    ...notes.map(n => ({
      date:  n.updatedAt,
      title: n.title,
      sub:   formatDate(n.studyDate),
      type:  'nota',
      icon:  'bi-journal-text',
      color: 'var(--brand-primary)',
      bg:    '#eaf1fb',
      url:   `study-notes.html?id=${n.id}`,
    })),
    ...sermons.map(s => ({
      date:  s.updatedAt,
      title: s.title,
      sub:   s.theme ? trunc(s.theme, 30) : formatDate(s.sermonDate),
      type:  'sermón',
      icon:  'bi-mic-fill',
      color: 'var(--brand-accent)',
      bg:    '#fff4e6',
      url:   `sermon-prep.html?id=${s.id}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  if (!all.length) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-clock-history" style="opacity:.3"></i><p>Sin actividad reciente.</p></div>`;
    return;
  }

  el.innerHTML = all.map((item, i) => `
    <div class="d-flex gap-3 mb-3 ${i < all.length - 1 ? 'pb-3 border-bottom' : ''}"
         style="cursor:pointer" onclick="window.location='${item.url}'">
      <div style="width:34px;height:34px;border-radius:.4rem;background:${item.bg};
                  display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="bi ${item.icon}" style="color:${item.color}"></i>
      </div>
      <div style="min-width:0">
        <div style="font-size:.85rem;font-weight:600;color:#1a1a2e;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(item.title)}
        </div>
        <div style="font-size:.74rem;color:#888">${escHtml(item.sub)}</div>
        <div style="font-size:.7rem;color:#bbb;margin-top:1px">${relativeTime(item.date)}</div>
      </div>
    </div>`).join('');
}

// ── Versions Grid ─────────────────────────────────────────────────
function renderVersionsGrid() {
  const el = document.getElementById('versionsGrid');
  el.innerHTML = VERSIONS.map(v => `
    <div class="col-6 col-sm-4 col-md-3">
      <div class="version-chip">
        <div class="d-flex align-items-center justify-content-between gap-1">
          <span class="version-abbr" style="color:${v.color}">${LANG_FLAG[v.lang] || ''} ${v.abbr}</span>
          ${v.badge ? `<span class="version-badge" style="background:#e8f5e9;color:#2d6a4f;border:1px solid #a5d6a7">${v.badge}</span>` : ''}
        </div>
        <div class="version-name">${v.name}</div>
      </div>
    </div>`).join('');
}

// ── Error State ───────────────────────────────────────────────────
function renderErrorState() {
  ['notesList', 'sermonsList', 'activityFeed'].forEach(id => {
    document.getElementById(id).innerHTML = `
      <div class="empty-state">
        <i class="bi bi-exclamation-triangle text-danger" style="font-size:2rem"></i>
        <p class="text-danger small mt-2">No se pudo conectar con el servidor.<br>
        Verifica que los contenedores estén en ejecución.</p>
      </div>`;
  });
  ['statNotes','statSermons','statLastActivity'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  ['statNotesLast','statSermonsLast','statLastItem'].forEach(id => {
    document.getElementById(id).textContent = 'Sin conexión';
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function mostRecent(items, field) {
  if (!items.length) return null;
  return items.reduce((best, cur) => cur[field] > best[field] ? cur : best);
}

function trunc(str, n) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7)  return `hace ${d} días`;
  return formatDate(iso.slice(0, 10));
}
