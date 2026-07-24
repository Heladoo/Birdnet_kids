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

function formatMeta(data, sortKey) {
  if (sortKey === 'week_count') {
    const n = Number(data.week_count);
    return `Heard ${n} time${n === 1 ? '' : 's'} this week`;
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

  const img = document.createElement('img');
  img.src = data.image || 'bird-placeholder.svg';
  img.alt = data.name;
  img.addEventListener('error', () => {
    img.src = 'bird-placeholder.svg';
  }, { once: true });
  btn.appendChild(img);

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
    btn.appendChild(badges);
  }

  const badge = document.createElement('span');
  badge.className = 'play-badge';
  badge.textContent = '▶';
  btn.appendChild(badge);

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
