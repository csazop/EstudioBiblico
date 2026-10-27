// ─── State ────────────────────────────────────────────────────
let allSermons = [];
let currentSermonId = null;
let versions = [];
let pointCount = 0;
let lastActivePoint = null;
let quickVerses = [];

// Quill instances
let quillIntro, quillConclusion, quillNotes;
const pointEditors = new Map(); // pointId -> Quill instance

// ─── Quill toolbars ───────────────────────────────────────────
const FULL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote'],
  ['clean'],
];

const MINI_TOOLBAR = [
  ['bold', 'italic', 'underline'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['clean'],
];

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sermonDate').value = new Date().toISOString().slice(0, 10);

  quillIntro      = new Quill('#sermonIntroEditor',      { theme: 'snow', placeholder: 'Presenta el tema, captura la atención, establece la relevancia…', modules: { toolbar: FULL_TOOLBAR } });
  quillConclusion = new Quill('#sermonConclusionEditor', { theme: 'snow', placeholder: 'Cierra con un llamado a la acción, aplicación práctica, oración…', modules: { toolbar: FULL_TOOLBAR } });
  quillNotes      = new Quill('#sermonNotesEditor',      { theme: 'snow', placeholder: 'Notas de preparación, ilustraciones, anécdotas, citas de comentaristas…', modules: { toolbar: FULL_TOOLBAR } });

  await loadVersions();
  setupQuickSections();
  await loadSermons();

  // Handle URL params: ?id=X opens that sermon, ?new=1 starts a new one
  const params = new URLSearchParams(window.location.search);
  if (params.get('new') === '1') {
    newSermon();
    addPoint();
  } else if (params.get('id')) {
    const id = parseInt(params.get('id'));
    if (allSermons.find(s => s.id === id)) selectSermon(id);
    else if (allSermons.length > 0) selectSermon(allSermons[0].id);
    else addPoint();
  } else if (allSermons.length > 0) {
    selectSermon(allSermons[0].id);
  } else {
    addPoint();
  }
});

// ─── Versions ──────────────────────────────────────────────────
async function loadVersions() {
  try {
    versions = await BibleApi.versions();
  } catch {
    versions = [
      { id: 'rv1960', name: 'Reina Valera 1960 (RV1960)' },
      { id: 'lbla',   name: 'La Biblia de las Américas (LBLA)' },
      { id: 'nvi',    name: 'Nueva Versión Internacional (NVI)' },
      { id: 'ntv',    name: 'Nueva Traducción Viviente (NTV)' },
      { id: 'kjv',    name: 'King James Version (KJV)' },
      { id: 'nkjv',   name: 'New King James Version (NKJV)' },
      { id: 'esv',    name: 'English Standard Version (ESV)' },
      { id: 'nasb',   name: 'New American Standard Bible (NASB)' },
      { id: 'lsb',    name: 'Legacy Standard Bible (LSB)' },
      { id: 'nlt',    name: 'New Living Translation (NLT)' },
      { id: 'niv',      name: 'New International Version (NIV)' },
      { id: 'tisch-s',  name: 'Griego NT – Tischendorf con Strong\'s ★' },
      { id: 'wlca',     name: 'Hebreo AT – Westminster Leningrad con Strong\'s ★' },
    ];
  }
}

// ─── Quick Lookup — 3 columnas comparativas ────────────────────
const quickSectionState = { 1: {}, 2: {}, 3: {} };

function setupQuickSections() {
  [1, 2, 3].forEach(idx => {
    const container = document.querySelector(`.bible-q-section[data-section="${idx}"]`);
    if (!container) return;
    container.innerHTML = buildQuickSectionHTML(idx);
    populateBookSelect(container.querySelector(`#qBook${idx}`));
    populateChapterSelect(container.querySelector(`#qChapter${idx}`), 1);
    const vsel = container.querySelector(`#qVersion${idx}`);
    versions.forEach(v => {
      const o = document.createElement('option');
      o.value = v.id; o.textContent = v.name;
      vsel.appendChild(o);
    });
  });
}

function buildQuickSectionHTML(idx) {
  return `
  <div class="bible-col-panel">
    <div class="bible-col-header"><i class="bi bi-search me-1"></i>Consulta ${idx}</div>
    <div class="bible-col-controls">
      <!-- Fila 1: Versión + Libro -->
      <div class="row g-1 mb-1">
        <div class="col-6">
          <select class="form-select form-select-sm" id="qVersion${idx}" title="Versión">
            <option value="">-- Versión --</option>
          </select>
        </div>
        <div class="col-6">
          <select class="form-select form-select-sm" id="qBook${idx}" onchange="onQBookChange(${idx})" title="Libro"></select>
        </div>
      </div>
      <!-- Fila 2: Capítulo + Desde + Hasta -->
      <div class="row g-1 mb-1">
        <div class="col-4">
          <select class="form-select form-select-sm" id="qChapter${idx}" title="Capítulo"></select>
        </div>
        <div class="col-4">
          <input type="number" class="form-control form-control-sm" id="qFrom${idx}"
                 value="1" min="1" placeholder="Desde" title="Versículo desde">
        </div>
        <div class="col-4">
          <input type="number" class="form-control form-control-sm" id="qTo${idx}"
                 value="10" min="1" placeholder="Hasta" title="Versículo hasta">
        </div>
      </div>
      <!-- Fila 3: Botones -->
      <div class="d-flex gap-1">
        <button class="btn btn-primary btn-sm flex-fill" onclick="loadQuickSection(${idx})">
          <i class="bi bi-search me-1"></i>Buscar
        </button>
        <button class="btn btn-outline-primary btn-sm" onclick="insertFromSection(${idx})"
                title="Insertar en punto activo">
          <i class="bi bi-arrow-down-square"></i>
        </button>
        <button class="btn btn-outline-secondary btn-sm" onclick="copyQuickSection(${idx})" title="Copiar">
          <i class="bi bi-clipboard"></i>
        </button>
      </div>
    </div>
    <div id="qLoading${idx}" class="text-center py-2 d-none px-2">
      <div class="spinner-border spinner-border-sm text-primary me-1"></div><small>Cargando…</small>
    </div>
    <div id="qBibleText${idx}" class="bible-text-area bible-col-text">
      <span class="text-muted small">Selecciona versión, libro y capítulo.</span>
    </div>
  </div>`;
}

function onQBookChange(idx) {
  populateChapterSelect(
    document.getElementById(`qChapter${idx}`),
    document.getElementById(`qBook${idx}`).value
  );
}

async function loadQuickSection(idx) {
  const version = document.getElementById(`qVersion${idx}`).value;
  const bookNum = parseInt(document.getElementById(`qBook${idx}`).value);
  const chapter = parseInt(document.getElementById(`qChapter${idx}`).value);
  const from    = parseInt(document.getElementById(`qFrom${idx}`).value) || 1;
  const to      = parseInt(document.getElementById(`qTo${idx}`).value)   || 999;

  if (!version || !bookNum || !chapter) {
    showToast('Selecciona versión, libro y capítulo', 'warning'); return;
  }

  const loadEl = document.getElementById(`qLoading${idx}`);
  const textEl = document.getElementById(`qBibleText${idx}`);
  loadEl.classList.remove('d-none');
  textEl.classList.add('d-none');

  try {
    const verses = await BibleApi.chapter(version, bookNum, chapter, from, to);
    const bookName = BIBLE_BOOKS.find(b => b.num === bookNum)?.name || '';
    quickSectionState[idx] = { version, bookNum, chapter, from, to, verses, bookName };
    renderQuickVerses(idx, verses, version);
    // Update Bible Tools panel
    if (typeof btSetRef === 'function') btSetRef(bookNum, chapter, bookName, from, to);
    if (typeof btShowStrongsPills === 'function' && version === 'kjv') {
      const nums = verses.flatMap(v => [...(v.text || '').matchAll(/<S>(\d+)<\/S>/g)].map(m => m[1]));
      btShowStrongsPills(nums, bookNum >= 40);
    }
  } catch (e) {
    textEl.innerHTML =
      `<span class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>${e.message}</span>`;
    showToast('Error al cargar: ' + e.message, 'danger');
  } finally {
    loadEl.classList.add('d-none');
    textEl.classList.remove('d-none');
  }
}

const STRONGS_TAGGED_VERSIONS = new Set(['tisch-s', 'wlca']);

function renderQuickVerses(idx, verses, version) {
  const el = document.getElementById(`qBibleText${idx}`);
  el.className = 'bible-text-area bible-col-text' + (version === 'codex' ? ' rtl' : '');
  if (!verses?.length) {
    el.innerHTML = '<span class="text-muted small">Sin resultados.</span>'; return;
  }
  const isParallel = verses[0].translation !== undefined;
  const stripS = t => (t || '').replace(/<S>\d+<\/S>/g, '');
  const useStrongs = STRONGS_TAGGED_VERSIONS.has(version);
  const s = quickSectionState[idx];
  const isNT = (s?.bookNum || 0) >= 40;

  el.innerHTML = isParallel
    ? verses.map(v => `
        <div class="parallel-verse mb-2">
          <div><sup class="verse-num">${v.verse}</sup><span class="verse-greek">${v.text}</span></div>
          <div class="verse-translation-line">${v.translation}</div>
        </div>`).join('')
    : useStrongs && typeof renderStrongsAnnotated === 'function'
      ? verses.map(v =>
          `<span class="verse-block"><sup class="verse-num">${v.verse}</sup>${renderStrongsAnnotated(v.text, isNT)} </span>`
        ).join('')
      : verses.map(v => `<sup class="verse-num">${v.verse}</sup>${stripS(v.text)} `).join('');
}

function insertFromSection(idx) {
  const s = quickSectionState[idx];
  if (!s?.verses?.length) { showToast('Carga un texto primero en Consulta ' + idx, 'warning'); return; }

  const ref  = `${s.bookName} ${s.chapter}:${s.from}-${s.to} (${s.version.toUpperCase()})`;
  const text = s.verses.map(v => `${v.verse}. ${v.text}`).join(' ');

  let targetQuill = lastActivePoint;
  if (!targetQuill && pointEditors.size > 0)
    targetQuill = [...pointEditors.values()].at(-1);

  if (!targetQuill) { showToast('Agrega un punto primero', 'warning'); return; }

  targetQuill.insertText(targetQuill.getLength() - 1, `\n[${ref}]\n${text}\n`, 'user');
  showToast('Texto insertado en el punto');
  bootstrap.Tab.getOrCreateInstance(document.querySelector('[data-bs-target="#tabContent"]')).show();
}

function copyQuickSection(idx) {
  const el   = document.getElementById(`qBibleText${idx}`);
  const text = el?.innerText;
  if (!text?.trim() || text.includes('Selecciona')) {
    showToast('No hay texto para copiar', 'warning'); return;
  }
  navigator.clipboard.writeText(text).then(() => showToast('Texto copiado'));
}

// ─── Sermon Points ─────────────────────────────────────────────
function addPoint(title = '', content = '') {
  pointCount++;
  const id  = `point-${pointCount}`;
  const editorId = `editor-${id}`;

  const html = `
    <div class="sermon-point" id="${id}">
      <div class="d-flex align-items-start gap-2">
        <div class="point-num">${pointCount}</div>
        <div class="flex-grow-1">
          <input type="text" class="form-control form-control-sm mb-2 point-title"
            placeholder="Título del punto…" value="${escHtml(title)}">
          <div id="${editorId}" class="quill-editor-mini"></div>
        </div>
        <button class="btn btn-outline-danger btn-sm mt-1" onclick="removePoint('${id}')" title="Eliminar punto">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </div>`;

  document.getElementById('pointsList').insertAdjacentHTML('beforeend', html);

  const quill = new Quill(`#${editorId}`, {
    theme: 'snow',
    placeholder: 'Desarrolla este punto: argumento, versículos, ilustración…',
    modules: { toolbar: MINI_TOOLBAR },
  });

  if (content) quill.clipboard.dangerouslyPasteHTML(content);
  quill.on('selection-change', (range) => { if (range) lastActivePoint = quill; });

  pointEditors.set(id, quill);
  renumberPoints();
}

function removePoint(id) {
  document.getElementById(id)?.remove();
  pointEditors.delete(id);
  renumberPoints();
}

function renumberPoints() {
  document.querySelectorAll('.sermon-point').forEach((el, i) => {
    el.querySelector('.point-num').textContent = i + 1;
  });
}

function getPoints() {
  return [...document.querySelectorAll('.sermon-point')].map(el => ({
    title:   el.querySelector('.point-title').value,
    content: pointEditors.get(el.id)?.root.innerHTML || '',
  }));
}

function renderPoints(points) {
  document.getElementById('pointsList').innerHTML = '';
  pointEditors.clear();
  pointCount = 0;
  lastActivePoint = null;
  points.forEach(p => addPoint(p.title, p.content));
  if (points.length === 0) addPoint();
}

// ─── Sermons List ──────────────────────────────────────────────
async function loadSermons() {
  try {
    allSermons = await SermonsApi.list();
    renderSermonsList(allSermons);
  } catch (e) {
    showToast('Error al cargar sermones: ' + e.message, 'danger');
  }
}

function renderSermonsList(sermons) {
  const el = document.getElementById('sermonsList');
  if (sermons.length === 0) {
    el.innerHTML = '<p class="text-muted small p-3">No hay sermones. Crea uno nuevo.</p>';
    return;
  }
  el.innerHTML = sermons.map(s => `
    <div class="sidebar-item ${s.id === currentSermonId ? 'active' : ''}" onclick="selectSermon(${s.id})">
      <div class="item-title">${escHtml(s.title)}</div>
      <div class="item-date">${formatDate(s.sermonDate)}${s.theme ? ' · ' + escHtml(s.theme.slice(0,30)) : ''}</div>
    </div>`).join('');
}

function filterSermons(q) {
  renderSermonsList(allSermons.filter(s =>
    s.title.toLowerCase().includes(q.toLowerCase()) ||
    s.theme.toLowerCase().includes(q.toLowerCase())));
}

// ─── CRUD ──────────────────────────────────────────────────────
async function selectSermon(id) {
  try {
    const s = await SermonsApi.get(id);
    currentSermonId = id;
    document.getElementById('sermonTitle').value     = s.title;
    document.getElementById('sermonDate').value      = s.sermonDate;
    document.getElementById('sermonTheme').value     = s.theme;
    document.getElementById('sermonScripture').value = s.scriptureRef;
    document.getElementById('btnDelete').disabled    = false;
    document.getElementById('timestamps').textContent =
      `Creado: ${new Date(s.createdAt).toLocaleString('es-ES')}  ·  Modificado: ${new Date(s.updatedAt).toLocaleString('es-ES')}`;

    quillIntro.clipboard.dangerouslyPasteHTML(s.introduction || '');
    quillConclusion.clipboard.dangerouslyPasteHTML(s.conclusion || '');
    quillNotes.clipboard.dangerouslyPasteHTML(s.notes || '');

    let points = [];
    try { points = JSON.parse(s.mainPoints || '[]'); } catch {}
    renderPoints(points);

    renderSermonsList(allSermons);
  } catch (e) {
    showToast('Error al cargar sermón: ' + e.message, 'danger');
  }
}

function newSermon() {
  currentSermonId = null;
  document.getElementById('sermonTitle').value      = '';
  document.getElementById('sermonDate').value       = new Date().toISOString().slice(0, 10);
  document.getElementById('sermonTheme').value      = '';
  document.getElementById('sermonScripture').value  = '';
  document.getElementById('btnDelete').disabled     = true;
  document.getElementById('timestamps').textContent = '';
  quillIntro.setContents([]);
  quillConclusion.setContents([]);
  quillNotes.setContents([]);
  renderPoints([]);
  renderSermonsList(allSermons);
}

async function saveSermon() {
  const title      = document.getElementById('sermonTitle').value.trim() || 'Sin título';
  const dateVal    = document.getElementById('sermonDate').value;
  const theme      = document.getElementById('sermonTheme').value;
  const scripture  = document.getElementById('sermonScripture').value;

  if (!dateVal) { showToast('Selecciona una fecha', 'warning'); return; }

  const payload = {
    title,
    sermonDate:   dateVal,
    theme,
    scriptureRef: scripture,
    introduction: quillIntro.root.innerHTML,
    mainPoints:   JSON.stringify(getPoints()),
    conclusion:   quillConclusion.root.innerHTML,
    notes:        quillNotes.root.innerHTML,
    bibleRefs:    [],
  };

  try {
    if (currentSermonId) {
      await SermonsApi.update(currentSermonId, payload);
      showToast('Sermón actualizado');
    } else {
      const created = await SermonsApi.create(payload);
      currentSermonId = created.id;
      document.getElementById('btnDelete').disabled = false;
      showToast('Sermón guardado');
    }
    await loadSermons();
    renderSermonsList(allSermons);
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'danger');
  }
}

async function deleteSermon() {
  if (!currentSermonId) return;
  if (!confirm('¿Eliminar este sermón? Esta acción no se puede deshacer.')) return;
  try {
    await SermonsApi.delete(currentSermonId);
    showToast('Sermón eliminado', 'secondary');
    await loadSermons();
    newSermon();
  } catch (e) {
    showToast('Error al eliminar: ' + e.message, 'danger');
  }
}

// ─── PDF Export ────────────────────────────────────────────────
function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 20;

  const addLine = (text, size, bold, color, indent) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...(color || [30, 30, 30]));
    const lines = doc.splitTextToSize(String(text || ''), contentW - (indent || 0));
    lines.forEach(line => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(line, margin + (indent || 0), y);
      y += size * 0.45;
    });
    y += 2;
  };

  const divider = (color) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setDrawColor(...(color || [200, 150, 12])); doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y); y += 5;
  };

  doc.setFillColor(26, 58, 92);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('ESTUDIO BÍBLICO — Bosquejo de Sermón', margin, 12);
  y = 26;

  const title     = document.getElementById('sermonTitle').value || 'Sin título';
  const date      = document.getElementById('sermonDate').value;
  const scripture = document.getElementById('sermonScripture').value;
  const theme     = document.getElementById('sermonTheme').value;

  addLine(title, 18, true, [26, 58, 92]);
  if (scripture) addLine(`Texto: ${scripture}`, 11, true, [200, 150, 12]);
  addLine(`Fecha: ${formatDate(date)}`, 10, false, [100, 100, 100]);
  if (theme) addLine(`Tema: ${theme}`, 10, false, [80, 80, 80]);
  y += 2; divider();

  addLine('INTRODUCCIÓN', 11, true, [26, 58, 92]);
  addLine(quillIntro.getText().trim() || '(Sin introducción)', 10, false);
  y += 2; divider([180, 180, 180]);

  addLine('PUNTOS PRINCIPALES', 11, true, [26, 58, 92]);
  getPoints().forEach((p, i) => {
    y += 2;
    addLine(`${i + 1}. ${p.title || 'Punto ' + (i+1)}`, 11, true, [26, 58, 92]);
    // Extract plain text from HTML content
    const tmp = document.createElement('div');
    tmp.innerHTML = p.content;
    if (tmp.innerText.trim()) addLine(tmp.innerText.trim(), 10, false, undefined, 5);
  });
  y += 2; divider([180, 180, 180]);

  addLine('CONCLUSIÓN', 11, true, [26, 58, 92]);
  addLine(quillConclusion.getText().trim() || '(Sin conclusión)', 10, false);

  const notesText = quillNotes.getText().trim();
  if (notesText) {
    y += 2; divider([180, 180, 180]);
    addLine('NOTAS DE PREPARACIÓN', 11, true, [26, 58, 92]);
    addLine(notesText, 9, false, [60, 60, 60]);
  }

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Estudio Bíblico — Pág. ${i} de ${pages}`, margin, 290);
    doc.text(new Date().toLocaleDateString('es-ES'), pageW - margin, 290, { align: 'right' });
  }

  doc.save(`sermon-${title.replace(/\s+/g,'-').slice(0,30)}-${date || 'sin-fecha'}.pdf`);
}

// ─── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
