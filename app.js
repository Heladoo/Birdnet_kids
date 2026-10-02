const grid = document.getElementById('grid');
const player = document.getElementById('player');
let activeCard = null;
let cardsData = [];
let currentSortKey = 'last_seen';

function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy}, ${hh}:${min}`;
}

function formatScore(v) {
  return v === null || v === undefined ? '–' : `${Math.round(v * 100)}%`;
}

function certainty(data) {
  const scores = [data.v2_confidence, data.v3_confidence, data.perch_confidence].filter((c) => c !== null && c !== undefined);
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) : -1;
}

function formatMeta(data, sortKey) {
  if (sortKey === 'week_count') {
    const n = Number(data.week_count);
    return `Heard ${n} time${n === 1 ? '' : 's'} this week`;
  }
  if (sortKey === 'certainty') {
    const c = certainty(data);
    return c < 0 ? 'Certainty unknown' : `Certainty ${c}%`;
  }
  const d = new Date(data.last_seen);
  if (isNaN(d)) {
    return '';
  }
  return formatDate(d);
}

function setPlaying(card) {
  if (activeCard && activeCard !== card) {
    activeCard.classList.remove('playing');
  }
  activeCard = card;
  card.classList.add('playing');
}

function clearPlaying() {
  if (activeCard) {
    activeCard.classList.remove('playing');
    activeCard = null;
  }
}

function makeCard(data) {
  const btn = document.createElement('button');
  btn.className = 'card';
  btn.dataset.audio = data.audio;
  btn.dataset.lastSeen = data.last_seen;
  btn.dataset.weekCount = data.week_count;

  const photo = document.createElement('span');
  photo.className = 'photo';

  const img = document.createElement('img');
  img.src = data.image || 'bird-placeholder.svg';
  img.alt = data.name;
  img.addEventListener('error', () => {
    img.src = 'bird-placeholder.svg';
  }, { once: true });
  photo.appendChild(img);

  if (Array.isArray(data.badges) && data.badges.length) {
    const badges = document.createElement('span');
    badges.className = 'badges';
    data.badges.forEach((b) => {
      const chip = document.createElement('span');
      chip.className = 'badge';
      chip.textContent = b.i;
      if (b.he) {
        chip.title = b.he;
        chip.setAttribute('aria-label', b.he);
      }
      badges.appendChild(chip);
    });
    photo.appendChild(badges);
  }

  const badge = document.createElement('span');
  badge.className = 'play-badge';
  badge.textContent = '▶';
  photo.appendChild(badge);

  // A real <button> can't legally nest inside the card's own outer <button>
  // (browsers would hoist it out, breaking the DOM/click wiring), so this is
  // a span acting as a button: role, tabindex, and a keydown handler below
  // provide the equivalent a11y. Tapping the card itself still just plays
  // the clip - the detail popup lives behind this separate info icon so the
  // two interactions never collide.
  const info = document.createElement('span');
  info.className = 'info-badge';
  info.textContent = 'ⓘ';
  info.setAttribute('role', 'button');
  info.setAttribute('tabindex', '0');
  info.setAttribute('aria-label', `More about ${data.name}`);
  info.title = 'More about this bird';
  info.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(data);
  });
  info.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openModal(data);
    }
  });
  photo.appendChild(info);

  btn.appendChild(photo);

  const nameWrap = document.createElement('span');
  nameWrap.className = 'name';

  const nameEn = document.createElement('span');
  nameEn.className = 'name-en';
  nameEn.textContent = data.name;
  nameWrap.appendChild(nameEn);

  if (data.he_name) {
    const nameHe = document.createElement('span');
    nameHe.className = 'name-he';
    nameHe.lang = 'he';
    nameHe.dir = 'rtl';
    nameHe.textContent = data.he_name;
    nameWrap.appendChild(nameHe);
  }
  btn.appendChild(nameWrap);

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = formatMeta(data, currentSortKey);
  btn.appendChild(meta);

  // The dissent warning ("others hear a different species") is worth
  // surfacing everywhere - it's the strongest signal this page has that a
  // tag might be wrong. The confirmation badge stays Certainty-only so a
  // green "All models agree" doesn't clutter every other card view for the
  // majority of species where it would fire.
  const secondOpinion = document.createElement('span');
  secondOpinion.className = 'second-opinion';
  if (data.second_opinion && (data.second_opinion.agrees ? currentSortKey === 'certainty' : true)) {
    secondOpinion.textContent = data.second_opinion.agrees
      ? '✓ All models agree'
      : `⚠ Others hear: ${data.second_opinion.com}`;
    secondOpinion.classList.add(data.second_opinion.agrees ? 'agrees' : 'differs');
  }
  btn.appendChild(secondOpinion);

  const scores = document.createElement('span');
  scores.className = 'scores';

  // A model that actually picked our species (or came within a hair of it -
  // see v3_agrees/perch_agrees) renders dark green. V2.4 tagged the clip in
  // the first place, so it always counts as agreeing.
  const scoreV2 = document.createElement('span');
  scoreV2.className = 'score score-agrees';
  scoreV2.title = 'BirdNET v2.4 (our main model) — picked this species';
  scoreV2.textContent = `🐦 ${formatScore(data.v2_confidence)}`;
  scores.appendChild(scoreV2);

  const scoreV3 = document.createElement('span');
  scoreV3.className = data.v3_agrees ? 'score score-agrees' : 'score';
  scoreV3.title = 'BirdNET+ V3.0 developer preview'
    + (data.v3_confidence !== null && data.v3_confidence !== undefined
      ? (data.v3_agrees ? ' — picked this species' : ' — picked a different species') : '');
  scoreV3.textContent = `3️⃣ ${formatScore(data.v3_confidence)}`;
  scores.appendChild(scoreV3);

  const scorePerch = document.createElement('span');
  scorePerch.className = data.perch_agrees ? 'score score-agrees' : 'score';
  scorePerch.title = 'Google Perch v2'
    + (data.perch_confidence !== null && data.perch_confidence !== undefined
      ? (data.perch_agrees ? ' — picked this species' : ' — picked a different species') : '');
  scorePerch.innerHTML = `<strong>G</strong> ${formatScore(data.perch_confidence)}`;
  scores.appendChild(scorePerch);

  btn.appendChild(scores);

  btn.addEventListener('click', () => {
    const src = btn.dataset.audio;
    if (player.src.endsWith(src) && !player.paused) {
      player.pause();
      player.currentTime = 0;
      clearPlaying();
      return;
    }
    player.src = src;
    player.play();
    setPlaying(btn);
  });

  return btn;
}

function renderCards(cards) {
  grid.innerHTML = '';
  cards.forEach((data) => grid.appendChild(makeCard(data)));
}

let currentFilter = null;
const emptyState = document.getElementById('empty-state');

function applyView() {
  let visible = currentSortKey === 'week_count'
    ? cardsData.filter((d) => d.week_count > 0)
    : cardsData;
  if (currentFilter) {
    visible = visible.filter((d) => Array.isArray(d.badges) && d.badges.some((b) => b.i === currentFilter));
  }
  const sorted = [...visible].sort((a, b) => {
    if (currentSortKey === 'week_count') {
      return b.week_count - a.week_count;
    }
    if (currentSortKey === 'certainty') {
      return certainty(b) - certainty(a);
    }
    return b.last_seen.localeCompare(a.last_seen);
  });
  renderCards(sorted);
  if (emptyState) {
    emptyState.style.display = sorted.length === 0 ? '' : 'none';
  }
}

/* ---------------------------------------------------------------------------
 * Bird detail popup (info button on each card). Mirrors the LAN kids page's
 * modal (see index.php/app.js there) - same markup/CSS classes, same
 * agree/disagree score styling, same chart - adapted for this file's
 * JS-built cards: `openModal` works straight off the already-fetched `data`
 * object instead of parsing a DOM attribute, and the detections-over-time
 * graph is backed by a single pre-baked `history.json` (there's no live
 * backend here to query on demand) fetched once, lazily, and cached.
 * ------------------------------------------------------------------------ */

const modal = document.getElementById('bird-modal');
const modalClose = modal ? modal.querySelector('.modal-close') : null;
const modalPhoto = modal ? modal.querySelector('.modal-photo') : null;
const modalNameEn = modal ? modal.querySelector('.modal-name-en') : null;
const modalNameHe = modal ? modal.querySelector('.modal-name-he') : null;
const modalSci = modal ? modal.querySelector('.modal-sci') : null;
const modalBadges = modal ? modal.querySelector('.modal-badges') : null;
const modalAudio = modal ? modal.querySelector('.modal-audio') : null;
const modalSecondOpinion = modal ? modal.querySelector('.modal-second-opinion') : null;
const modalScores = modal ? modal.querySelector('.modal-scores') : null;
const modalSuggestions = modal ? modal.querySelector('.modal-suggestions') : null;
const modalClips = modal ? modal.querySelector('.modal-clips') : null;
const modalClipInfo = modal ? modal.querySelector('.modal-clip-info') : null;
const modalFacts = modal ? modal.querySelector('.modal-facts') : null;
const chartWrap = modal ? modal.querySelector('.chart-wrap') : null;
const periodButtons = modal ? Array.from(modal.querySelectorAll('.period-btn')) : [];

// The whole history.json, fetched at most once per page load regardless of
// how many popups get opened.
let historyPromise = null;
// Which species the popup is showing right now - lets a slow lazy fetch for
// a previously-opened bird recognize it's stale instead of painting over the
// current one.
let currentSci = null;
let currentHistory = null;
let currentPeriod = 'daily';
let lastFocused = null;

function fact(label, value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function scoreSpan(icon, label, conf, agrees) {
  const tip = label + (conf !== null && conf !== undefined
    ? (agrees ? ' — picked this species' : ' — picked a different species') : '');
  return `<span class="score${agrees ? ' score-agrees' : ''}" title="${tip}">${icon} ${formatScore(conf)}</span>`;
}

function populateModal(data) {
  modalNameEn.textContent = data.name;
  if (data.he_name) {
    modalNameHe.textContent = data.he_name;
    modalNameHe.hidden = false;
  } else {
    modalNameHe.textContent = '';
    modalNameHe.hidden = true;
  }
  modalSci.textContent = data.sci || '';
  modalPhoto.src = data.image || 'bird-placeholder.svg';
  modalPhoto.alt = data.name;

  modalBadges.innerHTML = (Array.isArray(data.badges) ? data.badges : [])
    .map((b) => `<span class="badge" title="${b.he || ''}" aria-label="${b.he || ''}">${b.i}</span>`)
    .join('');

  modalAudio.src = data.audio || '';
  renderClips(null, data.audio);

  // Unlike the card grid (where the confirmation half is Certainty-sort-only
  // to avoid clutter), the popup is a dedicated detail view - show whichever
  // variant applies, always.
  if (data.second_opinion) {
    const agrees = data.second_opinion.agrees;
    modalSecondOpinion.textContent = agrees ? '✓ All models agree' : `⚠ Others hear: ${data.second_opinion.com}`;
    modalSecondOpinion.className = `modal-second-opinion ${agrees ? 'agrees' : 'differs'}`;
  } else {
    modalSecondOpinion.textContent = '';
    modalSecondOpinion.className = 'modal-second-opinion';
  }

  modalScores.innerHTML = [
    scoreSpan('🐦', 'BirdNET v2.4 (our main model)', data.v2_confidence, true),
    scoreSpan('3️⃣', 'BirdNET+ V3.0 developer preview', data.v3_confidence, data.v3_agrees),
    scoreSpan('<strong>G</strong>', 'Google Perch v2', data.perch_confidence, data.perch_agrees),
  ].join('');

  renderSuggestions(data);

  const lastHeard = new Date(data.last_seen);
  modalFacts.innerHTML = [
    fact('Residency', data.residency),
    // dawn_total is the species' all-time detection count at OUR station
    // (kids_dawn_fraction returns [dawn share, total]); shown on its own so
    // it isn't mistaken for the GBIF "regional records" figure below.
    fact('Total detections', data.dawn_total > 0 ? Number(data.dawn_total).toLocaleString() : null),
    fact('Heard this week', weekText(Number(data.week_count), weekRank(data))),
    fact('Heard at dawn', data.dawn_total > 0 ? `${Math.round(data.dawn_frac * 100)}% (04:30–06:30)` : null),
    fact('Regional records', data.local === null || data.local === undefined ? null : data.local),
    fact('Last heard', isNaN(lastHeard) ? '' : formatDate(lastHeard)),
  ].join('');
}

// Where this species ranks among all species by detections in the last 7
// days (ties share a rank). Null when it wasn't heard this week.
function weekRank(data) {
  const mine = Number(data.week_count);
  if (!(mine > 0)) {
    return null;
  }
  return cardsData.filter((d) => Number(d.week_count) > mine).length + 1;
}

function weekText(n, rank) {
  const times = `${n} time${n === 1 ? '' : 's'}`;
  return rank ? `${times} · #${rank} most common` : times;
}

// For each cross-check model that picked a different species, say what it
// thought the clip was instead (label format is "Sci name_Common name").
function renderSuggestions(data) {
  modalSuggestions.innerHTML = '';
  [
    ['BirdNET+ V3.0', data.v3_agrees, data.v3_top_label, data.v3_top_confidence],
    ['Google Perch', data.perch_agrees, data.perch_top_label, data.perch_top_confidence],
  ].forEach(([model, agrees, label, conf]) => {
    if (agrees !== false || !label) {
      return;
    }
    const cut = label.indexOf('_');
    const common = cut >= 0 ? label.slice(cut + 1) : label;
    const line = document.createElement('div');
    line.textContent = `⚠ ${model} suggestion: ${common}${conf === null || conf === undefined ? '' : ` (${formatScore(conf)})`}`;
    modalSuggestions.appendChild(line);
  });
}

function clipCaption(clip) {
  const d = new Date(`${clip.date}T${clip.time}`);
  return `Heard ${isNaN(d) ? clip.date : formatDate(d)} · ${Math.round(clip.confidence * 100)}% sure`;
}

// Offers the species' top recordings as a row of buttons under the player.
// The clip the card plays (and the popup loads first) stays first; the other
// two come from history.json. Nothing is shown until there's more than one
// clip to choose from.
function renderClips(clips, currentAudio) {
  modalClips.innerHTML = '';
  modalClipInfo.textContent = '';
  if (!clips || clips.length < 2) {
    return;
  }
  const first = clips.find((c) => c.audio === currentAudio) || { audio: currentAudio };
  const options = [first, ...clips.filter((c) => c !== first).slice(0, 2)];
  const names = ['Best', '2nd', '3rd'];
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `clip-btn${i === 0 ? ' active' : ''}`;
    btn.textContent = names[i];
    btn.addEventListener('click', () => {
      modalClips.querySelectorAll('.clip-btn').forEach((b) => b.classList.toggle('active', b === btn));
      modalAudio.src = opt.audio;
      const playing = modalAudio.play();
      if (playing && playing.catch) {
        playing.catch(() => {});
      }
      modalClipInfo.textContent = opt.date ? clipCaption(opt) : '';
    });
    modalClips.appendChild(btn);
  });
  modalClipInfo.textContent = first.date ? clipCaption(first) : '';
}

function dateLabel(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d) {
  return d.toLocaleDateString('en', { month: 'short' });
}

// Renders `counts` (oldest -> newest) as a simple inline SVG bar chart - no
// charting library, matching this project's zero-dependency convention (the
// only external asset anywhere is the Google Fonts link).
function renderChart(counts, period) {
  if (!counts || !counts.length) {
    chartWrap.innerHTML = '<p class="chart-empty">No data yet</p>';
    return;
  }
  const unit = period === 'daily' ? 'day' : 'week';
  const max = Math.max(1, ...counts);
  const W = 340;
  const H = 150;
  const left = 46;
  const right = 6;
  const top = 10;
  const bottom = 20;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const n = counts.length;
  const barWidth = plotW / n;
  const labelEvery = period === 'daily' ? 5 : 8;
  const today = new Date();
  const yOf = (v) => top + plotH - (v / max) * plotH;
  const tick = (v) => (v >= 10 ? String(Math.round(v)) : Number.isInteger(v) ? String(v) : v.toFixed(1));

  // Gridlines at the top (busiest value) and middle, plus the zero baseline;
  // the Y labels carry the unit so each bar reads as "N per day/week".
  let grid = '';
  [[max, 'chart-grid'], [max / 2, 'chart-grid'], [0, 'chart-baseline']].forEach(([v, cls]) => {
    const y = yOf(v);
    grid += `<line class="${cls}" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/>`;
    grid += `<text class="chart-axis" x="${left - 4}" y="${y + 2.8}" text-anchor="end">${v === 0 ? '0' : `${tick(v)}/${unit}`}</text>`;
  });

  let bars = '';
  let labels = '';
  counts.forEach((c, i) => {
    const barHeight = (c / max) * plotH;
    const x = left + i * barWidth;
    bars += `<rect class="chart-bar" x="${x + 1}" y="${top + plotH - barHeight}" width="${Math.max(1, barWidth - 2)}" height="${barHeight}"><title>${c} per ${unit}</title></rect>`;

    const stepsFromNewest = n - 1 - i;
    const fromToday = period === 'daily' ? stepsFromNewest : stepsFromNewest * 7;
    if (stepsFromNewest % labelEvery === 0) {
      const d = new Date(today);
      d.setDate(d.getDate() - fromToday);
      const text = period === 'daily' ? dateLabel(d) : monthLabel(d);
      labels += `<text class="chart-axis" x="${x + barWidth / 2}" y="${H - 6}" text-anchor="middle">${text}</text>`;
    }
  });

  chartWrap.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">${grid}${bars}${labels}</svg>`;
}

function setPeriod(period) {
  currentPeriod = period;
  periodButtons.forEach((b) => b.classList.toggle('active', b.dataset.period === period));
  if (currentHistory) {
    renderChart(currentHistory[period], period);
  }
}

function fetchHistoryOnce() {
  if (!historyPromise) {
    historyPromise = fetch('history.json').then((r) => r.json()).catch(() => ({}));
  }
  return historyPromise;
}

function loadHistory(sci) {
  chartWrap.innerHTML = '<p class="chart-loading">Loading…</p>';
  currentHistory = null;
  fetchHistoryOnce().then((all) => {
    if (sci !== currentSci) {
      return;
    }
    currentHistory = all[sci] || { daily: [], weekly: [], clips: [] };
    renderChart(currentHistory[currentPeriod], currentPeriod);
    renderClips(currentHistory.clips, modalAudio.getAttribute('src'));
  });
}

function openModal(data) {
  if (!modal) {
    return;
  }
  currentSci = data.sci || null;
  populateModal(data);
  setPeriod('daily');
  if (data.sci) {
    loadHistory(data.sci);
  }

  lastFocused = document.activeElement;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  if (modalClose) {
    modalClose.focus();
  }
}

function closeModal() {
  if (!modal || modal.hidden) {
    return;
  }
  modal.hidden = true;
  document.body.classList.remove('modal-open');
  modalAudio.pause();
  if (lastFocused && lastFocused.focus) {
    lastFocused.focus();
  }
}

periodButtons.forEach((btn) => {
  btn.addEventListener('click', () => setPeriod(btn.dataset.period));
});

if (modalClose) {
  modalClose.addEventListener('click', closeModal);
  modalClose.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      closeModal();
    }
  });
}

if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
  }
});

document.querySelectorAll('.sort-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentSortKey = btn.dataset.sort;
    applyView();
  });
});

document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.badge || null;
    applyView();
  });
});

player.addEventListener('ended', clearPlaying);
player.addEventListener('pause', () => {
  if (player.currentTime === 0) {
    clearPlaying();
  }
});

fetch('data.json')
  .then((r) => r.json())
  .then((data) => {
    cardsData = data;
    applyView();
  })
  .catch(() => {
    grid.innerHTML = '<p class="loading">Could not load the birds right now. Try again later!</p>';
  });

fetch('https://abacus.jasoncameron.dev/hit/heladoo/birdnet-kids-site')
  .then((r) => r.json())
  .then((data) => {
    const el = document.getElementById('visit-count');
    if (el) {
      el.textContent = data.value.toLocaleString();
    }
  })
  .catch(() => {});
