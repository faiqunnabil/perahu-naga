'use strict';

const QUESTIONS_KEY = 'perahu-naga:soal:v1';
const SETUP_KEY = 'perahu-naga:pengaturan:v1';
const LETTERS = ['A', 'B', 'C', 'D'];

const TEAMS = [
  { name: 'Regu Merah', color: '#c92a2a', dark: '#8f1d1d', soft: '#fdecec' },
  { name: 'Regu Oranye', color: '#d9480f', dark: '#9c3209', soft: '#fff0e6' },
  { name: 'Regu Hijau', color: '#2b8a3e', dark: '#1d5e2a', soft: '#e9f7ec' },
  { name: 'Regu Biru', color: '#1971c2', dark: '#114f88', soft: '#e7f1fb' },
  { name: 'Regu Ungu', color: '#862e9c', dark: '#5c1f6b', soft: '#f5e9f8' },
];

// Contoh soal untuk pertama kali dibuka. Guru bisa menghapus atau menggantinya.
const SAMPLE_QUESTIONS = [
  { q: '7 × 8 = ...', options: ['54', '56', '58', '64'], answer: 1 },
  { q: 'Planet yang paling dekat dengan Matahari adalah ...', options: ['Venus', 'Bumi', 'Merkurius', 'Mars'], answer: 2 },
  { q: 'Sila ke-3 Pancasila berbunyi ...', options: ['Ketuhanan Yang Maha Esa', 'Persatuan Indonesia', 'Kemanusiaan yang adil dan beradab', 'Keadilan sosial bagi seluruh rakyat Indonesia'], answer: 1 },
  { q: 'Hasil dari 125 + 375 adalah ...', options: ['400', '450', '500', '550'], answer: 2 },
  { q: 'Proses tumbuhan membuat makanan sendiri disebut ...', options: ['Fotosintesis', 'Respirasi', 'Penguapan', 'Pengembunan'], answer: 0 },
  { q: 'Lawan kata "rajin" adalah ...', options: ['Pandai', 'Malas', 'Giat', 'Tekun'], answer: 1 },
  { q: 'Candi Borobudur terletak di provinsi ...', options: ['Jawa Timur', 'Jawa Barat', 'Jawa Tengah', 'Bali'], answer: 2 },
  { q: 'Bangun datar yang memiliki 3 sisi disebut ...', options: ['Persegi', 'Segitiga', 'Lingkaran', 'Trapesium'], answer: 1 },
  { q: 'Air murni membeku pada suhu ... °C', options: ['0', '10', '50', '100'], answer: 0 },
  { q: 'Benua terbesar di dunia adalah ...', options: ['Afrika', 'Asia', 'Eropa', 'Australia'], answer: 1 },
  { q: '1 jam sama dengan ... menit', options: ['30', '60', '100', '120'], answer: 1 },
  { q: 'Hewan yang berkembang biak dengan bertelur disebut ...', options: ['Vivipar', 'Ovipar', 'Ovovivipar', 'Herbivor'], answer: 1 },
];

const AI_PROMPT = `Buatkan 20 soal pilihan ganda tentang [materi] untuk siswa [kelas].
Setiap soal punya 4 pilihan jawaban dan hanya satu yang benar.
Jawab HANYA dengan JSON, tanpa penjelasan apa pun, dengan format persis seperti ini:
[
  {"q": "Teks pertanyaan", "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"], "answer": "B"}
]
"answer" diisi huruf pilihan yang benar: A, B, C, atau D.`;

/* ---------- Utilitas ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function readStore(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 3000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* tidak didukung */ }
    ta.remove();
    return ok;
  }
}

/* ---------- Data soal ---------- */

// Menerima soal dari form, file, atau hasil AI, lalu merapikannya menjadi
// { q, options: [2–4 teks], answer: indeks }. Mengembalikan null kalau tidak valid.
function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const q = String(raw.q ?? raw.question ?? raw.pertanyaan ?? raw.soal ?? '').trim();
  const rawOptions = raw.options ?? raw.pilihan ?? raw.choices;
  if (!q || !Array.isArray(rawOptions)) return null;

  const opts = rawOptions.map((o) => String(o ?? '').trim());
  const ans = raw.answer ?? raw.jawaban ?? raw.correct;
  let ansIdx = -1;
  if (typeof ans === 'number') ansIdx = ans;
  else if (typeof ans === 'string') {
    const t = ans.trim();
    if (/^[A-Da-d]$/.test(t)) ansIdx = t.toUpperCase().charCodeAt(0) - 65;
    else if (/^\d+$/.test(t)) ansIdx = Number(t);
    else ansIdx = opts.findIndex((o) => o.toLowerCase() === t.toLowerCase());
  }
  if (!Number.isInteger(ansIdx) || !opts[ansIdx]) return null;

  // Buang pilihan kosong tanpa menggeser jawaban yang benar.
  const kept = opts.map((text, i) => ({ text, i })).filter((o) => o.text);
  if (kept.length < 2 || kept.length > 4) return null;
  return { q, options: kept.map((o) => o.text), answer: kept.findIndex((o) => o.i === ansIdx) };
}

function loadQuestions() {
  const stored = readStore(QUESTIONS_KEY);
  const source = Array.isArray(stored) ? stored : SAMPLE_QUESTIONS;
  return source.map(normalizeQuestion).filter(Boolean);
}

function saveQuestions() {
  if (!writeStore(QUESTIONS_KEY, questions)) {
    toast('Gagal menyimpan. Penyimpanan browser mungkin penuh atau diblokir.');
  }
}

function parseQuestionText(text) {
  const cleaned = text.trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    // AI kadang menambah kalimat sebelum/sesudah JSON; ambil bagian [ ... ] saja.
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start < 0 || end <= start) throw new Error('bukan JSON');
    data = JSON.parse(cleaned.slice(start, end + 1));
  }
  const list = Array.isArray(data) ? data : data && (data.questions || data.soal);
  if (!Array.isArray(list)) throw new Error('bukan daftar soal');
  const valid = list.map(normalizeQuestion).filter(Boolean);
  return { valid, skipped: list.length - valid.length };
}

function loadSetup() {
  const s = readStore(SETUP_KEY) || {};
  return {
    teams: clamp(parseInt(s.teams, 10) || 3, 2, 5),
    names: TEAMS.map((t, i) => (Array.isArray(s.names) && typeof s.names[i] === 'string' ? s.names[i] : t.name)),
    target: clamp(parseInt(s.target, 10) || 10, 3, 30),
    penalty: clamp(Number.isFinite(s.penalty) ? s.penalty : 3, 0, 15),
  };
}

function saveSetup() {
  writeStore(SETUP_KEY, setup);
}

let questions = loadQuestions();
let setup = loadSetup();
let editingIndex = -1;
let game = null;
let soundOn = true;
let audioCtx = null;

/* ---------- Navigasi ---------- */
function show(view) {
  $$('.view').forEach((el) => { el.hidden = el.id !== `view-${view}`; });
  if (view === 'home') $('#home-count').textContent = questions.length;
  if (view === 'editor') renderEditor();
  if (view === 'setup') renderSetup();
  window.scrollTo(0, 0);
}

/* ---------- Kelola soal ---------- */
function renderEditor() {
  $('#bank-count').textContent = questions.length;
  const list = $('#q-list');
  if (!questions.length) {
    list.innerHTML = '<li class="empty">Belum ada soal. Tulis soal pertama di formulir, atau pakai tombol "Tempel dari AI".</li>';
    return;
  }
  list.innerHTML = questions.map((item, i) => `
    <li class="q-item${i === editingIndex ? ' is-editing' : ''}">
      <span class="q-item-num">${i + 1}</span>
      <div>
        <p class="q-item-text">${esc(item.q)}</p>
        <ul class="q-item-opts">
          ${item.options.map((o, k) => `<li class="${k === item.answer ? 'is-correct' : ''}"><b>${LETTERS[k]}.</b> ${esc(o)}</li>`).join('')}
        </ul>
      </div>
      <div class="q-item-actions">
        <button type="button" class="btn btn-sm" data-act="edit" data-i="${i}">Ubah</button>
        <button type="button" class="btn btn-sm btn-danger-ghost" data-act="del" data-i="${i}">Hapus</button>
      </div>
    </li>`).join('');
}

function resetForm() {
  editingIndex = -1;
  $('#q-form').reset();
  $('#form-error').textContent = '';
  $('#form-title').textContent = 'Tambah soal';
  $('#form-submit').textContent = 'Simpan soal';
  $('#form-cancel').hidden = true;
}

function fillForm(i) {
  const item = questions[i];
  editingIndex = i;
  $('#q-text').value = item.q;
  $$('.opt-input').forEach((input, k) => { input.value = item.options[k] || ''; });
  $$('input[name="correct"]').forEach((radio, k) => { radio.checked = k === item.answer; });
  $('#form-error').textContent = '';
  $('#form-title').textContent = `Ubah soal nomor ${i + 1}`;
  $('#form-submit').textContent = 'Simpan perubahan';
  $('#form-cancel').hidden = false;
  renderEditor();
  $('#q-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#q-text').focus({ preventScroll: true });
}

function submitForm(event) {
  event.preventDefault();
  const error = $('#form-error');
  const text = $('#q-text').value.trim();
  const opts = $$('.opt-input').map((input) => input.value.trim());
  const checked = $('input[name="correct"]:checked');

  if (!text) { error.textContent = 'Pertanyaan belum diisi.'; return; }
  if (opts.filter(Boolean).length < 2) { error.textContent = 'Isi minimal 2 pilihan jawaban.'; return; }
  if (!checked) { error.textContent = 'Tandai jawaban yang benar dengan mengklik bulatan di sebelah kiri.'; return; }
  if (!opts[Number(checked.value)]) { error.textContent = 'Pilihan yang ditandai benar masih kosong.'; return; }

  const item = normalizeQuestion({ q: text, options: opts, answer: Number(checked.value) });
  const wasEditing = editingIndex >= 0;
  if (wasEditing) questions[editingIndex] = item;
  else questions.push(item);
  saveQuestions();
  resetForm();
  renderEditor();
  toast(wasEditing ? 'Perubahan disimpan' : `Soal nomor ${questions.length} disimpan`);
  $('#q-text').focus();
}

function onListClick(event) {
  const btn = event.target.closest('[data-act]');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  if (btn.dataset.act === 'edit') fillForm(i);
  if (btn.dataset.act === 'del') {
    if (!confirm(`Hapus soal nomor ${i + 1}?`)) return;
    questions.splice(i, 1);
    if (editingIndex === i) resetForm();
    else if (editingIndex > i) editingIndex--;
    saveQuestions();
    renderEditor();
  }
}

function exportQuestions() {
  if (!questions.length) { toast('Belum ada soal untuk diekspor'); return; }
  const data = questions.map((x) => ({ q: x.q, options: x.options, answer: LETTERS[x.answer] }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'soal-perahu-naga.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function openPaste(prefill = '') {
  $('#paste-text').value = prefill;
  $('#paste-error').textContent = '';
  $('#paste-dialog').showModal();
  if (prefill) $('#btn-paste-add').focus();
  else $('#paste-text').focus();
}

function applyPaste(mode) {
  const error = $('#paste-error');
  error.textContent = '';
  let result;
  try {
    result = parseQuestionText($('#paste-text').value);
  } catch {
    error.textContent = 'Teks ini tidak terbaca sebagai daftar soal. Pastikan yang ditempel adalah JSON dari AI (diawali tanda [ ).';
    return;
  }
  if (!result.valid.length) {
    error.textContent = 'Tidak ada soal yang formatnya sesuai. Setiap soal butuh "q", "options" (2–4 pilihan), dan "answer".';
    return;
  }
  if (mode === 'replace' && questions.length && !confirm(`Ganti ${questions.length} soal lama dengan ${result.valid.length} soal baru?`)) return;

  questions = mode === 'replace' ? result.valid : questions.concat(result.valid);
  saveQuestions();
  resetForm();
  renderEditor();
  $('#paste-dialog').close();
  const skipped = result.skipped ? `, ${result.skipped} dilewati karena formatnya tidak sesuai` : '';
  toast(`${result.valid.length} soal ${mode === 'replace' ? 'dimuat' : 'ditambahkan'}${skipped}`);
}

/* ---------- Pengaturan lomba ---------- */
function renderSetup() {
  $$('#team-count button').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.n) === setup.teams));
  });
  $('#team-names').innerHTML = TEAMS.slice(0, setup.teams).map((t, i) => `
    <div class="team-name-row" style="--team:${t.color}">
      <span class="swatch" aria-hidden="true"></span>
      <input type="text" maxlength="24" data-i="${i}" value="${esc(setup.names[i])}" aria-label="Nama regu ${i + 1}" placeholder="${esc(t.name)}">
    </div>`).join('');
  $('#target').value = setup.target;
  $('#penalty').value = setup.penalty;
  renderSetupNote();
}

function renderSetupNote() {
  const note = $('#setup-note');
  const start = $('#btn-start');
  start.disabled = questions.length === 0;
  if (questions.length === 0) {
    note.textContent = 'Bank soal masih kosong. Tambahkan soal dulu lewat "Kelola soal".';
  } else if (questions.length < setup.target) {
    note.textContent = `Bank soal berisi ${questions.length} soal, lebih sedikit dari jarak finish (${setup.target}). Soal akan diulang dengan urutan acak.`;
  } else {
    note.textContent = '';
  }
  note.hidden = !note.textContent;
}

/* ---------- Suara ---------- */
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { audioCtx = null; }
}

function sound(type) {
  if (!soundOn || !audioCtx) return;
  const notes = { ok: [660, 880], bad: [260, 180], finish: [523, 659, 784, 1047], tick: [520], go: [880] }[type];
  try {
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t0 = audioCtx.currentTime + idx * 0.11;
      osc.type = type === 'bad' ? 'square' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(type === 'bad' ? 0.08 : 0.2, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    });
  } catch { /* suara bukan bagian penting */ }
}

/* ---------- Lomba ---------- */

// Semua timer lomba lewat sini supaya otomatis batal saat lomba diakhiri atau ditinggal.
function later(g, fn, ms) {
  const id = setTimeout(() => { if (game === g && !g.over) fn(); }, ms);
  g.timers.push(id);
}

function startGame() {
  if (!questions.length) return;
  unlockAudio();
  if (game) game.timers.forEach(clearTimeout);

  const pool = questions.map((x) => ({ q: x.q, options: x.options.slice(), answer: x.answer }));
  const indexes = pool.map((_, k) => k);
  game = {
    target: setup.target,
    penalty: setup.penalty,
    pool,
    timers: [],
    started: false,
    over: false,
    finishCount: 0,
    teams: TEAMS.slice(0, setup.teams).map((t, i) => ({
      ...t,
      name: setup.names[i].trim() || t.name,
      order: shuffle(indexes),
      pos: 0,
      qNumber: 0,
      progress: 0,
      wrong: 0,
      state: 'ready',
      current: null,
      chosen: -1,
      lockLeft: 0,
      rank: null,
    })),
  };

  $('#game-target').textContent = `Finish: ${game.target} jawaban benar`;
  $('#view-game').style.setProperty('--teams', game.teams.length);
  $('#results').hidden = true;
  buildGameDom();
  show('game');
  runCountdown(game);
}

function buildGameDom() {
  $('#river').innerHTML = game.teams.map((t, i) => `
    <div class="lane" style="--team:${t.color};--team-dark:${t.dark}">
      <div class="lane-name">
        <span class="lane-team">${esc(t.name)}</span>
        <span class="lane-score" id="score-${i}">0/${game.target}</span>
      </div>
      <div class="lane-track">
        <div class="lane-finish" aria-hidden="true"></div>
        <div class="boat-wrap" id="boat-${i}" style="--p:0">
          <svg class="boat" viewBox="0 0 120 50" aria-hidden="true"><use href="#boat-shape"/></svg>
        </div>
      </div>
    </div>`).join('');
  $('#panels').innerHTML = game.teams.map((t, i) => `
    <section class="panel" id="panel-${i}" style="--team:${t.color};--team-soft:${t.soft}" aria-label="${esc(t.name)}"></section>`).join('');
  game.teams.forEach((_, i) => renderPanel(i));
}

function runCountdown(g) {
  const box = $('#countdown');
  const num = $('#countdown-num');
  const steps = ['3', '2', '1', 'Mulai!'];
  num.textContent = steps[0];
  box.hidden = false;
  steps.forEach((label, idx) => later(g, () => {
    num.textContent = label;
    num.classList.remove('pop');
    void num.offsetWidth; // ulang animasi
    num.classList.add('pop');
    sound(idx === steps.length - 1 ? 'go' : 'tick');
  }, idx * 900));
  later(g, () => {
    box.hidden = true;
    g.started = true;
    g.teams.forEach((t, i) => { nextQuestion(t); renderPanel(i); });
  }, steps.length * 900);
}

// Tiap regu punya urutan acak sendiri. Kalau soal habis, diacak ulang
// dan soal terakhir tidak langsung muncul lagi.
function nextQuestion(t) {
  if (t.pos >= t.order.length) {
    const last = t.order[t.order.length - 1];
    t.order = shuffle(t.order);
    if (t.order.length > 1 && t.order[0] === last) [t.order[0], t.order[1]] = [t.order[1], t.order[0]];
    t.pos = 0;
  }
  t.current = game.pool[t.order[t.pos++]];
  t.qNumber++;
  t.chosen = -1;
  t.state = 'answering';
}

function renderPanel(i) {
  const t = game.teams[i];
  let body;
  let overlay = '';
  let meta = t.qNumber ? `Soal ${t.qNumber}` : '';

  if (t.state === 'ready') {
    body = '<p class="panel-wait">Bersiap…</p>';
  } else if (t.state === 'finished') {
    meta = `Juara ${t.rank}`;
    body = `<div class="panel-finish"><span class="finish-flag" aria-hidden="true"></span><strong>Finish!</strong><span>Juara ${t.rank}</span></div>`;
  } else {
    const locked = t.state !== 'answering';
    body = `<p class="panel-q">${esc(t.current.q)}</p>
      <div class="panel-opts">${t.current.options.map((o, k) => {
        let cls = 'opt';
        if (k === t.chosen) cls += t.state === 'correct' ? ' is-right' : ' is-wrong';
        return `<button type="button" class="${cls}" data-team="${i}" data-k="${k}"${locked ? ' disabled' : ''}>
          <span class="opt-letter">${LETTERS[k]}</span><span class="opt-text">${esc(o)}</span></button>`;
      }).join('')}</div>`;
    if (t.state === 'correct') overlay = '<div class="panel-badge" role="status">Benar! Perahu maju</div>';
    if (t.state === 'wrong') {
      overlay = `<div class="panel-overlay" role="status"><strong>Salah!</strong><span>Perahu berhenti</span>${t.lockLeft > 0 ? `<span class="lock-count">${t.lockLeft}</span>` : ''}</div>`;
    }
  }

  $(`#panel-${i}`).innerHTML = `
    <header class="panel-head"><span class="panel-name">${esc(t.name)}</span><span class="panel-meta">${meta}</span></header>
    <div class="panel-main"><div class="panel-body">${body}</div>${overlay}</div>`;
}

function updateLane(i) {
  const t = game.teams[i];
  const boat = $(`#boat-${i}`);
  boat.style.setProperty('--p', Math.min(1, t.progress / game.target));
  boat.classList.toggle('is-stalled', t.state === 'wrong');
  $(`#score-${i}`).textContent = t.rank ? `Juara ${t.rank}` : `${t.progress}/${game.target}`;
}

function answer(i, k) {
  const g = game;
  if (!g || g.over || !g.started) return;
  const t = g.teams[i];
  if (!t || t.state !== 'answering') return;
  t.chosen = k;

  if (k === t.current.answer) {
    t.progress++;
    t.state = 'correct';
    if (t.progress >= g.target) t.rank = ++g.finishCount;
    sound('ok');
    updateLane(i);
    renderPanel(i);
    const panel = $(`#panel-${i}`);
    panel.classList.remove('flash-ok');
    void panel.offsetWidth;
    panel.classList.add('flash-ok');

    later(g, () => {
      if (t.rank) {
        t.state = 'finished';
        sound('finish');
        if (g.finishCount === g.teams.length) later(g, endGame, 1500);
      } else {
        nextQuestion(t);
      }
      renderPanel(i);
    }, 750);
  } else {
    t.wrong++;
    t.state = 'wrong';
    t.lockLeft = g.penalty;
    sound('bad');
    updateLane(i);
    renderPanel(i);
    if (g.penalty > 0) tickPenalty(g, i);
    else later(g, () => { nextQuestion(t); updateLane(i); renderPanel(i); }, 900);
  }
}

function tickPenalty(g, i) {
  later(g, () => {
    const t = g.teams[i];
    t.lockLeft--;
    if (t.lockLeft > 0) {
      const count = $(`#panel-${i} .lock-count`);
      if (count) count.textContent = t.lockLeft;
      tickPenalty(g, i);
    } else {
      nextQuestion(t);
      updateLane(i);
      renderPanel(i);
    }
  }, 1000);
}

function endGame() {
  const g = game;
  if (!g || g.over) return;
  g.over = true;
  g.timers.forEach(clearTimeout);
  g.timers = [];
  $('#countdown').hidden = true;

  const ranked = g.teams.slice().sort((a, b) =>
    (a.rank ?? 99) - (b.rank ?? 99) || b.progress - a.progress || a.wrong - b.wrong);

  // Regu yang belum finish dengan skor dan jumlah salah sama mendapat peringkat sama.
  let place = 0;
  const rows = ranked.map((t, idx) => {
    const prev = ranked[idx - 1];
    const tied = prev && !t.rank && !prev.rank && prev.progress === t.progress && prev.wrong === t.wrong;
    if (!tied) place = idx + 1;
    return `<li class="result-row${place === 1 ? ' is-first' : ''}" style="--team:${t.color}">
      <span class="result-place">${place}</span>
      <span class="result-name">${esc(t.name)}</span>
      <span class="result-stat">${t.progress}/${g.target} benar · ${t.wrong} salah</span>
    </li>`;
  });
  $('#results-list').innerHTML = rows.join('');
  $('#results').hidden = false;
  sound('finish');
  $('#btn-again').focus();
}

function exitGame() {
  if (game && game.started && !game.over && !confirm('Keluar dari lomba? Skor lomba ini akan hilang.')) return;
  if (game) {
    game.over = true;
    game.timers.forEach(clearTimeout);
  }
  game = null;
  $('#results').hidden = true;
  $('#countdown').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  show('home');
}

/* ---------- Pasang event ---------- */
function init() {
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) show(go.dataset.go);
  });

  // Kelola soal
  $('#q-form').addEventListener('submit', submitForm);
  $('#form-cancel').addEventListener('click', () => { resetForm(); renderEditor(); });
  $('#q-list').addEventListener('click', onListClick);
  $('#btn-export').addEventListener('click', exportQuestions);
  $('#btn-clear').addEventListener('click', () => {
    if (!questions.length || !confirm(`Hapus semua ${questions.length} soal? Tindakan ini tidak bisa dibatalkan.`)) return;
    questions = [];
    saveQuestions();
    resetForm();
    renderEditor();
  });
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    openPaste(await file.text());
    toast('File dimuat. Pilih "Tambahkan" atau "Ganti semua soal".');
  });

  // Dialog tempel
  const dialog = $('#paste-dialog');
  $('#ai-prompt').textContent = AI_PROMPT;
  $('#btn-paste').addEventListener('click', () => openPaste());
  $('[data-close]', dialog).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  $('#btn-copy-prompt').addEventListener('click', async () => {
    toast((await copyText(AI_PROMPT)) ? 'Perintah disalin' : 'Gagal menyalin. Blok teksnya lalu salin manual.');
  });
  $('#btn-paste-add').addEventListener('click', () => applyPaste('add'));
  $('#btn-paste-replace').addEventListener('click', () => applyPaste('replace'));

  // Pengaturan
  $('#team-count').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-n]');
    if (!btn) return;
    setup.teams = Number(btn.dataset.n);
    saveSetup();
    renderSetup();
  });
  $('#team-names').addEventListener('input', (e) => {
    const i = Number(e.target.dataset.i);
    if (Number.isInteger(i)) { setup.names[i] = e.target.value; saveSetup(); }
  });
  $('#target').addEventListener('change', (e) => {
    setup.target = clamp(parseInt(e.target.value, 10) || 10, 3, 30);
    e.target.value = setup.target;
    saveSetup();
    renderSetupNote();
  });
  $('#penalty').addEventListener('change', (e) => {
    const n = parseInt(e.target.value, 10);
    setup.penalty = clamp(Number.isNaN(n) ? 3 : n, 0, 15);
    e.target.value = setup.penalty;
    saveSetup();
  });
  $('#btn-start').addEventListener('click', startGame);

  // Lomba. pointerdown dipakai agar beberapa regu bisa menekan layar sentuh bersamaan.
  const panels = $('#panels');
  panels.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.opt');
    if (!btn || btn.disabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    answer(Number(btn.dataset.team), Number(btn.dataset.k));
  });
  panels.addEventListener('click', (e) => {
    if (e.detail !== 0) return; // hanya klik dari keyboard (Enter/Spasi)
    const btn = e.target.closest('.opt');
    if (btn && !btn.disabled) answer(Number(btn.dataset.team), Number(btn.dataset.k));
  });

  $('#btn-sound').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute('aria-pressed', String(soundOn));
    e.currentTarget.textContent = soundOn ? 'Suara: nyala' : 'Suara: mati';
  });
  $('#btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => toast('Layar penuh tidak didukung di browser ini'));
  });
  document.addEventListener('fullscreenchange', () => {
    $('#btn-full').textContent = document.fullscreenElement ? 'Keluar layar penuh' : 'Layar penuh';
  });
  $('#btn-end').addEventListener('click', () => {
    if (!game || game.over) return;
    if (confirm('Akhiri lomba sekarang dan lihat hasilnya?')) endGame();
  });
  $('#btn-exit').addEventListener('click', exitGame);
  $('#btn-again').addEventListener('click', startGame);
  $('#btn-menu').addEventListener('click', exitGame);

  window.addEventListener('beforeunload', (e) => {
    if (game && game.started && !game.over) { e.preventDefault(); e.returnValue = ''; }
  });

  show('home');
}

init();
