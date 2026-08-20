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

  const secondOpinion = document.createElement('span');
  secondOpinion.className = 'second-opinion';
  if (currentSortKey === 'certainty' && data.second_opinion) {
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
