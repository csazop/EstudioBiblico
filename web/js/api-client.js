const API = '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Study Notes
const StudyNotesApi = {
  list:   ()       => apiFetch('/studynotes'),
  get:    (id)     => apiFetch(`/studynotes/${id}`),
  create: (data)   => apiFetch('/studynotes', { method: 'POST', body: data }),
  update: (id, d)  => apiFetch(`/studynotes/${id}`, { method: 'PUT', body: d }),
  delete: (id)     => apiFetch(`/studynotes/${id}`, { method: 'DELETE' }),
};

// Sermons
const SermonsApi = {
  list:   ()       => apiFetch('/sermons'),
  get:    (id)     => apiFetch(`/sermons/${id}`),
  create: (data)   => apiFetch('/sermons', { method: 'POST', body: data }),
  update: (id, d)  => apiFetch(`/sermons/${id}`, { method: 'PUT', body: d }),
  delete: (id)     => apiFetch(`/sermons/${id}`, { method: 'DELETE' }),
};

// Bible
const BibleApi = {
  versions: () => apiFetch('/bible/versions'),
  books:    (v) => apiFetch(`/bible/${v}/books`),
  chapter:  (v, bookNum, ch, from, to) => {
    const q = from && to ? `?from=${from}&to=${to}` : '';
    return apiFetch(`/bible/${v}/${bookNum}/${ch}${q}`);
  },
};

// Strong's Concordance
const StrongsApi = {
  lookup: (code) => apiFetch(`/bible/strongs/${encodeURIComponent(code)}`),
  rv1909: (code) => apiFetch(`/bible/strongs/${encodeURIComponent(code)}/rv1909`),
};

// Translation
const TranslationApi = {
  translate: (text, targetLanguage) =>
    apiFetch('/translation/translate', { method: 'POST', body: { text, targetLanguage } }),
  translateBatch: (texts, targetLanguage = 'es', sourceLanguage = 'auto') =>
    apiFetch('/translation/batch', { method: 'POST', body: { texts, targetLanguage, sourceLanguage } }),
};

// Helpers
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const id = 'toast-' + Date.now();
  const html = `
    <div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body fw-semibold">${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`;
  container.insertAdjacentHTML('beforeend', html);
  const el = document.getElementById(id);
  const toast = new bootstrap.Toast(el, { delay: 3500 });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}
