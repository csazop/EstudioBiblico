// ── Spell Check Module ────────────────────────────────────────────
// Uses LanguageTool public REST API — free, no registration, CORS-enabled.
// https://api.languagetool.org/v2/check  — Max ~20 000 chars/request (free tier)

const LT_API       = 'https://api.languagetool.org/v2/check';
const LT_MAX_CHARS = 20000;

let _scMatches  = [];  // LanguageTool match objects, each with a unique _scId
let _scText     = '';  // plain text sent to LT (may be multi-section join)
let _scSections = [];  // [{quill, label, start, end, quillLeadOffset}]
let _scNextId   = 0;   // monotonic ID so onclick never uses stale array indices

// ── Open modal ────────────────────────────────────────────────────
function openSpellcheck() {
  _scPopulateSources();
  document.getElementById('scResults').innerHTML = '';
  _scClearFeedback();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('spellcheckModal')).show();
}

// ── Build source dropdown ─────────────────────────────────────────
function _scPopulateSources() {
  const sel = document.getElementById('scSource');
  sel.innerHTML = '';
  const add = (value, label) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    sel.appendChild(o);
  };

  if (typeof quillComments !== 'undefined') {
    add('comments', 'Comentarios y reflexiones');
    return;
  }
  if (typeof quillIntro !== 'undefined') {
    add('all', 'Todo el contenido del sermón');
    add('intro', 'Introducción');
    if (typeof pointEditors !== 'undefined') {
      let n = 1;
      pointEditors.forEach((_, id) => {
        const lbl = document.getElementById(id)
          ?.querySelector('.point-title')?.value?.trim() || `Punto ${n}`;
        add(`point:${id}`, lbl);
        n++;
      });
    }
    add('conclusion', 'Conclusión');
    add('notes', 'Notas personales');
  }
}

// ── Build plain text + section map ───────────────────────────────
function _scBuildText() {
  _scText     = '';
  _scSections = [];
  const sel   = document.getElementById('scSource')?.value;

  // Appends one Quill editor as a named section and records its byte range in _scText
  const addSec = (quill, label) => {
    if (!quill) return;
    const raw  = quill.getText();                          // always ends with \n
    const lead = raw.length - raw.trimStart().length;      // leading chars stripped by trim
    const txt  = raw.trim();
    if (!txt) return;
    if (_scText) _scText += '\n\n';                        // section separator
    const start = _scText.length;
    _scText += txt;
    _scSections.push({ quill, label, start, end: start + txt.length, quillLeadOffset: lead });
  };

  if (typeof quillComments !== 'undefined') { addSec(quillComments, 'Comentarios'); return; }
  if (typeof quillIntro     === 'undefined') return;

  if (sel === 'all') {
    addSec(quillIntro, 'Introducción');
    if (typeof pointEditors !== 'undefined') {
      let n = 1;
      pointEditors.forEach((ed, id) => {
        const lbl = document.getElementById(id)
          ?.querySelector('.point-title')?.value?.trim() || `Punto ${n}`;
        addSec(ed, lbl);
        n++;
      });
    }
    addSec(quillConclusion, 'Conclusión');
    addSec(quillNotes,      'Notas');
    return;
  }

  if (sel === 'intro')           { addSec(quillIntro,      'Introducción'); return; }
  if (sel === 'conclusion')      { addSec(quillConclusion, 'Conclusión');   return; }
  if (sel === 'notes')           { addSec(quillNotes,      'Notas');        return; }
  if (sel?.startsWith('point:')) { addSec(pointEditors?.get(sel.slice(6)), 'Punto'); }
}

// ── Find section that owns a given offset in _scText ─────────────
function _scResolve(offset) {
  if (_scSections.length === 1) return _scSections[0];
  return _scSections.find(s => offset >= s.start && offset < s.end) ?? null;
}

// ── Call LanguageTool ─────────────────────────────────────────────
async function runSpellcheck() {
  _scBuildText();
  if (!_scText.trim()) {
    showToast('No hay texto para revisar en la sección seleccionada.', 'warning');
    return;
  }

  let text = _scText, truncated = false;
  if (text.length > LT_MAX_CHARS) { text = text.slice(0, LT_MAX_CHARS); truncated = true; }

  const lang = document.getElementById('scLang')?.value || 'auto';
  const btn  = document.getElementById('scBtnCheck');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Revisando…';
  document.getElementById('scResults').innerHTML =
    '<div class="text-center py-3 text-muted small">' +
    '<div class="spinner-border spinner-border-sm me-1"></div>Conectando con LanguageTool…</div>';
  _scClearFeedback();

  try {
    const params = new URLSearchParams();
    params.set('text', text);
    params.set('language', lang);
    const resp = await fetch(LT_API, { method: 'POST', headers: { Accept: 'application/json' }, body: params });
    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json()).message || ''; } catch {}
      throw new Error(detail || `HTTP ${resp.status}`);
    }

    const data  = await resp.json();
    // Stamp each match with a stable unique ID
    _scMatches  = (data.matches || []).map(m => ({ ...m, _scId: _scNextId++ }));
    if (truncated) _scMatches.push({ _isTruncWarning: true, _scId: _scNextId++,
      message: `El texto supera ${LT_MAX_CHARS.toLocaleString()} caracteres. Solo se revisaron los primeros ${LT_MAX_CHARS.toLocaleString()}.` });
    _scRenderResults();
  } catch (e) {
    document.getElementById('scResults').innerHTML = `
      <div class="alert alert-danger py-2 px-3 small mb-0">
        <i class="bi bi-exclamation-circle me-1"></i><strong>No se pudo revisar el texto.</strong><br>
        <span class="text-muted">${_scEsc(e.message || 'Error desconocido')}</span><br>
        <span class="text-muted" style="font-size:.78rem">
          Si el problema persiste, prueba <em>Detección automática</em> como idioma.
        </span>
      </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-spell-check me-1"></i>Revisar texto';
  }
}

// ── Render match list ─────────────────────────────────────────────
function _scRenderResults() {
  const container  = document.getElementById('scResults');
  const realMatches = _scMatches.filter(m => !m._isTruncWarning);

  if (realMatches.length === 0 && !_scMatches.find(m => m._isTruncWarning)) {
    container.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-check-circle-fill text-success" style="font-size:2.5rem;display:block;margin-bottom:.5rem"></i>
        <strong>¡Sin errores encontrados!</strong>
        <p class="text-muted small mt-1 mb-0">El texto parece correcto ortográfica y gramaticalmente.</p>
      </div>`;
    return;
  }

  if (realMatches.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-check-circle-fill text-success" style="font-size:2.5rem;display:block;margin-bottom:.5rem"></i>
        <strong>¡Todas las correcciones aplicadas!</strong>
        <p class="text-muted small mt-1 mb-0">El texto ha sido corregido directamente en el editor.</p>
        <button class="btn btn-success btn-sm mt-3"
          onclick="bootstrap.Modal.getOrCreateInstance(document.getElementById('spellcheckModal')).hide()">
          <i class="bi bi-check2 me-1"></i>Cerrar y ver el resultado
        </button>
      </div>`;
    return;
  }

  const counts = {};
  realMatches.forEach(m => { const c = m.rule?.category?.name || 'Otro'; counts[c] = (counts[c]||0)+1; });
  const badges = Object.entries(counts)
    .map(([c, n]) => `<span class="badge bg-warning text-dark">${c}: ${n}</span>`).join(' ');
  const multiSec = _scSections.length > 1;

  let html = `
    <div class="alert alert-warning py-2 px-3 mb-3 d-flex flex-wrap gap-2 align-items-center" style="font-size:.82rem">
      <i class="bi bi-exclamation-triangle me-1"></i>
      <strong>${realMatches.length} sugerencia${realMatches.length !== 1 ? 's' : ''}:</strong>
      ${badges}
      <span class="text-muted ms-auto small">Haz clic en una corrección para aplicarla.</span>
    </div>`;

  html += _scMatches.map(m => {
    if (m._isTruncWarning) return `
      <div class="alert alert-warning py-2 px-3 small mb-2">
        <i class="bi bi-scissors me-1"></i>${_scEsc(m.message)}
      </div>`;

    const s0     = Math.max(0, m.offset - 55);
    const s1     = Math.min(_scText.length, m.offset + m.length + 55);
    const before = _scText.substring(s0, m.offset);
    const error  = _scText.substring(m.offset, m.offset + m.length);
    const after  = _scText.substring(m.offset + m.length, s1);
    const repls  = (m.replacements || []).slice(0, 5);
    const sec    = _scResolve(m.offset);
    const secBadge = (multiSec && sec)
      ? `<span class="badge bg-secondary ms-1" style="font-size:.68rem">${_scEsc(sec.label)}</span>` : '';

    // Use stable _scId — survives any array re-ordering
    const id = m._scId;

    return `
    <div class="sc-match mb-2" id="scMatch_${id}">
      <div class="sc-context">
        ${s0 > 0 ? '<span class="text-muted">…</span>' : ''}
        <span class="text-muted">${_scEsc(before)}</span><mark class="sc-error">${_scEsc(error)}</mark><span class="text-muted">${_scEsc(after)}</span>
        ${s1 < _scText.length ? '<span class="text-muted">…</span>' : ''}
        ${secBadge}
      </div>
      <div class="sc-message mt-1">
        <i class="bi bi-info-circle me-1 text-warning"></i>${_scEsc(m.message)}
      </div>
      ${repls.length
        ? `<div class="mt-1 d-flex flex-wrap gap-1 align-items-center">
             <small class="text-muted me-1">Aplicar:</small>
             ${repls.map(r =>
               `<span class="sc-suggestion" onclick="scApply(${id}, ${JSON.stringify(r.value)})">${_scEsc(r.value)}</span>`
             ).join('')}
           </div>`
        : '<div class="text-muted small mt-1"><i class="bi bi-hand-thumbs-up me-1"></i>Sin sugerencias de reemplazo.</div>'}
    </div>`;
  }).join('');

  container.innerHTML = html;
}

// ── Apply suggestion to Quill editor ─────────────────────────────
function scApply(scId, replacement) {
  // Find match by stable ID (immune to array index shifts)
  const matchIdx = _scMatches.findIndex(m => m._scId === scId);
  if (matchIdx === -1) return;
  const m = _scMatches[matchIdx];
  if (!m || m._isTruncWarning) return;

  const section = _scResolve(m.offset);
  if (!section) {
    _scShowFeedback('No se pudo identificar la sección del error.', 'danger');
    return;
  }

  // Map the position in the joined _scText → position inside the Quill document.
  // section.quillLeadOffset: characters trimmed from the start of quill.getText()
  const quillOffset = (m.offset - section.start) + section.quillLeadOffset;

  try {
    // Apply the correction directly in the Quill editor
    section.quill.deleteText(quillOffset, m.length, 'user');
    section.quill.insertText(quillOffset, replacement, 'user');

    // Keep _scText in sync with the edit
    _scText = _scText.slice(0, m.offset) + replacement + _scText.slice(m.offset + m.length);
    const delta = replacement.length - m.length;

    // Shift offsets of remaining matches and section boundaries
    _scMatches.forEach((match, idx) => {
      if (idx !== matchIdx && !match._isTruncWarning && match.offset > m.offset)
        match.offset += delta;
    });
    _scSections.forEach(s => {
      if (s.start > m.offset)      { s.start += delta; s.end += delta; }
      else if (s.end > m.offset)   { s.end += delta; }
    });

    // Remove the resolved match and re-render the list
    _scMatches.splice(matchIdx, 1);

    // Show inline feedback inside the modal (visible above everything)
    const secName = section.label || 'el editor';
    _scShowFeedback(
      `<i class="bi bi-check-circle-fill me-1"></i>
       "<strong>${_scEsc(replacement)}</strong>" aplicado en <strong>${_scEsc(secName)}</strong>.
       <button class="btn btn-sm btn-outline-success ms-2 py-0"
         onclick="bootstrap.Modal.getOrCreateInstance(document.getElementById('spellcheckModal')).hide()">
         Ver en editor
       </button>`,
      'success'
    );

    _scRenderResults();
  } catch (e) {
    _scShowFeedback(`Error al aplicar: ${_scEsc(e.message)}`, 'danger');
  }
}

// ── Inline feedback bar inside the modal ─────────────────────────
function _scShowFeedback(html, type) {
  const el = document.getElementById('scFeedback');
  if (!el) return;
  el.className = `alert alert-${type} py-2 px-3 mb-2 small d-flex align-items-center gap-2`;
  el.innerHTML = html;
  el.style.display = '';
  // Auto-hide after 4 s
  clearTimeout(_scShowFeedback._timer);
  _scShowFeedback._timer = setTimeout(_scClearFeedback, 4000);
}

function _scClearFeedback() {
  const el = document.getElementById('scFeedback');
  if (el) el.style.display = 'none';
}

function _scEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
