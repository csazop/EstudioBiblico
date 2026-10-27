// ── Bible Tools: Commentary & Strong's Dictionary ─────────────────────────
// Commentary  → BibleHub iframe modal, served through /api/commentary/page (same origin)
//               so its text can be translated to Spanish in place
// Dictionary  → Strong's Concordance G#### / H#### via backend (OpenScriptures, public domain)

// BibleHub URL slugs indexed by book number (1–66)
const BH_SLUGS = [
  null,
  'genesis','exodus','leviticus','numbers','deuteronomy',
  'joshua','judges','ruth','1_samuel','2_samuel',
  '1_kings','2_kings','1_chronicles','2_chronicles','ezra',
  'nehemiah','esther','job','psalms','proverbs',
  'ecclesiastes','songs','isaiah','jeremiah','lamentations',
  'ezekiel','daniel','hosea','joel','amos',
  'obadiah','jonah','micah','nahum','habakkuk',
  'zephaniah','haggai','zechariah','malachi',
  'matthew','mark','luke','john','acts',
  'romans','1_corinthians','2_corinthians','galatians','ephesians',
  'philippians','colossians','1_thessalonians','2_thessalonians',
  '1_timothy','2_timothy','titus','philemon','hebrews',
  'james','1_peter','2_peter','1_john','2_john',
  '3_john','jude','revelation',
];

// Classic commentaries — keys verified against BibleHub (all return 200)
const COMMENTARIES = [
  { key: 'mhc',      label: 'Matthew Henry',          year: '1706', desc: 'El comentario devocional más clásico del protestantismo' },
  { key: 'gill',     label: 'John Gill',               year: '1748', desc: 'Exposición profunda versículo por versículo, orientación bautista' },
  { key: 'barnes',   label: 'Albert Barnes',           year: '1832', desc: 'Notas de referencia accesibles para NT y AT' },
  { key: 'jfb',      label: 'Jamieson-Fausset-Brown',  year: '1871', desc: 'Comentario crítico y explicativo completo' },
  { key: 'ellicott', label: 'Ellicott',                year: '1878', desc: 'Comentario para lectores de la Biblia inglesa' },
  { key: 'benson',   label: 'Joseph Benson',           year: '1857', desc: 'Notas y reflexiones bíblicas extensas' },
  { key: 'poole',    label: 'Matthew Poole',           year: '1685', desc: 'Sinopsis de comentaristas puritanos' },
  { key: 'cambridge',label: 'Cambridge Bible',         year: '1882', desc: 'Comentario académico para colegios y escuelas' },
  { key: 'meyer',    label: 'Meyer\'s NT Commentary',  year: '1832', desc: 'Análisis exegético detallado del Nuevo Testamento' },
  { key: 'pulpit',   label: 'Pulpit Commentary',       year: '1880', desc: 'Comentario homiléticco extenso para predicadores' },
];

// Current passage reference (updated by study-notes.js / sermon-prep.js)
let _btRef = { bookNum: 0, chapter: 0, bookName: '', fromVerse: 0, toVerse: 0 };

/** Called from study-notes.js / sermon-prep.js after a Bible section loads */
function btSetRef(bookNum, chapter, bookName, fromVerse, toVerse) {
  _btRef = { bookNum, chapter, bookName, fromVerse, toVerse };
  _btRenderCommentary();
}

// ── Commentary ─────────────────────────────────────────────────────────────

function _btRenderCommentary() {
  const el = document.getElementById('btCommentary');
  if (!el) return;

  const { bookNum, chapter, bookName, fromVerse, toVerse } = _btRef;

  if (!bookNum || !chapter) {
    el.innerHTML = `<p class="text-muted small py-2 mb-0">
      <i class="bi bi-info-circle me-1"></i>Carga un pasaje en alguna de las columnas para ver los comentarios disponibles.
    </p>`;
    return;
  }

  const slug   = BH_SLUGS[bookNum];
  const refStr = fromVerse
    ? `${bookName} ${chapter}:${fromVerse}${toVerse && toVerse !== fromVerse ? '–' + toVerse : ''}`
    : `${bookName} ${chapter}`;

  const cards = COMMENTARIES.map(c => `
    <button class="bt-comm-card" onclick="openCommentaryModal('${c.key}','${c.label.replace(/'/g, "\\'")}')">
      <div class="bt-comm-name">${c.label} <span class="text-muted small fw-normal">(${c.year})</span></div>
      <div class="bt-comm-desc">${c.desc}</div>
    </button>`
  ).join('');

  // "All" button opens the verse page which shows every commentator for that verse
  const verseNum = fromVerse || 1;
  const verseUrl = `https://biblehub.com/${slug}/${chapter}-${verseNum}.htm`;

  el.innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
      <span class="badge bg-primary">${refStr}</span>
      <button class="btn btn-outline-primary btn-sm ms-auto"
              onclick="openCommentaryModal('__verse__','Todos los comentarios')">
        <i class="bi bi-collection me-1"></i>Ver todos los comentarios
      </button>
    </div>
    <div class="bt-comm-grid">${cards}</div>
    <div class="alert alert-light border py-1 px-2 mt-2 mb-0" style="font-size:.76rem">
      <i class="bi bi-info-circle me-1 text-primary"></i>
      Comentarios de <strong>dominio público</strong> (s. XVII–XIX) alojados en BibleHub — gratuitos, sin registro.
    </div>`;
}

// ── Modal ──────────────────────────────────────────────────────────────────

function openCommentaryModal(key, label) {
  const { bookNum, chapter, fromVerse } = _btRef;
  const slug = BH_SLUGS[bookNum];

  if (!bookNum || !slug) {
    showToast('Carga un pasaje primero para abrir el comentario.', 'warning');
    return;
  }

  const verseNum = fromVerse || 1;
  const url = key === '__verse__'
    ? `https://biblehub.com/${slug}/${chapter}-${verseNum}.htm`
    : `https://biblehub.com/commentaries/${key}/${slug}/${chapter}.htm`;

  const refStr = fromVerse
    ? `${_btRef.bookName} ${chapter}:${verseNum}`
    : `${_btRef.bookName} ${chapter}`;

  const titleEl = document.getElementById('commModalTitle');
  if (titleEl) titleEl.textContent = `${label} — ${refStr}`;

  const modalEl = document.getElementById('commentaryModal');
  if (!modalEl.dataset.btBound) {
    modalEl.dataset.btBound = '1';
    // Cancel any translation in progress when the modal closes
    modalEl.addEventListener('hidden.bs.modal', () => { _btComm.gen++; });
  }
  bootstrap.Modal.getOrCreateInstance(modalEl).show();

  // Load iframe after modal shows (avoids layout flash)
  setTimeout(() => _btLoadCommentary(url), 200);
}

// ── Commentary translation ─────────────────────────────────────────────────
// The page is proxied by the backend (scripts removed) so the parent can walk its
// text nodes and replace them with the Spanish translation. Google Translate is
// called straight from the browser (CORS allowed); the backend is the fallback.

const BT_LANG_KEY = 'bt-commentary-spanish';
const BT_BATCH_CHARS = 3500;
const BT_BATCH_ITEMS = 120;
const BT_PARALLEL = 3;
const BT_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'PRE', 'CODE', 'TEXTAREA', 'SELECT', 'OPTION']);

const _btComm = {
  gen: 0,           // bumps on every load/close to cancel stale translations
  url: '',
  nodes: [],        // [{ node, original, translated }]
  translated: false,
  busy: false,      // a translation pass is running for the current page
  wantSpanish: (() => {
    try { return localStorage.getItem(BT_LANG_KEY) !== '0'; } catch { return true; }
  })(),
};

function _btLoadCommentary(url) {
  const frameEl = document.getElementById('commModalFrame');
  const loadEl  = document.getElementById('commModalLoading');
  const linkEl  = document.getElementById('commModalLink');
  if (!frameEl) return;

  const gen = ++_btComm.gen;
  _btComm.url = url;
  _btComm.nodes = [];
  _btComm.translated = false;
  _btComm.busy = false;
  if (linkEl) linkEl.href = url;
  _btSetLoadingText('Cargando comentario…');
  _btSetStatus('');
  _btUpdateTranslateBtn(false);

  frameEl.classList.add('d-none');
  loadEl?.classList.remove('d-none');

  const proxyUrl = `/api/commentary/page?url=${encodeURIComponent(url)}`;
  let started = false;
  const start = () => {
    if (started || gen !== _btComm.gen) return;
    started = true;
    const doc = _btFrameDoc(frameEl);
    if (!doc) {
      // Proxy unavailable: show the original page directly (no translation)
      frameEl.onload = () => { if (gen === _btComm.gen) _btShowFrame(); };
      frameEl.src = url;
      _btSetStatus('Traducción no disponible');
      return;
    }
    doc.addEventListener('click', _btOnFrameClick);
    _btComm.nodes = _btCollectTextNodes(doc);
    _btUpdateTranslateBtn(_btComm.nodes.length > 0);
    if (_btComm.wantSpanish && _btComm.nodes.length) {
      _btTranslateCommentary(gen);
    } else {
      _btShowFrame();
    }
  };

  // Start as soon as the proxied DOM is parsed; images/CSS from BibleHub can be slow
  frameEl.onload = start;
  const poll = setInterval(() => {
    if (started || gen !== _btComm.gen) { clearInterval(poll); return; }
    try {
      const doc = frameEl.contentDocument;
      if (doc && doc.URL.endsWith(proxyUrl) && doc.readyState !== 'loading') start();
    } catch { /* cross-origin: wait for onload */ }
  }, 150);
  frameEl.src = proxyUrl;
}

// Same-origin proxied HTML document, or null (proxy error / direct BibleHub page)
function _btFrameDoc(frameEl) {
  try {
    const doc = frameEl.contentDocument;
    return doc && doc.contentType === 'text/html' && doc.body ? doc : null;
  } catch { return null; }
}

function _btShowFrame() {
  document.getElementById('commModalLoading')?.classList.add('d-none');
  document.getElementById('commModalFrame')?.classList.remove('d-none');
}

// Links to other BibleHub pages stay inside the modal (and get translated too)
function _btOnFrameClick(e) {
  const a = e.target.closest?.('a[href]');
  if (!a) return;
  let target;
  try { target = new URL(a.href); } catch { return; }
  if (!/^(www\.)?biblehub\.com$/i.test(target.hostname) || !/\.htm$/i.test(target.pathname)) return;
  e.preventDefault();
  _btLoadCommentary(`https://biblehub.com${target.pathname}${target.search}`);
}

function _btCollectTextNodes(doc) {
  const out = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue;
      // Skip whitespace, verse numbers and punctuation-only fragments
      if (!text || !/\p{L}{2,}/u.test(text)) return NodeFilter.FILTER_REJECT;
      for (let el = node.parentElement; el && el !== doc.body; el = el.parentElement) {
        if (BT_SKIP_TAGS.has(el.tagName) || el.getAttribute('translate') === 'no') {
          return NodeFilter.FILTER_REJECT;
        }
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    out.push({ node: n, original: n.nodeValue, translated: null });
  }
  return out;
}

async function _btTranslateCommentary(gen) {
  const entries = _btComm.nodes;
  const pending = entries.filter(e => e.translated === null);

  if (pending.length) {
    _btComm.busy = true;
    _btSetLoadingText('Traduciendo al español…');
    // Each entry is sent as one or more lines (very long paragraphs are split)
    const batches = [];
    let cur = [], size = 0, lines = 0;
    for (const e of pending) {
      const parts = _btSplitLong(_btSquash(e.original));
      const len = parts.reduce((n, p) => n + p.length + 1, 0);
      if (cur.length && (size + len > BT_BATCH_CHARS || lines + parts.length > BT_BATCH_ITEMS)) {
        batches.push(cur); cur = []; size = 0; lines = 0;
      }
      cur.push({ e, parts }); size += len; lines += parts.length;
    }
    if (cur.length) batches.push(cur);

    let done = 0, failed = 0, firstShown = false;
    const total = batches.length;
    const worker = async () => {
      while (batches.length) {
        const batch = batches.shift();
        try {
          const texts = await _btTranslateTexts(batch.flatMap(b => b.parts));
          if (gen !== _btComm.gen) return;
          let i = 0;
          for (const { e, parts } of batch) {
            e.translated = _btKeepSpacing(e.original, texts.slice(i, i += parts.length).join(' '));
            if (_btComm.wantSpanish) e.node.nodeValue = e.translated;
          }
        } catch {
          failed++;
        }
        if (gen !== _btComm.gen) return;
        done++;
        // Reveal the page once the first (top) batch is in Spanish
        if (!firstShown) { firstShown = true; _btShowFrame(); }
        _btSetStatus(done < total ? `Traduciendo… ${Math.round(done / total * 100)}%` : '');
      }
    };
    await Promise.all(Array.from({ length: Math.min(BT_PARALLEL, total) }, worker));
    if (gen !== _btComm.gen) return;
    _btComm.busy = false;
    if (failed) {
      _btSetStatus(failed === total ? 'No se pudo traducir' : 'Traducción parcial');
      showToast('No se pudo traducir todo el comentario. Revisa tu conexión e inténtalo de nuevo.', 'warning');
    }
  } else if (_btComm.wantSpanish) {
    entries.forEach(e => { e.node.nodeValue = e.translated; });
  }

  _btComm.translated = entries.some(e => e.translated !== null);
  _btShowFrame();
  _btUpdateTranslateBtn(true);
}

function toggleCommentaryTranslation() {
  _btComm.wantSpanish = !_btComm.wantSpanish;
  try { localStorage.setItem(BT_LANG_KEY, _btComm.wantSpanish ? '1' : '0'); } catch { /* ignore */ }

  if (_btComm.wantSpanish) {
    if (_btComm.busy) {
      // Batches still running will apply themselves; show the ones already done
      _btComm.nodes.forEach(e => { if (e.translated !== null) e.node.nodeValue = e.translated; });
    } else {
      _btTranslateCommentary(_btComm.gen);
    }
  } else {
    _btComm.nodes.forEach(e => { e.node.nodeValue = e.original; });
    _btSetStatus('');
  }
  _btUpdateTranslateBtn(true);
}

// One line per text: Google keeps line breaks, so the batch maps back 1:1
function _btSquash(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Google stalls on very long texts: split big paragraphs at sentence boundaries
function _btSplitLong(text) {
  if (text.length <= BT_BATCH_CHARS) return [text];
  const parts = [];
  let cur = '';
  for (const sentence of text.match(/[^.!?;:]+[.!?;:]*\s*/g) || [text]) {
    if (cur && cur.length + sentence.length > BT_BATCH_CHARS) { parts.push(cur.trim()); cur = ''; }
    cur += sentence;
    while (cur.length > BT_BATCH_CHARS) { parts.push(cur.slice(0, BT_BATCH_CHARS)); cur = cur.slice(BT_BATCH_CHARS); }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function _btKeepSpacing(original, translated) {
  if (!translated) return original;
  const lead  = /^\s/.test(original) ? ' ' : '';
  const trail = /\s$/.test(original) ? ' ' : '';
  return lead + translated.trim() + trail;
}

async function _btTranslateTexts(texts) {
  try {
    return await _btGoogleTranslate(texts);
  } catch {
    const res = await TranslationApi.translateBatch(texts, 'es');
    return res.translations;
  }
}

async function _btGoogleTranslate(texts) {
  const res = await fetch(
    'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl=es',
    { method: 'POST', body: new URLSearchParams({ q: texts.join('\n') }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const joined = (data[0] || []).map(s => (Array.isArray(s) && s[0]) || '').join('');
  const lines = joined.split('\n');
  if (lines.length === texts.length) return lines;
  // Google merged or split lines: halve the batch until it maps back 1:1
  if (texts.length === 1) return [joined.replace(/\n/g, ' ')];
  const mid = Math.ceil(texts.length / 2);
  const [a, b] = await Promise.all([
    _btGoogleTranslate(texts.slice(0, mid)),
    _btGoogleTranslate(texts.slice(mid)),
  ]);
  return a.concat(b);
}

function _btUpdateTranslateBtn(visible) {
  const btn = document.getElementById('commModalTranslate');
  if (!btn) return;
  btn.classList.toggle('d-none', !visible);
  const label = btn.querySelector('span');
  if (label) label.textContent = _btComm.wantSpanish ? 'Ver original' : 'Traducir al español';
}

function _btSetStatus(text) {
  const el = document.getElementById('commModalStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('d-none', !text);
}

function _btSetLoadingText(text) {
  const el = document.getElementById('commModalLoadingText');
  if (el) el.textContent = text;
}

// ── Strong's Dictionary ────────────────────────────────────────────────────

async function lookupStrongsUI() {
  const input = document.getElementById('strongsInput');
  const code  = (input?.value || '').trim();
  if (!code) { showToast('Ingresa un número Strong\'s (Ej: G2316, H430)', 'warning'); return; }

  const resultEl  = document.getElementById('strongsResult');
  const loadingEl = document.getElementById('strongsLoading');
  if (!resultEl) return;

  resultEl.innerHTML  = '';
  loadingEl?.classList.remove('d-none');

  try {
    const data = await StrongsApi.lookup(code);
    loadingEl?.classList.add('d-none');
    resultEl.innerHTML = _renderStrongsEntry(data);
  } catch (e) {
    loadingEl?.classList.add('d-none');
    resultEl.innerHTML = `
      <div class="alert alert-warning py-2 px-3 small mb-0">
        <i class="bi bi-exclamation-triangle me-1"></i>
        ${e.message || 'No se encontró la entrada.'}
      </div>`;
  }
}

function _renderStrongsEntry(data) {
  const { code, entry } = data;
  const isGreek = code.startsWith('G');

  const badgeCls  = isGreek ? 'bg-info text-dark' : 'bg-warning text-dark';
  const badgeTxt  = isGreek ? 'Griego (NT)' : 'Hebreo (AT)';
  const lemma     = entry.lemma     || '';
  const translit  = entry.translit  || entry.xlit || '';
  const pron      = entry.pron      || '';
  const derivation= entry.derivation|| '';
  const def       = entry.strongs_def || '';
  const kjvDef    = entry.kjv_def   || '';

  return `
  <div class="bt-strongs-entry">
    <div class="bt-strongs-header">
      <span class="badge bg-secondary fs-6 me-2">${code}</span>
      <span class="bt-strongs-lemma">${lemma}</span>
      <span class="bt-strongs-translit text-muted ms-2 fst-italic">${translit}</span>
      ${pron ? `<span class="text-muted small ms-2">(${pron})</span>` : ''}
      <span class="badge ${badgeCls} ms-2">${badgeTxt}</span>
    </div>
    ${derivation ? `
    <div class="bt-strongs-row mt-2">
      <span class="bt-strongs-label"><i class="bi bi-diagram-2 me-1"></i>Origen</span>
      <span class="bt-strongs-val text-muted small">${derivation}</span>
    </div>` : ''}
    ${def ? `
    <div class="bt-strongs-row mt-1">
      <span class="bt-strongs-label"><i class="bi bi-book me-1"></i>Definición</span>
      <span class="bt-strongs-val">${def.trim()}</span>
    </div>` : ''}
    ${kjvDef ? `
    <div class="bt-strongs-row mt-1">
      <span class="bt-strongs-label"><i class="bi bi-translate me-1"></i>KJV traduce como</span>
      <span class="bt-strongs-val fst-italic text-muted">${kjvDef}</span>
    </div>` : ''}
    <div class="mt-2 pt-1 border-top">
      <a href="https://biblehub.com/${isGreek ? 'greek' : 'hebrew'}/${code.slice(1)}.htm"
         target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-box-arrow-up-right me-1"></i>Ver en BibleHub
      </a>
    </div>
  </div>`;
}

// ── Strong's pills from KJV text ──────────────────────────────────────────

function btShowStrongsPills(nums, isNT) {
  const el = document.getElementById('strongsPills');
  if (!el || !nums.length) { if (el) el.innerHTML = ''; return; }

  const prefix = isNT ? 'G' : 'H';
  const unique = [...new Set(nums)].slice(0, 30);
  el.innerHTML = unique.map(n =>
    `<button class="btn btn-outline-secondary btn-xs py-0 px-1" style="font-size:.72rem"
             onclick="document.getElementById('strongsInput').value='${prefix}${n}';lookupStrongsUI()">
       ${prefix}${n}
     </button>`
  ).join(' ');
}

// ── Strongs-annotated verse rendering (tisch-s / wlca) ────────────────────
// Input: raw text with <S>NNNN</S> tags after words
// Output: HTML with each word wrapped as a clickable span

/**
 * Convert bolls.life Strong's-tagged text to interactive HTML.
 * Format from API: "word<S>1234</S> word2<S>5678</S>"
 * @param {string} rawText  verse text with <S>NNNN</S> tags
 * @param {boolean} isNT    true for Greek (G prefix), false for Hebrew (H prefix)
 * @returns {string}        HTML string
 */
function renderStrongsAnnotated(rawText, isNT) {
  if (!rawText) return '';
  const prefix = isNT ? 'G' : 'H';

  // Split on Strong's tags, keeping captured groups
  // Each segment: text node OR <S>NNNN</S>
  const parts = rawText.split(/(<S>\d+<\/S>)/);

  let html = '';
  let pendingWord = '';

  for (const part of parts) {
    const m = part.match(/^<S>(\d+)<\/S>$/);
    if (m) {
      // This Strong's number belongs to the preceding word token
      const num = m[1];
      const code = `${prefix}${num}`;
      const word = pendingWord.trimEnd();
      const trail = pendingWord.slice(word.length); // preserve trailing spaces/punct
      if (word) {
        html += `<span class="sw-word" title="${code}" onclick="btQuickStrongs('${code}')">${word}<sup class="sw-num">${num}</sup></span>${trail}`;
      } else {
        html += `<sup class="sw-num sw-standalone" onclick="btQuickStrongs('${code}')">${num}</sup>`;
      }
      pendingWord = '';
    } else {
      // Plain text — flush any previous pending (no Strong's tag followed)
      if (pendingWord) html += pendingWord;
      pendingWord = part;
    }
  }
  // Flush remaining plain text
  if (pendingWord) html += pendingWord;

  return html;
}

/**
 * Quick Strong's lookup — fills the dictionary input, switches to Dictionary tab, triggers search.
 * @param {string} code  e.g. "G2316" or "H430"
 */
function btQuickStrongs(code) {
  // Fill the search box
  const input = document.getElementById('strongsInput');
  if (input) input.value = code;

  // Switch to the Dictionary tab if it exists
  const dictTab = document.querySelector('[data-bs-target="#btTabDict"]');
  if (dictTab) {
    bootstrap.Tab.getOrCreateInstance(dictTab).show();
  }

  // Run the lookup
  lookupStrongsUI();
}
