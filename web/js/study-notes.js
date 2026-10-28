// ─── State ────────────────────────────────────────────────────
let allNotes = [];
let currentNoteId = null;
let versions = [];
let quillComments;

const sectionState = { 1: {}, 2: {}, 3: {} };

// ─── Quill toolbar ────────────────────────────────────────────
const FULL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote'],
  ['clean'],
];

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('noteDate').value = new Date().toISOString().slice(0, 10);

  quillComments = new Quill('#noteCommentsEditor', {
    theme: 'snow',
    placeholder: 'Escribe tus notas, reflexiones, observaciones, aplicaciones…',
    modules: { toolbar: FULL_TOOLBAR },
  });

  await loadVersions();
  renderSections();
  await loadNotes();

  // Handle URL params: ?id=X opens that note, ?new=1 starts a new note
  const params = new URLSearchParams(window.location.search);
  if (params.get('new') === '1') {
    newNote();
  } else if (params.get('id')) {
    const id = parseInt(params.get('id'));
    if (allNotes.find(n => n.id === id)) selectNote(id);
    else if (allNotes.length > 0) selectNote(allNotes[0].id);
  } else if (allNotes.length > 0) {
    selectNote(allNotes[0].id);
  }
});

// ─── Versions ──────────────────────────────────────────────────
async function loadVersions() {
  try {
    versions = await BibleApi.versions();
  } catch {
    versions = [
      { id: 'rv1960', name: 'Reina Valera 1960 (RV1960)' },
      { id: 'rv1909', name: 'Reina Valera 1909 (RV1909)' },
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

// ─── Bible Sections ────────────────────────────────────────────
function renderSections() {
  [1, 2, 3].forEach(idx => {
    const container = document.querySelector(`.bible-section[data-section="${idx}"]`);
    container.innerHTML = buildSectionHTML(idx);
    populateBookSelect(container.querySelector(`#secBook${idx}`));
    populateChapterSelect(container.querySelector(`#secChapter${idx}`), 1);
    const vsel = container.querySelector(`#secVersion${idx}`);
    versions.forEach(v => {
      const o = document.createElement('option');
      o.value = v.id; o.textContent = v.name;
      vsel.appendChild(o);
    });
    const s = sectionState[idx];
    if (s.version) vsel.value = s.version;
    if (s.bookNum) {
      container.querySelector(`#secBook${idx}`).value = s.bookNum;
      populateChapterSelect(container.querySelector(`#secChapter${idx}`), s.bookNum);
    }
    if (s.chapter) container.querySelector(`#secChapter${idx}`).value = s.chapter;
    if (s.from)    container.querySelector(`#secFrom${idx}`).value    = s.from;
    if (s.to)      container.querySelector(`#secTo${idx}`).value      = s.to;
    if (s.content) renderVerses(idx, s.content);
  });
}

function buildSectionHTML(idx) {
  return `
  <div class="bible-col-panel">
    <div class="bible-col-header"><i class="bi bi-book me-1"></i>Sección ${idx}</div>
    <div class="bible-col-controls">
      <!-- Fila 1: Versión + Libro -->
      <div class="row g-1 mb-1">
        <div class="col-6">
          <select class="form-select form-select-sm" id="secVersion${idx}" title="Versión">
            <option value="">-- Versión --</option>
          </select>
        </div>
        <div class="col-6">
          <select class="form-select form-select-sm" id="secBook${idx}" onchange="onBookChange(${idx})" title="Libro"></select>
        </div>
      </div>
      <!-- Fila 2: Capítulo + Desde + Hasta -->
      <div class="row g-1 mb-1">
        <div class="col-4">
          <select class="form-select form-select-sm" id="secChapter${idx}" title="Capítulo"></select>
        </div>
        <div class="col-4">
          <input type="number" class="form-control form-control-sm" id="secFrom${idx}"
                 value="1" min="1" placeholder="Desde" title="Versículo desde">
        </div>
        <div class="col-4">
          <input type="number" class="form-control form-control-sm" id="secTo${idx}"
                 value="10" min="1" placeholder="Hasta" title="Versículo hasta">
        </div>
      </div>
      <!-- Fila 3: Botones -->
      <div class="d-flex gap-1">
        <button class="btn btn-primary btn-sm flex-fill" onclick="loadSection(${idx})">
          <i class="bi bi-arrow-down-circle me-1"></i>Cargar
        </button>
        <button class="btn btn-outline-secondary btn-sm" onclick="copySection(${idx})" title="Copiar texto">
          <i class="bi bi-clipboard"></i>
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="clearSection(${idx})" title="Limpiar sección">
          <i class="bi bi-x-circle"></i>
        </button>
      </div>
    </div>
    <div id="secLoading${idx}" class="text-center py-2 d-none px-2">
      <div class="spinner-border spinner-border-sm text-primary me-1"></div><small>Cargando…</small>
    </div>
    <div id="secText${idx}" class="bible-text-area bible-col-text">
      <span class="text-muted small">Selecciona versión, libro y capítulo.</span>
    </div>
  </div>`;
}

function onBookChange(idx) {
  const bookNum = document.getElementById(`secBook${idx}`).value;
  populateChapterSelect(document.getElementById(`secChapter${idx}`), bookNum);
}

async function loadSection(idx) {
  const version = document.getElementById(`secVersion${idx}`).value;
  const bookNum = parseInt(document.getElementById(`secBook${idx}`).value);
  const chapter = parseInt(document.getElementById(`secChapter${idx}`).value);
  const from    = parseInt(document.getElementById(`secFrom${idx}`).value) || 1;
  const to      = parseInt(document.getElementById(`secTo${idx}`).value)   || 999;

  if (!version || !bookNum || !chapter) {
    showToast('Selecciona versión, libro y capítulo', 'warning'); return;
  }
  const bookName = BIBLE_BOOKS.find(b => b.num === bookNum)?.name || '';
  toggleSectionLoading(idx, true);
  try {
    const verses = await BibleApi.chapter(version, bookNum, chapter, from, to);
    sectionState[idx] = { version, bookNum, chapter, from, to, content: verses, bookName };
    renderVerses(idx, verses, version);
    // Update Bible Tools panel
    if (typeof btSetRef === 'function') btSetRef(bookNum, chapter, bookName, from, to);
    if (typeof btShowStrongsPills === 'function' && version === 'kjv') {
      const nums = verses.flatMap(v => [...(v.text || '').matchAll(/<S>(\d+)<\/S>/g)].map(m => m[1]));
      btShowStrongsPills(nums, bookNum >= 40);
    }
  } catch (e) {
    document.getElementById(`secText${idx}`).innerHTML =
      `<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Error: ${e.message}</span>`;
    showToast('No se pudo cargar el texto: ' + e.message, 'danger');
  } finally {
    toggleSectionLoading(idx, false);
  }
}

function toggleSectionLoading(idx, show) {
  document.getElementById(`secLoading${idx}`).classList.toggle('d-none', !show);
  document.getElementById(`secText${idx}`).classList.toggle('d-none', show);
}

const STRONGS_TAGGED_VERSIONS = new Set(['tisch-s', 'wlca']);

function renderVerses(idx, verses, version) {
  const el = document.getElementById(`secText${idx}`);
  const s  = sectionState[idx];
  el.className = 'bible-text-area' + (s.version === 'codex' ? ' rtl' : '');
  if (!verses || verses.length === 0) {
    el.innerHTML = '<span class="text-muted small">No se encontraron versículos.</span>';
    return;
  }
  const isParallel = verses[0].translation !== undefined;
  const stripStrongs = t => (t || '').replace(/<S>\d+<\/S>/g, '');
  const useStrongs = STRONGS_TAGGED_VERSIONS.has(version || s.version);
  const isNT = (s.bookNum || 0) >= 40;

  if (isParallel) {
    el.innerHTML = verses.map(v => `
      <div class="parallel-verse mb-2">
        <div><sup class="verse-num">${v.verse}</sup><span class="verse-greek">${v.text}</span></div>
        <div class="verse-translation-line">${v.translation}</div>
      </div>`).join('');
  } else if (useStrongs && typeof renderStrongsAnnotated === 'function') {
    el.innerHTML = verses.map(v =>
      `<span class="verse-block"><sup class="verse-num">${v.verse}</sup>${renderStrongsAnnotated(v.text, isNT)} </span>`
    ).join('');
  } else {
    el.innerHTML = verses.map(v =>
      `<sup class="verse-num">${v.verse}</sup>${stripStrongs(v.text)} `
    ).join('');
  }
}

function clearSection(idx) {
  sectionState[idx] = {};
  document.getElementById(`secText${idx}`).innerHTML =
    '<span class="text-muted small">Sección limpiada.</span>';
}

function copySection(idx) {
  const el   = document.getElementById(`secText${idx}`);
  const text = el.innerText;
  if (!text.trim() || text.includes('Selecciona')) {
    showToast('No hay texto para copiar', 'warning'); return;
  }
  navigator.clipboard.writeText(text).then(() => showToast('Texto copiado al portapapeles'));
}

// ─── Notes List ────────────────────────────────────────────────
async function loadNotes() {
  try {
    allNotes = await StudyNotesApi.list();
    renderNotesList(allNotes);
  } catch (e) {
    showToast('Error al cargar notas: ' + e.message, 'danger');
  }
}

function renderNotesList(notes) {
  const el = document.getElementById('notesList');
  if (notes.length === 0) {
    el.innerHTML = '<p class="text-muted small p-3">No hay notas. Crea una nueva.</p>';
    return;
  }
  el.innerHTML = notes.map(n => `
    <div class="sidebar-item ${n.id === currentNoteId ? 'active' : ''}" onclick="selectNote(${n.id})">
      <div class="item-title">${escHtml(n.title)}</div>
      <div class="item-date">${formatDate(n.studyDate)}</div>
    </div>`).join('');
}

function filterNotes(q) {
  renderNotesList(allNotes.filter(n => n.title.toLowerCase().includes(q.toLowerCase())));
}

// ─── CRUD ──────────────────────────────────────────────────────
async function selectNote(id) {
  try {
    const note = await StudyNotesApi.get(id);
    currentNoteId = id;
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteDate').value  = note.studyDate;
    document.getElementById('btnDelete').disabled = false;
    document.getElementById('timestamps').textContent =
      `Creada: ${new Date(note.createdAt).toLocaleString('es-ES')}  ·  Modificada: ${new Date(note.updatedAt).toLocaleString('es-ES')}`;

    // Load rich text content
    quillComments.clipboard.dangerouslyPasteHTML(note.comments || '');

    for (let idx = 1; idx <= 3; idx++) {
      const sec = note.bibleSections?.find(s => s.sectionIndex === idx);
      sectionState[idx] = sec?.version
        ? { version: sec.version, bookNum: sec.bookNumber, chapter: sec.chapter,
            from: sec.verseStart, to: sec.verseEnd, content: null, bookName: sec.bookName }
        : {};
    }
    renderSections();
    for (let idx = 1; idx <= 3; idx++) {
      const sec = note.bibleSections?.find(s => s.sectionIndex === idx);
      if (sec?.version && sec?.bookNumber) await loadSection(idx);
    }
    renderNotesList(allNotes);
  } catch (e) {
    showToast('Error al cargar nota: ' + e.message, 'danger');
  }
}

function newNote() {
  currentNoteId = null;
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteDate').value  = new Date().toISOString().slice(0, 10);
  document.getElementById('btnDelete').disabled = true;
  document.getElementById('timestamps').textContent = '';
  quillComments.setContents([]);
  [1, 2, 3].forEach(idx => { sectionState[idx] = {}; });
  renderSections();
  renderNotesList(allNotes);
}

async function saveNote() {
  const title    = document.getElementById('noteTitle').value.trim() || 'Sin título';
  const dateVal  = document.getElementById('noteDate').value;
  const comments = quillComments.root.innerHTML;

  if (!dateVal) { showToast('Selecciona una fecha', 'warning'); return; }

  const bibleSections = [];
  for (let idx = 1; idx <= 3; idx++) {
    const s = sectionState[idx];
    if (s.version) {
      bibleSections.push({
        sectionIndex: idx,
        version:      s.version,
        bookName:     s.bookName  || '',
        bookNumber:   s.bookNum   || 1,
        chapter:      s.chapter   || 1,
        verseStart:   s.from      || 1,
        verseEnd:     s.to        || 1,
        content:      '',
      });
    }
  }

  const payload = { title, studyDate: dateVal, comments, bibleSections };

  try {
    if (currentNoteId) {
      await StudyNotesApi.update(currentNoteId, payload);
      showToast('Nota actualizada');
    } else {
      const created = await StudyNotesApi.create(payload);
      currentNoteId = created.id;
      document.getElementById('btnDelete').disabled = false;
      showToast('Nota guardada');
    }
    await loadNotes();
    renderNotesList(allNotes);
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'danger');
  }
}

async function deleteNote() {
  if (!currentNoteId) return;
  if (!confirm('¿Eliminar esta nota? Esta acción no se puede deshacer.')) return;
  try {
    await StudyNotesApi.delete(currentNoteId);
    showToast('Nota eliminada', 'secondary');
    await loadNotes();
    newNote();
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

  const addText = (text, size, bold, color, indent) => {
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

  doc.setFillColor(26, 58, 92);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('ESTUDIO BÍBLICO — Notas de Estudio', margin, 12);
  y = 26;

  const title    = document.getElementById('noteTitle').value || 'Sin título';
  const date     = document.getElementById('noteDate').value;
  // Extract plain text from Quill for PDF
  const comments = quillComments.getText().trim();

  addText(title, 16, true, [26, 58, 92]);
  addText(`Fecha: ${formatDate(date)}`, 10, false, [100, 100, 100]);
  y += 4;
  doc.setDrawColor(200, 150, 12); doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y); y += 6;

  addText('Comentarios y Reflexiones', 11, true, [26, 58, 92]);
  addText(comments || '(Sin comentarios)', 10, false);
  y += 4;

  [1, 2, 3].forEach(idx => {
    const s = sectionState[idx];
    if (!s.version || !s.content) return;
    const vName = versions.find(v => v.id === s.version)?.name || s.version;
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFillColor(234, 241, 251);
    doc.rect(margin - 2, y - 4, contentW + 4, 8, 'F');
    addText(`Sección ${idx}: ${s.bookName} ${s.chapter}:${s.from}–${s.to} (${vName})`, 10, true, [26, 58, 92]);
    addText(s.content.map(v => `${v.verse}. ${v.text}`).join(' '), 9, false, [40, 40, 40]);
    y += 4;
  });

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Estudio Bíblico — Pág. ${i} de ${pages}`, margin, 290);
    doc.text(new Date().toLocaleDateString('es-ES'), pageW - margin, 290, { align: 'right' });
  }
  doc.save(`nota-estudio-${date || 'sin-fecha'}.pdf`);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
