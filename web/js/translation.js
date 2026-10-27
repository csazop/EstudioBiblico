// ── Translation Module ────────────────────────────────────────────
// Translates Spanish content (notes or sermons) into EN / JA / ZH / KO
// using the backend proxy to MyMemory free API.

const TRANS_LANGS = [
  { code: 'en', label: 'English',    flag: '🇺🇸', latinSafe: true  },
  { code: 'fr', label: 'Français',   flag: '🇫🇷', latinSafe: true  },
  { code: 'de', label: 'Deutsch',    flag: '🇩🇪', latinSafe: true  },
  { code: 'it', label: 'Italiano',   flag: '🇮🇹', latinSafe: true  },
  { code: 'pt', label: 'Português',  flag: '🇧🇷', latinSafe: true  },
  { code: 'ru', label: 'Русский',    flag: '🇷🇺', latinSafe: false },
  { code: 'tl', label: 'Tagalog',    flag: '🇵🇭', latinSafe: true  },
  { code: 'ja', label: '日本語',      flag: '🇯🇵', latinSafe: false },
  { code: 'zh', label: '中文',        flag: '🇨🇳', latinSafe: false },
  { code: 'ko', label: '한국어',      flag: '🇰🇷', latinSafe: false },
];

let _transResults   = {};  // { langCode: translatedText }
let _transSourceTxt = '';  // plain-text source sent to the API

// ── Open modal ────────────────────────────────────────────────────
function openTranslationModal() {
  const text = _extractTranslatableText();
  if (!text.trim()) {
    showToast('No hay texto para traducir. Escribe algún contenido primero.', 'warning');
    return;
  }

  _transSourceTxt = text;
  _transResults   = {};

  // Source preview
  const preview = document.getElementById('transSourcePreview');
  if (preview) preview.textContent = text.length > 300 ? text.slice(0, 300) + '…' : text;

  // Clear previous results
  document.getElementById('transResults').innerHTML = '';

  // Reset translate-all button
  const btn = document.getElementById('btnTranslateAll');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-translate me-1"></i>Traducir a todos los idiomas';
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('translationModal')).show();
}

// ── Extract text based on current page ───────────────────────────
function _extractTranslatableText() {
  const parts = [];

  // ── Study-notes page ──────────────────────────────────────────
  if (typeof quillComments !== 'undefined' && quillComments) {
    const title = (document.getElementById('noteTitle')?.value || '').trim();
    if (title) parts.push(title);
    const body = quillComments.getText().trim();
    if (body) parts.push(body);
    return parts.join('\n\n');
  }

  // ── Sermon-prep page ─────────────────────────────────────────
  if (typeof quillIntro !== 'undefined') {
    const title = (document.getElementById('sermonTitle')?.value || '').trim();
    if (title) parts.push(title);

    const theme = (document.getElementById('sermonTheme')?.value || '').trim();
    if (theme) parts.push('Tema: ' + theme);

    const scripture = (document.getElementById('sermonScripture')?.value || '').trim();
    if (scripture) parts.push('Texto base: ' + scripture);

    if (quillIntro) {
      const t = quillIntro.getText().trim();
      if (t) parts.push('Introducción:\n' + t);
    }

    // Main points — container id is "point-N", class is "sermon-point"
    if (typeof pointEditors !== 'undefined' && pointEditors.size > 0) {
      let ptIdx = 1;
      pointEditors.forEach((ed, id) => {
        // id is the .sermon-point div id (e.g. "point-1")
        const container = document.getElementById(id);
        const ptTitle = container?.querySelector('.point-title')?.value?.trim() || `Punto ${ptIdx}`;
        const ptText  = ed.getText().trim();
        if (ptText) parts.push(`${ptTitle}:\n${ptText}`);
        ptIdx++;
      });
    }

    if (typeof quillConclusion !== 'undefined' && quillConclusion) {
      const t = quillConclusion.getText().trim();
      if (t) parts.push('Conclusión:\n' + t);
    }

    if (typeof quillNotes !== 'undefined' && quillNotes) {
      const t = quillNotes.getText().trim();
      if (t) parts.push('Notas:\n' + t);
    }

    return parts.join('\n\n');
  }

  return '';
}

// ── Translate all languages sequentially ─────────────────────────
async function translateAll() {
  const btn = document.getElementById('btnTranslateAll');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Traduciendo…';

  const container = document.getElementById('transResults');
  container.innerHTML = '';

  // Create all cards upfront with loading state
  TRANS_LANGS.forEach(lang => container.appendChild(_createLangCard(lang, true)));

  // Translate one by one with a small gap to avoid 429 rate-limit
  for (const lang of TRANS_LANGS) {
    await _doTranslate(lang);
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-translate me-1"></i>Traducir a todos los idiomas';
}

// ── Translate a single language (from individual flag buttons) ────
async function translateSingleFull(langCode) {
  const lang = TRANS_LANGS.find(l => l.code === langCode);
  if (!lang) return;

  const container = document.getElementById('transResults');
  if (!document.getElementById(`transCard_${langCode}`)) {
    // Create card already in loading state
    container.appendChild(_createLangCard(lang, true));
  } else {
    _setCardLoading(langCode);
  }

  await _doTranslate(lang);
}

// ── Translate a single language (from card retry button) ──────────
async function translateSingle(langCode) {
  const lang = TRANS_LANGS.find(l => l.code === langCode);
  if (!lang) return;
  _setCardLoading(langCode);
  await _doTranslate(lang);
}

// ── Core translate call (handles chunking on the frontend) ────────
// Each chunk is sent as a separate request so no single backend call
// exceeds a few seconds — avoids any proxy timeout.
const _CHUNK_SIZE = 4000; // Google handles up to ~5000 chars; MyMemory fallback truncates internally

async function _doTranslate(lang) {
  const chunks = _splitIntoChunks(_transSourceTxt, _CHUNK_SIZE);
  const parts  = [];

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (chunks.length > 1) _setCardProgress(lang.code, i + 1, chunks.length);
      const result = await TranslationApi.translate(chunks[i], lang.code);
      parts.push(result.translatedText);
    }
    const full = parts.join(' ');
    _transResults[lang.code] = full;
    _setCardContent(lang.code, full);
  } catch (e) {
    _setCardError(lang.code, e.message);
  }
}

// Split text on sentence/word boundaries
function _splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    const win = remaining.slice(0, maxLen);
    let cut = -1;
    // Prefer sentence boundary
    for (let i = win.length - 1; i >= Math.floor(maxLen / 2); i--) {
      if ('.!?\n'.includes(win[i])) { cut = i + 1; break; }
    }
    // Fall back to word boundary
    if (cut < 0) {
      for (let i = win.length - 1; i >= Math.floor(maxLen / 2); i--) {
        if (win[i] === ' ') { cut = i; break; }
      }
    }
    if (cut < 0) cut = maxLen;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}

// ── Card DOM helpers ──────────────────────────────────────────────
function _createLangCard(lang, loading) {
  const div = document.createElement('div');
  div.className = 'trans-card';
  div.id = `transCard_${lang.code}`;
  div.innerHTML = `
    <div class="trans-card-header">
      <span class="trans-lang-label">
        ${lang.flag} <strong>${lang.label}</strong>
        <small class="text-muted ms-1">${lang.code.toUpperCase()}</small>
      </span>
      <div class="d-flex gap-1">
        <button class="btn btn-xs btn-outline-secondary"
                onclick="translateSingle('${lang.code}')" title="Reintentar">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        <button class="btn btn-xs btn-outline-secondary"
                onclick="copyTranslation('${lang.code}')" title="Copiar">
          <i class="bi bi-clipboard"></i>
        </button>
        <button class="btn btn-xs btn-outline-secondary"
                onclick="exportTranslationPDF('${lang.code}')" title="PDF">
          <i class="bi bi-file-earmark-pdf"></i>
        </button>
      </div>
    </div>
    <div class="trans-card-body" id="transBody_${lang.code}">
      ${loading ? '<div class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary"></span></div>' : ''}
    </div>`;
  return div;
}

function _setCardLoading(langCode) {
  const body = document.getElementById(`transBody_${langCode}`);
  if (body) body.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary"></span></div>';
}

function _setCardProgress(langCode, current, total) {
  const body = document.getElementById(`transBody_${langCode}`);
  if (body) body.innerHTML = `
    <div class="text-center py-3">
      <span class="spinner-border spinner-border-sm text-primary me-2"></span>
      <span class="text-muted small">Fragmento ${current} de ${total}…</span>
    </div>`;
}

function _setCardContent(langCode, text) {
  const body = document.getElementById(`transBody_${langCode}`);
  if (body) body.textContent = text;
}

function _setCardError(langCode, message) {
  const body = document.getElementById(`transBody_${langCode}`);
  if (body) body.innerHTML =
    `<div class="text-danger small"><i class="bi bi-exclamation-circle me-1"></i>${_escHtml(message)}</div>`;
}

// ── Actions ───────────────────────────────────────────────────────
function copyTranslation(langCode) {
  const text = _transResults[langCode];
  if (!text) { showToast('Aún no hay traducción. Haz clic en "Traducir" primero.', 'warning'); return; }
  navigator.clipboard.writeText(text)
    .then(()  => showToast('Traducción copiada al portapapeles.', 'success'))
    .catch(()  => showToast('No se pudo acceder al portapapeles.', 'danger'));
}

function exportTranslationPDF(langCode) {
  const lang = TRANS_LANGS.find(l => l.code === langCode);
  const text = _transResults[langCode];
  if (!text || !lang) { showToast('Aún no hay traducción para exportar.', 'warning'); return; }

  // jsPDF's built-in helvetica only supports Latin characters.
  // CJK scripts (ja, zh, ko) require an embedded font — warn the user instead.
  if (!lang.latinSafe) {
    showToast(
      `PDF no disponible para ${lang.label}: jsPDF no soporta caracteres CJK sin fuente embebida. Usa "Copiar" y pégalo en tu editor favorito.`,
      'warning'
    );
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF({ unit: 'pt', format: 'letter' });
  const title = (
    document.getElementById('noteTitle')?.value ||
    document.getElementById('sermonTitle')?.value ||
    'Traducción'
  ).trim();
  const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(26, 58, 92);
  doc.text(title, 40, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`${lang.label} (${lang.code.toUpperCase()})  -  ${date}`, 40, 68);

  doc.setDrawColor(200, 200, 200);
  doc.line(40, 75, 570, 75);

  // Body
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, 530);
  doc.text(lines, 40, 92);

  doc.save(`translation_${langCode}_${Date.now()}.pdf`);
}

// ── Tiny helper ───────────────────────────────────────────────────
function _escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
