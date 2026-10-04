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

// Badge tooltips on the cards (Migrant, Rare, ...). Desktop: hover. Touch:
// tap (hover doesn't exist there). Tapping a badge shows its tip instead of
// playing the card; tapping anywhere else hides it.
let badgeTipTimer = null;

function hideBadgeTips() {
  clearTimeout(badgeTipTimer);
  document.querySelectorAll('.badge-tip.show').forEach((t) => t.classList.remove('show'));
}

function showBadgeTip(badge) {
  const tip = badge.closest('.photo').querySelector('.badge-tip');
  if (!tip) {
    return;
  }
  hideBadgeTips();
  tip.textContent = badge.dataset.en || '';
  if (badge.dataset.he) {
    const he = document.createElement('span');
    he.lang = 'he';
    he.dir = 'rtl';
    he.textContent = badge.dataset.he;
    tip.append(' · ', he);
  }
  tip.classList.add('show');
  badgeTipTimer = setTimeout(hideBadgeTips, 3500);
}

function wireBadge(badge) {
  badge.addEventListener('mouseenter', () => showBadgeTip(badge));
  badge.addEventListener('mouseleave', hideBadgeTips);
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    showBadgeTip(badge);
  });
}

document.addEventListener('click', hideBadgeTips);

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
      chip.dataset.en = b.en || '';
      chip.dataset.he = b.he || '';
      chip.setAttribute('aria-label', `${b.en || ''} - ${b.he || ''}`);
      wireBadge(chip);
      badges.appendChild(chip);
    });
    photo.appendChild(badges);
    const badgeTip = document.createElement('span');
    badgeTip.className = 'badge-tip';
    photo.appendChild(badgeTip);
  }

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
const modalCredit = modal ? modal.querySelector('.modal-credit') : null;
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

// `tip` adds a tiny (?) next to the label: hover/focus shows it on desktop,
// tapping toggles it on touch screens (see the click handlers below).
function fact(label, value, tip) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const help = tip
    ? `<span class="tip" role="button" tabindex="0" aria-label="${tip}" data-tip="${tip}">?</span>`
    : '';
  return `<dt>${label}${help}</dt><dd>${value}</dd>`;
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

  // Labelled chips (icon + name) rather than bare icons: nothing to hover or
  // tap, and they read properly in a screenshot.
  modalBadges.innerHTML = '';
  (Array.isArray(data.badges) ? data.badges : []).forEach((b) => {
    const chip = document.createElement('span');
    chip.className = 'modal-chip';
    chip.textContent = `${b.i} ${b.en || ''}`;
    if (b.he) {
      chip.title = b.he;
    }
    modalBadges.appendChild(chip);
  });

  setModalAudio(data.audio || '', false);
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

  modalScores.innerHTML = '<span class="scores-label">Confidence:</span>' + [
    scoreSpan('🐦', 'BirdNET v2.4 (our main model)', data.v2_confidence, true),
    scoreSpan('3️⃣', 'BirdNET+ V3.0 developer preview', data.v3_confidence, data.v3_agrees),
    scoreSpan('<strong>G</strong>', 'Google Perch v2', data.perch_confidence, data.perch_agrees),
  ].join('');

  renderSuggestions(data);
  renderCredit(data.credit);

  const lastHeard = new Date(data.last_seen);
  modalFacts.innerHTML = [
    fact('Regional records', data.local === null || data.local === undefined ? null : data.local, TIP_REGIONAL),
    // dawn_total is the species' all-time detection count at OUR station
    // (kids_dawn_fraction returns [dawn share, total]).
    fact('Total detections', data.dawn_total > 0 ? Number(data.dawn_total).toLocaleString() : null, TIP_TOTAL),
    fact('Heard this week', weekText(Number(data.week_count), weekRank(data))),
    fact('Last heard', isNaN(lastHeard) ? '' : formatDate(lastHeard)),
  ].join('');
}

const TIP_REGIONAL = 'Public GBIF sightings within ~35 km (not our own station)';
const TIP_TOTAL = 'How many times our own station has heard this species, all time';

// Minimal photo credit: a link to the Wikimedia file page (which names the
// author and license) plus the license when known.
function renderCredit(credit) {
  modalCredit.textContent = '';
  if (!credit) {
    return;
  }
  const link = document.createElement('a');
  link.href = credit.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Wikimedia Commons';
  modalCredit.append('Photo: ', link, credit.license ? ` · ${credit.license}` : '');
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
  const label = document.createElement('span');
  label.className = 'clips-label';
  label.textContent = 'Recordings:';
  modalClips.appendChild(label);
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `clip-btn${i === 0 ? ' active' : ''}`;
    btn.textContent = names[i];
    btn.addEventListener('click', () => {
      modalClips.querySelectorAll('.clip-btn').forEach((b) => b.classList.toggle('active', b === btn));
      setModalAudio(opt.audio, true);
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

// Share of all-time detections per time-of-day band (dawn, morning, ...).
// Bands come from the server (kids_time_of_day) so their names and clock
// windows live in one place.
function renderTimeOfDay(tod) {
  const total = (tod || []).reduce((sum, b) => sum + b.count, 0);
  if (!total) {
    chartWrap.innerHTML = '<p class="chart-empty">No data yet</p>';
    return;
  }
  const W = 340;
  const H = 172;
  const left = 36;
  const right = 6;
  const top = 16;
  const bottom = 40;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const n = tod.length;
  const slot = plotW / n;
  const barWidth = slot * 0.66;
  const shares = tod.map((b) => (b.count / total) * 100);
  const axisMax = Math.max(10, Math.ceil(Math.max(...shares) / 10) * 10);
  const yOf = (v) => top + plotH - (v / axisMax) * plotH;

  let grid = '';
  [[axisMax, 'chart-grid'], [axisMax / 2, 'chart-grid'], [0, 'chart-baseline']].forEach(([v, cls]) => {
    const y = yOf(v);
    grid += `<line class="${cls}" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/>`;
    grid += `<text class="chart-axis" x="${left - 4}" y="${y + 2.8}" text-anchor="end">${v === 0 ? '0' : `${v}%`}</text>`;
  });

  let bars = '';
  tod.forEach((b, i) => {
    const share = shares[i];
    const cx = left + i * slot + slot / 2;
    const barHeight = (share / axisMax) * plotH;
    const y = top + plotH - barHeight;
    const shareText = share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
    bars += `<rect class="chart-bar" x="${cx - barWidth / 2}" y="${y}" width="${barWidth}" height="${barHeight}"><title>${b.count} detections</title></rect>`;
    bars += `<text class="chart-value" x="${cx}" y="${y - 3}" text-anchor="middle">${shareText}</text>`;
    bars += `<text class="chart-axis chart-axis-strong" x="${cx}" y="${H - 22}" text-anchor="middle">${b.label}</text>`;
    bars += `<text class="chart-axis" x="${cx}" y="${H - 11}" text-anchor="middle">${b.range}</text>`;
  });

  chartWrap.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">${grid}${bars}</svg>`
    + `<p class="chart-note">Share of all ${total.toLocaleString()} detections, by time of day (all time)</p>`;
}

function renderPeriod() {
  if (!currentHistory) {
    return;
  }
  if (currentPeriod === 'tod') {
    renderTimeOfDay(currentHistory.tod);
  } else {
    renderChart(currentHistory[currentPeriod], currentPeriod);
  }
}

function setPeriod(period) {
  currentPeriod = period;
  periodButtons.forEach((b) => b.classList.toggle('active', b.dataset.period === period));
  renderPeriod();
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
    currentHistory = all[sci] || { daily: [], weekly: [], clips: [], tod: [] };
    renderPeriod();
    renderClips(currentHistory.clips, modalAudio.getAttribute('src'));
  });
}

/* ---------------------------------------------------------------------------
 * Sound player. Instead of the browser's bare audio bar it draws what the
 * clip looks like: a spectrogram on top (pitch on the vertical axis, time
 * left to right, brighter = louder at that pitch) and the loudness envelope
 * underneath, with a playhead you can click or drag to jump around.
 *
 * Playback itself is still a plain <audio> element (hidden); the picture is
 * built once per clip by decoding the same mp3 with the Web Audio API and
 * running a small FFT, then cached. If anything fails (old browser, decode
 * error) it falls back to the native controls so playback always works.
 * ------------------------------------------------------------------------ */

const playerVisual = modal ? modal.querySelector('.player-visual') : null;
const playerCanvas = modal ? modal.querySelector('.player-canvas') : null;
const playerFreq = modal ? modal.querySelector('.player-freq') : null;
const playerHead = modal ? modal.querySelector('.player-playhead') : null;
const playerStatus = modal ? modal.querySelector('.player-status') : null;
const playerControls = modal ? modal.querySelector('.player-controls') : null;
const playerBtn = modal ? modal.querySelector('.player-btn') : null;
const playerTime = modal ? modal.querySelector('.player-time') : null;

const PLAYER_W = 800;
const SPEC_H = 104;
const WAVE_Y = 112;
const WAVE_H = 32;
const PLAYER_H = WAVE_Y + WAVE_H;
const FMAX = 10000; // Hz shown; most bird song sits well below this
const FFT_N = 1024;

const visualCache = new Map(); // audio src -> {canvas, duration}
let visualSrc = null;
let visualDuration = 0;
let audioCtx = null;
let playerRaf = null;

const hannWindow = new Float32Array(FFT_N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1)));
const fftCos = new Float32Array(FFT_N / 2).map((_, k) => Math.cos((2 * Math.PI * k) / FFT_N));
const fftSin = new Float32Array(FFT_N / 2).map((_, k) => Math.sin((2 * Math.PI * k) / FFT_N));

// In-place radix-2 FFT.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = fftCos[k * step];
        const wi = -fftSin[k * step];
        const a = i + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

// Dark brown -> terracotta -> pale cream, matching the app's palette.
const SPEC_STOPS = [
  [0, [42, 33, 24]],
  [0.4, [150, 60, 35]],
  [0.75, [217, 122, 66]],
  [1, [255, 236, 190]],
];
const specPalette = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  let s = 1;
  while (s < SPEC_STOPS.length - 1 && v > SPEC_STOPS[s][0]) {
    s++;
  }
  const [v0, c0] = SPEC_STOPS[s - 1];
  const [v1, c1] = SPEC_STOPS[s];
  const t = (v - v0) / (v1 - v0);
  return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
});

// Renders a decoded clip to an offscreen PLAYER_W x PLAYER_H canvas.
function buildVisual(buffer) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const off = document.createElement('canvas');
  off.width = PLAYER_W;
  off.height = PLAYER_H;
  const ctx = off.getContext('2d');
  ctx.fillStyle = '#2A2118';
  ctx.fillRect(0, 0, PLAYER_W, PLAYER_H);

  // Spectrogram: one FFT per pixel column, frequency axis 0..FMAX.
  const bins = Math.max(8, Math.floor(FMAX / (sr / FFT_N)));
  const mags = new Float32Array(PLAYER_W * bins);
  const re = new Float32Array(FFT_N);
  const im = new Float32Array(FFT_N);
  for (let c = 0; c < PLAYER_W; c++) {
    const start = Math.floor(((c + 0.5) / PLAYER_W) * data.length) - FFT_N / 2;
    for (let i = 0; i < FFT_N; i++) {
      const idx = start + i;
      re[i] = idx >= 0 && idx < data.length ? data[idx] * hannWindow[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      const db = 20 * Math.log10(Math.sqrt(re[b] * re[b] + im[b] * im[b]) / FFT_N + 1e-9);
      mags[c * bins + b] = db;
    }
  }
  // Scale to the clip itself: the median level is background noise (shown
  // dark) and the 99.7th percentile is the loud end. Scaling to the single
  // loudest pixel would make quiet, faint recordings look empty.
  const sorted = Float32Array.from(mags).sort();
  const floorDb = sorted[Math.floor(sorted.length * 0.6)];
  const topDb = Math.max(floorDb + 6, sorted[Math.floor(sorted.length * 0.997)]);
  const img = ctx.createImageData(PLAYER_W, SPEC_H);
  for (let c = 0; c < PLAYER_W; c++) {
    for (let y = 0; y < SPEC_H; y++) {
      const bin = Math.min(bins - 1, Math.floor((1 - (y + 0.5) / SPEC_H) * bins));
      const v = Math.pow(Math.min(1, Math.max(0, (mags[c * bins + bin] - floorDb) / (topDb - floorDb))), 1.2);
      const [r, g, b] = specPalette[Math.round(v * 255)];
      const p = (y * PLAYER_W + c) * 4;
      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Loudness envelope: peak per column, mirrored around a centre line.
  const peaks = new Float32Array(PLAYER_W);
  let maxPeak = 1e-6;
  for (let c = 0; c < PLAYER_W; c++) {
    const from = Math.floor((c / PLAYER_W) * data.length);
    const to = Math.max(from + 1, Math.floor(((c + 1) / PLAYER_W) * data.length));
    let peak = 0;
    for (let i = from; i < to; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) {
        peak = a;
      }
    }
    peaks[c] = peak;
    if (peak > maxPeak) {
      maxPeak = peak;
    }
  }
  const cy = WAVE_Y + WAVE_H / 2;
  ctx.fillStyle = 'rgba(255, 249, 239, 0.18)';
  ctx.fillRect(0, cy, PLAYER_W, 1);
  ctx.fillStyle = '#E8955E';
  for (let c = 0; c < PLAYER_W; c++) {
    const h = Math.max(1, (peaks[c] / maxPeak) * (WAVE_H / 2));
    ctx.fillRect(c, cy - h, 1, h * 2);
  }
  return off;
}

function decodeAudio(arrayBuffer) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Callback form: older Safari has no promise version.
  return new Promise((resolve, reject) => audioCtx.decodeAudioData(arrayBuffer, resolve, reject));
}

function fmtSec(s) {
  return (Number.isFinite(s) ? s : 0).toFixed(1);
}

function updatePlayerUi() {
  const dur = modalAudio.duration || visualDuration || 0;
  const cur = modalAudio.currentTime || 0;
  playerHead.style.left = dur ? `${Math.min(100, (cur / dur) * 100)}%` : '0%';
  playerTime.textContent = `${fmtSec(cur)} / ${fmtSec(dur)} s`;
}

function playerTick() {
  updatePlayerUi();
  if (!modalAudio.paused) {
    playerRaf = requestAnimationFrame(playerTick);
  }
}

function fallbackToNativePlayer() {
  playerVisual.hidden = true;
  playerControls.hidden = true;
  modalAudio.controls = true;
}

function loadVisual(src) {
  visualSrc = src;
  visualDuration = 0;
  const ctx = playerCanvas.getContext && playerCanvas.getContext('2d');
  if (!ctx) {
    fallbackToNativePlayer();
    return;
  }
  ctx.fillStyle = '#2A2118';
  ctx.fillRect(0, 0, PLAYER_W, PLAYER_H);
  playerStatus.textContent = src ? 'Loading sound…' : '';
  if (!src) {
    return;
  }
  const show = (entry) => {
    if (src !== visualSrc) {
      return;
    }
    ctx.drawImage(entry.canvas, 0, 0);
    playerStatus.textContent = '';
    visualDuration = entry.duration;
    updatePlayerUi();
  };
  if (visualCache.has(src)) {
    show(visualCache.get(src));
    return;
  }
  fetch(src)
    .then((r) => r.arrayBuffer())
    .then(decodeAudio)
    .then((buffer) => {
      const entry = { canvas: buildVisual(buffer), duration: buffer.duration };
      visualCache.set(src, entry);
      show(entry);
    })
    .catch(() => {
      if (src === visualSrc) {
        playerStatus.textContent = '';
        fallbackToNativePlayer();
      }
    });
}

// The one place the popup's audio source changes (initial clip, or picking
// the 2nd/3rd recording).
function setModalAudio(src, autoplay) {
  cancelAnimationFrame(playerRaf);
  modalAudio.pause();
  modalAudio.src = src || '';
  modalAudio.controls = false;
  playerVisual.hidden = false;
  playerControls.hidden = false;
  playerBtn.textContent = '▶';
  updatePlayerUi();
  loadVisual(src);
  if (autoplay) {
    const playing = modalAudio.play();
    if (playing && playing.catch) {
      playing.catch(() => {});
    }
  }
}

if (modal) {
  // Frequency scale along the left edge of the spectrogram.
  [2, 4, 6, 8].forEach((k) => {
    const label = document.createElement('span');
    label.className = 'player-freq-label';
    label.textContent = `${k}k`;
    label.style.top = `${(1 - (k * 1000) / FMAX) * (SPEC_H / PLAYER_H) * 100}%`;
    playerFreq.appendChild(label);
  });

  playerBtn.addEventListener('click', () => {
    if (modalAudio.paused) {
      const playing = modalAudio.play();
      if (playing && playing.catch) {
        playing.catch(() => {});
      }
    } else {
      modalAudio.pause();
    }
  });
  modalAudio.addEventListener('play', () => {
    playerBtn.textContent = '⏸';
    playerTick();
  });
  ['pause', 'ended'].forEach((name) => modalAudio.addEventListener(name, () => {
    playerBtn.textContent = '▶';
    cancelAnimationFrame(playerRaf);
    updatePlayerUi();
  }));
  ['timeupdate', 'loadedmetadata', 'seeked'].forEach((name) => modalAudio.addEventListener(name, updatePlayerUi));

  // Click or drag on the picture to jump to that moment.
  let scrubbing = false;
  const seekTo = (e) => {
    const rect = playerVisual.getBoundingClientRect();
    const dur = modalAudio.duration || visualDuration;
    if (!dur || !rect.width) {
      return;
    }
    modalAudio.currentTime = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * dur;
    updatePlayerUi();
  };
  playerVisual.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    playerVisual.setPointerCapture(e.pointerId);
    seekTo(e);
  });
  playerVisual.addEventListener('pointermove', (e) => {
    if (scrubbing) {
      seekTo(e);
    }
  });
  ['pointerup', 'pointercancel'].forEach((name) => playerVisual.addEventListener(name, () => {
    scrubbing = false;
  }));
}

// Put each (?) bubble just under its own row. Needs layout, so it runs after
// the popup is shown.
function positionTips() {
  modalFacts.querySelectorAll('.tip').forEach((tip) => {
    tip.style.setProperty('--tip-top', `${tip.offsetTop + tip.offsetHeight + 6}px`);
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
  positionTips();
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
    // (?) tooltips: tapping one toggles it (hover alone doesn't exist on
    // touch screens); tapping anywhere else closes any that are open.
    const tip = e.target.closest('.tip');
    modal.querySelectorAll('.tip.open').forEach((t) => {
      if (t !== tip) {
        t.classList.remove('open');
      }
    });
    if (tip) {
      tip.classList.toggle('open');
      return;
    }
    if (e.target === modal) {
      closeModal();
    }
  });
  modal.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('tip')) {
      e.preventDefault();
      e.target.click();
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
