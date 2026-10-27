// ── Video Generator ───────────────────────────────────────────────
// Generates a narrated presentation video from study notes or sermons.
// Stack: Canvas API (slides) · Web Speech Synthesis (narration preview)
//        Web Audio API (ambient audio) · MediaRecorder (WebM export)

// ── Constants ─────────────────────────────────────────────────────
const VG_W   = 1280;
const VG_H   = 720;
const VG_FPS = 25;

const VGC = {
  bgDark   : '#1a3a5c',
  bgMid    : '#22508a',
  bgLight  : '#f4f7fb',
  bgCard   : '#ffffff',
  accent   : '#c8960c',
  accentDim: '#a07808',
  textDark : '#1a1a2e',
  textMid  : '#3a3a5a',
  textLight: '#ffffff',
  textMuted: 'rgba(255,255,255,0.65)',
};

// ── State ─────────────────────────────────────────────────────────
let vgSlides       = [];
let vgCurrentIdx   = 0;
let vgCanvas       = null;
let vgCtx          = null;
let vgRecorder     = null;
let vgChunks       = [];
let vgRecording    = false;
let vgNarrating    = false;
let vgAudioCtx     = null;
let vgOscillators  = [];
let vgBlobUrl      = null;

// ── Modal entry point ─────────────────────────────────────────────
function openVideoModal() {
  const content = _vgExtractContent();
  if (!content.title) {
    showToast('Escribe un título antes de generar el video.', 'warning');
    return;
  }

  vgSlides     = _vgBuildSlides(content);
  vgCurrentIdx = 0;
  vgBlobUrl    = null;

  // Setup canvas
  vgCanvas = document.getElementById('vgCanvas');
  vgCtx    = vgCanvas.getContext('2d');
  vgCanvas.width  = VG_W;
  vgCanvas.height = VG_H;

  _vgDrawSlide(vgSlides[0]);
  _vgUpdateUI();
  _vgPopulateVoices();

  // Reset buttons
  document.getElementById('vgBtnRecord').disabled   = false;
  document.getElementById('vgBtnRecord').textContent = '⏺ Grabar video';
  document.getElementById('vgBtnDownload').classList.add('d-none');
  document.getElementById('vgProgress').classList.add('d-none');

  bootstrap.Modal.getOrCreateInstance(document.getElementById('videoModal')).show();
}

// ── Content extraction ────────────────────────────────────────────
function _vgExtractContent() {
  const c = { type: 'note', title: '', subtitle: '', scripture: '', date: '', sections: [] };

  // Study notes page
  if (typeof quillComments !== 'undefined' && quillComments) {
    c.type     = 'note';
    c.title    = (document.getElementById('noteTitle')?.value || '').trim();
    c.date     = document.getElementById('noteDate')?.value || '';
    const body = quillComments.getText().trim();
    if (body) {
      _vgSplitParagraphs(body, 120).forEach((p, i) =>
        c.sections.push({ label: i === 0 ? 'Comentarios' : '', text: p })
      );
    }
    return c;
  }

  // Sermon page
  if (typeof quillIntro !== 'undefined') {
    c.type      = 'sermon';
    c.title     = (document.getElementById('sermonTitle')?.value    || '').trim();
    c.subtitle  = (document.getElementById('sermonTheme')?.value    || '').trim();
    c.scripture = (document.getElementById('sermonScripture')?.value|| '').trim();
    c.date      = document.getElementById('sermonDate')?.value || '';

    if (quillIntro) {
      const t = quillIntro.getText().trim();
      if (t) _vgSplitParagraphs(t, 120).forEach((p, i) =>
        c.sections.push({ label: i === 0 ? 'Introducción' : '', text: p })
      );
    }

    if (typeof pointEditors !== 'undefined') {
      pointEditors.forEach((ed, id) => {
        const label = document.getElementById(id)?.querySelector('.point-title')?.value?.trim() || 'Punto Principal';
        const t = ed.getText().trim();
        if (t) _vgSplitParagraphs(t, 120).forEach((p, i) =>
          c.sections.push({ label: i === 0 ? label : '', text: p })
        );
      });
    }

    if (typeof quillConclusion !== 'undefined' && quillConclusion) {
      const t = quillConclusion.getText().trim();
      if (t) _vgSplitParagraphs(t, 120).forEach((p, i) =>
        c.sections.push({ label: i === 0 ? 'Conclusión' : '', text: p })
      );
    }

    return c;
  }

  return c;
}

// Split text into chunks of ≤ maxWords words
function _vgSplitParagraphs(text, maxWords) {
  const sentences = text.replace(/([.!?])\s+/g, '$1\n').split('\n').filter(Boolean);
  const chunks = [];
  let current = '';

  for (const sent of sentences) {
    const tentative = current ? current + ' ' + sent : sent;
    if (tentative.split(' ').length > maxWords && current) {
      chunks.push(current.trim());
      current = sent;
    } else {
      current = tentative;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

// ── Slide builder ─────────────────────────────────────────────────
function _vgBuildSlides(c) {
  const slides = [];
  const dateStr = c.date ? formatDate(c.date) : '';

  // 1. Title
  slides.push({ type: 'title', title: c.title, subtitle: c.subtitle, date: dateStr,
    narration: c.title + (c.subtitle ? '. ' + c.subtitle : ''), duration: 5 });

  // 2. Scripture (sermon only)
  if (c.scripture) {
    slides.push({ type: 'scripture', text: c.scripture,
      narration: 'Texto base: ' + c.scripture, duration: 6 });
  }

  // 3. Content sections
  for (const sec of c.sections) {
    const words = sec.text.split(' ').length;
    const dur   = Math.min(30, Math.max(6, Math.round(words / 2.5)));
    slides.push({ type: 'content', label: sec.label, text: sec.text,
      narration: (sec.label ? sec.label + '. ' : '') + sec.text, duration: dur });
  }

  // 4. End
  slides.push({ type: 'end', title: c.title, subtitle: dateStr,
    narration: 'Fin de la presentación.', duration: 5 });

  return slides;
}

// ── Slide renderers ───────────────────────────────────────────────
function _vgDrawSlide(slide) {
  if (!vgCtx) return;
  switch (slide.type) {
    case 'title':    _vgDrawTitle(slide);    break;
    case 'scripture':_vgDrawScripture(slide);break;
    case 'content':  _vgDrawContent(slide);  break;
    case 'end':      _vgDrawEnd(slide);      break;
  }
}

function _vgDrawTitle(s) {
  const g = vgCtx.createLinearGradient(0, 0, VG_W, VG_H);
  g.addColorStop(0, VGC.bgDark);
  g.addColorStop(1, VGC.bgMid);
  vgCtx.fillStyle = g;
  vgCtx.fillRect(0, 0, VG_W, VG_H);

  // Decorative cross (subtle)
  _vgDrawCross(VG_W * 0.88, VG_H * 0.15, 60, 'rgba(255,255,255,0.06)');
  _vgDrawCross(VG_W * 0.08, VG_H * 0.82, 40, 'rgba(255,255,255,0.04)');

  // Gold accent bar
  vgCtx.fillStyle = VGC.accent;
  vgCtx.fillRect(80, VG_H / 2 - 100, 6, 160);

  // Title
  vgCtx.fillStyle = VGC.textLight;
  vgCtx.font = 'bold 62px Arial';
  vgCtx.textAlign = 'left';
  const titleY = _vgWrapText(s.title, 110, VG_H / 2 - 60, VG_W - 180, 68, 3);

  // Subtitle
  if (s.subtitle) {
    vgCtx.fillStyle = VGC.accent;
    vgCtx.font = '30px Arial';
    _vgWrapText(s.subtitle, 110, titleY + 28, VG_W - 180, 36, 2);
  }

  // Date
  if (s.date) {
    vgCtx.fillStyle = VGC.textMuted;
    vgCtx.font = '22px Arial';
    vgCtx.textAlign = 'right';
    vgCtx.fillText(s.date, VG_W - 60, VG_H - 48);
  }

  // Watermark
  _vgDrawWatermark();
}

function _vgDrawScripture(s) {
  // Dark warm background
  const g = vgCtx.createLinearGradient(0, 0, 0, VG_H);
  g.addColorStop(0, '#2c1810');
  g.addColorStop(1, '#1a0f0a');
  vgCtx.fillStyle = g;
  vgCtx.fillRect(0, 0, VG_W, VG_H);

  // Glow circle
  const radial = vgCtx.createRadialGradient(VG_W/2, VG_H/2, 80, VG_W/2, VG_H/2, 380);
  radial.addColorStop(0, 'rgba(200,150,12,0.18)');
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  vgCtx.fillStyle = radial;
  vgCtx.fillRect(0, 0, VG_W, VG_H);

  // Opening quote mark
  vgCtx.fillStyle = VGC.accent;
  vgCtx.font = 'bold 160px Georgia';
  vgCtx.textAlign = 'center';
  vgCtx.fillText('"', VG_W / 2 - 20, VG_H / 2 - 40);

  // Scripture text
  vgCtx.fillStyle = VGC.textLight;
  vgCtx.font = 'italic 34px Georgia';
  _vgWrapText(s.text, VG_W / 2, VG_H / 2 + 60, VG_W - 200, 44, 4, 'center');

  _vgDrawWatermark();
}

function _vgDrawContent(s) {
  // Light background
  vgCtx.fillStyle = VGC.bgLight;
  vgCtx.fillRect(0, 0, VG_W, VG_H);

  // Header bar
  vgCtx.fillStyle = VGC.bgDark;
  vgCtx.fillRect(0, 0, VG_W, 100);

  // Accent stripe
  vgCtx.fillStyle = VGC.accent;
  vgCtx.fillRect(0, 96, VG_W, 4);

  // Section label in header
  vgCtx.fillStyle = VGC.textLight;
  vgCtx.font = 'bold 34px Arial';
  vgCtx.textAlign = 'left';
  vgCtx.fillText(s.label || '', 60, 65);

  // Content card
  vgCtx.fillStyle = VGC.bgCard;
  _vgRoundRect(40, 120, VG_W - 80, VG_H - 160, 12);
  vgCtx.fillStyle = VGC.accent;
  vgCtx.fillRect(40, 120, 6, VG_H - 160);

  // Body text
  vgCtx.fillStyle = VGC.textDark;
  vgCtx.font = '30px Arial';
  _vgWrapText(s.text, 80, 175, VG_W - 150, 40, 10);

  _vgDrawWatermark();
}

function _vgDrawEnd(s) {
  const g = vgCtx.createLinearGradient(0, 0, VG_W, VG_H);
  g.addColorStop(0, VGC.bgDark);
  g.addColorStop(1, VGC.bgMid);
  vgCtx.fillStyle = g;
  vgCtx.fillRect(0, 0, VG_W, VG_H);

  _vgDrawCross(VG_W / 2, VG_H / 2 - 40, 90, 'rgba(200,150,12,0.25)');

  vgCtx.fillStyle = VGC.textLight;
  vgCtx.font = 'bold 52px Arial';
  vgCtx.textAlign = 'center';
  vgCtx.fillText(s.title, VG_W / 2, VG_H / 2 + 80);

  if (s.subtitle) {
    vgCtx.fillStyle = VGC.textMuted;
    vgCtx.font = '26px Arial';
    vgCtx.fillText(s.subtitle, VG_W / 2, VG_H / 2 + 124);
  }

  _vgDrawWatermark();
}

// ── Drawing utilities ─────────────────────────────────────────────
function _vgWrapText(text, x, y, maxW, lineH, maxLines, align = 'left') {
  vgCtx.textAlign = align;
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  let lineCount = 0;

  for (const word of words) {
    if (lineCount >= maxLines) break;
    const test = line ? line + ' ' + word : word;
    if (vgCtx.measureText(test).width > maxW && line) {
      const finalLine = lineCount === maxLines - 1 && words.indexOf(word) < words.length - 1
        ? line.trimEnd() + '…' : line;
      vgCtx.fillText(finalLine, x, currentY);
      line = word;
      currentY += lineH;
      lineCount++;
    } else {
      line = test;
    }
  }
  if (line && lineCount < maxLines) {
    vgCtx.fillText(line, x, currentY);
    currentY += lineH;
  }
  return currentY;
}

function _vgDrawCross(cx, cy, size, color) {
  vgCtx.strokeStyle = color;
  vgCtx.lineWidth   = size * 0.14;
  vgCtx.lineCap     = 'round';
  vgCtx.beginPath();
  vgCtx.moveTo(cx, cy - size); vgCtx.lineTo(cx, cy + size);
  vgCtx.moveTo(cx - size * 0.6, cy - size * 0.22);
  vgCtx.lineTo(cx + size * 0.6, cy - size * 0.22);
  vgCtx.stroke();
}

function _vgRoundRect(x, y, w, h, r) {
  vgCtx.beginPath();
  vgCtx.moveTo(x + r, y);
  vgCtx.lineTo(x + w - r, y);
  vgCtx.arcTo(x + w, y,     x + w, y + r,     r);
  vgCtx.lineTo(x + w, y + h - r);
  vgCtx.arcTo(x + w, y + h, x + w - r, y + h, r);
  vgCtx.lineTo(x + r, y + h);
  vgCtx.arcTo(x,     y + h, x,     y + h - r, r);
  vgCtx.lineTo(x,     y + r);
  vgCtx.arcTo(x,     y,     x + r, y,         r);
  vgCtx.closePath();
  vgCtx.fill();
}

function _vgDrawWatermark() {
  vgCtx.fillStyle = 'rgba(255,255,255,0.18)';
  vgCtx.font      = '18px Arial';
  vgCtx.textAlign = 'left';
  vgCtx.fillText('Estudio Bíblico', 28, VG_H - 22);
}

// ── Slide navigation ──────────────────────────────────────────────
function vgPrev() {
  if (vgCurrentIdx > 0) { vgCurrentIdx--; _vgDrawSlide(vgSlides[vgCurrentIdx]); _vgUpdateUI(); }
}
function vgNext() {
  if (vgCurrentIdx < vgSlides.length - 1) { vgCurrentIdx++; _vgDrawSlide(vgSlides[vgCurrentIdx]); _vgUpdateUI(); }
}

function _vgUpdateUI() {
  document.getElementById('vgSlideCounter').textContent =
    `Diapositiva ${vgCurrentIdx + 1} / ${vgSlides.length}`;
  document.getElementById('vgBtnPrev').disabled = vgCurrentIdx === 0;
  document.getElementById('vgBtnNext').disabled = vgCurrentIdx === vgSlides.length - 1;

  const totalSec = vgSlides.reduce((a, s) => a + s.duration + 0.8, 0);
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  document.getElementById('vgDuration').textContent =
    `Duración estimada: ${min > 0 ? min + ' min ' : ''}${sec} seg`;
}

// ── Voice selector ────────────────────────────────────────────────
function _vgPopulateVoices() {
  const sel = document.getElementById('vgVoice');
  const fill = () => {
    const voices = speechSynthesis.getVoices();
    sel.innerHTML = '';
    // Spanish voices first
    const sorted = [...voices].sort((a, b) => {
      const aEs = a.lang.startsWith('es');
      const bEs = b.lang.startsWith('es');
      return aEs === bEs ? 0 : aEs ? -1 : 1;
    });
    sorted.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.lang.startsWith('es')) opt.selected = true;
      sel.appendChild(opt);
    });
  };
  fill();
  if (speechSynthesis.onvoiceschanged !== undefined)
    speechSynthesis.onvoiceschanged = fill;
}

// ── Narration (preview only, audio plays through speakers) ────────
function vgToggleNarrate() {
  if (vgNarrating) {
    vgNarrating = false;
    speechSynthesis.cancel();
    document.getElementById('vgBtnNarrate').textContent = '🔊 Narrar';
    return;
  }
  vgNarrating = true;
  document.getElementById('vgBtnNarrate').textContent = '⏹ Detener';
  _vgNarrateFrom(vgCurrentIdx);
}

async function _vgNarrateFrom(startIdx) {
  for (let i = startIdx; i < vgSlides.length; i++) {
    if (!vgNarrating) break;
    vgCurrentIdx = i;
    _vgDrawSlide(vgSlides[i]);
    _vgUpdateUI();
    await _vgSpeak(vgSlides[i].narration);
    await _vgWait(400);
  }
  vgNarrating = false;
  document.getElementById('vgBtnNarrate').textContent = '🔊 Narrar';
}

function _vgSpeak(text) {
  return new Promise(resolve => {
    if (!text?.trim()) { resolve(); return; }

    const utt    = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const idx    = parseInt(document.getElementById('vgVoice')?.value ?? '0', 10);
    const voice  = voices[idx] || voices.find(v => v.lang.startsWith('es')) || null;

    utt.voice  = voice;
    utt.rate   = parseFloat(document.getElementById('vgSpeed')?.value) || 0.9;
    utt.pitch  = 1.0;
    utt.volume = 1.0;
    utt.lang   = voice?.lang || 'es-ES';

    // Guard: some browsers never fire onend — resolve after estimated time
    const estMs = Math.max(2000, (text.length / 15) * 1000 / utt.rate);
    const guard = setTimeout(resolve, estMs + 2000);

    utt.onend = () => { clearTimeout(guard); resolve(); };
    utt.onerror = () => { clearTimeout(guard); resolve(); };

    // Chrome bug: speechSynthesis can stall. Nudge it periodically.
    const nudge = setInterval(() => {
      if (!speechSynthesis.speaking) { clearInterval(nudge); return; }
      speechSynthesis.pause();
      speechSynthesis.resume();
    }, 10000);

    utt.onend = () => { clearTimeout(guard); clearInterval(nudge); resolve(); };
    utt.onerror = () => { clearTimeout(guard); clearInterval(nudge); resolve(); };

    speechSynthesis.speak(utt);
  });
}

// ── Recording ─────────────────────────────────────────────────────
let _vgOnStopCalled = false;

async function vgRecord() {
  if (vgRecording) { _vgStopRecording(); return; }

  speechSynthesis.cancel();
  vgNarrating      = false;
  vgChunks         = [];
  vgRecording      = true;
  _vgOnStopCalled  = false;

  document.getElementById('vgBtnRecord').textContent = '⏹ Detener grabación';
  document.getElementById('vgBtnNarrate').disabled   = true;
  document.getElementById('vgBtnDownload').classList.add('d-none');
  const progressEl  = document.getElementById('vgProgress');
  const progressBar = document.getElementById('vgProgressBar');
  progressEl.classList.remove('d-none');
  progressBar.style.width  = '0%';
  progressBar.textContent  = 'Preparando…';

  // ── 1. Canvas video stream ──────────────────────────────────────
  const videoStream = vgCanvas.captureStream(VG_FPS);

  // ── 2. Audio: try to capture tab audio (includes TTS narration) ─
  vgAudioCtx    = new AudioContext();
  const dest    = vgAudioCtx.createMediaStreamDestination();
  vgOscillators = [];
  _vgStartAmbient(dest);          // soft background pad

  let audioTracks = dest.stream.getAudioTracks(); // fallback: ambient only
  let tabStream   = null;

  try {
    // Ask browser to share tab audio. User must keep "Share audio" checked.
    tabStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 1, height: 1, frameRate: 1 }, // minimal video, we discard it
      audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 },
      preferCurrentTab: true,   // Chrome 107+ pre-selects current tab
    });
    const tabAudio = tabStream.getAudioTracks();
    if (tabAudio.length > 0) {
      // Pipe tab audio through AudioContext so it mixes with ambient
      const tabSrc = vgAudioCtx.createMediaStreamSource(tabStream);
      tabSrc.connect(dest);
      audioTracks = dest.stream.getAudioTracks(); // now contains ambient + tab audio
      showToast('🎙️ Audio del tab capturado — la voz narradora se incluirá en el video.', 'success');
    }
    // Stop the video track immediately (we only needed the stream for audio)
    tabStream.getVideoTracks().forEach(t => t.stop());
  } catch {
    // User cancelled or browser doesn't support — continue with ambient audio only
    showToast('ℹ️ Sin audio de tab — el video tendrá música de fondo pero no la voz narradora.', 'info');
  }

  // ── 3. Combine canvas + audio ───────────────────────────────────
  const combined = new MediaStream([...videoStream.getVideoTracks(), ...audioTracks]);

  const mimeType = _vgBestMime();
  vgRecorder = new MediaRecorder(combined, mimeType ? { mimeType } : {});
  vgRecorder.ondataavailable = e => { if (e.data.size > 0) vgChunks.push(e.data); };
  vgRecorder.onstop = () => { _vgOnStopCalled = true; _vgFinalize(); };
  vgRecorder.start(100); // collect chunks every 100 ms for reliability

  // ── 4. Slide loop — narrate each slide ─────────────────────────
  for (let i = 0; i < vgSlides.length; i++) {
    if (!vgRecording) break;
    const slide = vgSlides[i];

    await _vgFade('in', slide);

    progressBar.style.width = `${Math.round((i / vgSlides.length) * 100)}%`;
    progressBar.textContent = `${i + 1} / ${vgSlides.length}`;
    vgCurrentIdx = i;
    _vgUpdateUI();

    // Narrate the slide text — this plays through system audio (captured if tab audio was granted)
    await _vgSpeak(slide.narration);
    // Brief pause after narration before transitioning
    await _vgWait(600);

    if (i < vgSlides.length - 1) await _vgFade('out', slide);
  }

  _vgStopRecording();
}

function _vgStopRecording() {
  vgRecording = false;
  vgNarrating = false;
  speechSynthesis.cancel();

  // Stop oscillators
  vgOscillators.forEach(({ osc, gain }) => {
    try { gain.gain.linearRampToValueAtTime(0, vgAudioCtx.currentTime + 0.5); } catch {}
    try { osc.stop(vgAudioCtx.currentTime + 0.5); } catch {}
  });
  setTimeout(() => { try { vgAudioCtx?.close(); } catch {} }, 700);

  // Stop recorder — triggers onstop → _vgFinalize
  if (vgRecorder?.state === 'recording' || vgRecorder?.state === 'paused') {
    vgRecorder.stop();
  }

  // Safety fallback: if onstop doesn't fire within 2 s, finalize manually
  setTimeout(() => { if (!_vgOnStopCalled) { _vgOnStopCalled = true; _vgFinalize(); } }, 2000);

  document.getElementById('vgBtnRecord').textContent = '⏺ Grabar video';
  document.getElementById('vgBtnRecord').disabled    = false;
  document.getElementById('vgBtnNarrate').disabled   = false;
}

function _vgFinalize() {
  if (!vgChunks.length) {
    showToast('No se capturaron datos de video. Intenta de nuevo.', 'danger');
    return;
  }

  const mime = vgChunks[0]?.type || 'video/webm';
  const blob = new Blob(vgChunks, { type: mime });
  if (vgBlobUrl) URL.revokeObjectURL(vgBlobUrl);
  vgBlobUrl = URL.createObjectURL(blob);

  const dl      = document.getElementById('vgBtnDownload');
  const rawTitle = (
    document.getElementById('noteTitle')?.value ||
    document.getElementById('sermonTitle')?.value || 'presentacion'
  ).trim();
  dl.href     = vgBlobUrl;
  dl.download = rawTitle.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').slice(0, 40) + '.webm';
  dl.classList.remove('d-none');

  document.getElementById('vgProgressBar').style.width = '100%';
  document.getElementById('vgProgressBar').textContent = '✓ Listo para descargar';
  document.getElementById('vgProgressBar').classList.remove('progress-bar-animated');

  showToast('✅ Video listo. Haz clic en <strong>Descargar</strong> para guardarlo.', 'success');
}

// ── Fade transition ───────────────────────────────────────────────
async function _vgFade(dir, slide) {
  const steps    = 12;
  const stepMs   = 30;
  for (let i = 0; i <= steps; i++) {
    const alpha = dir === 'out' ? i / steps : (steps - i) / steps;
    _vgDrawSlide(slide);
    vgCtx.fillStyle = `rgba(0,0,0,${alpha})`;
    vgCtx.fillRect(0, 0, VG_W, VG_H);
    await _vgWait(stepMs);
  }
}

// ── Ambient audio — soft C-major pad ─────────────────────────────
function _vgStartAmbient(dest) {
  // Root + third + fifth + octave (very soft)
  [130.81, 164.81, 196.0, 261.63].forEach(freq => {
    const osc  = vgAudioCtx.createOscillator();
    const gain = vgAudioCtx.createGain();
    osc.type   = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, vgAudioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.022, vgAudioCtx.currentTime + 2);
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    vgOscillators.push({ osc, gain });
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function _vgWait(ms) { return new Promise(r => setTimeout(r, ms)); }

function _vgBestMime() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
}
