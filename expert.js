const tbody = document.getElementById('tbody');
const countLine = document.getElementById('count-line');
const search = document.getElementById('search');
const searchCount = document.getElementById('search-count');

function fmtPct(v, digits) {
  return v === null || v === undefined ? '—' : (v * 100).toFixed(digits) + '%';
}

function makeRow(r) {
  const tr = document.createElement('tr');

  const cellName = document.createElement('td');
  cellName.dataset.search = 'name';
  cellName.textContent = r.com;
  tr.appendChild(cellName);

  const cellHe = document.createElement('td');
  cellHe.className = 'he';
  cellHe.dataset.search = 'name';
  cellHe.textContent = r.he || '';
  tr.appendChild(cellHe);

  const cellSci = document.createElement('td');
  cellSci.dataset.search = 'name';
  const em = document.createElement('em');
  em.textContent = r.sci;
  cellSci.appendChild(em);
  tr.appendChild(cellSci);

  const cellBadges = document.createElement('td');
  cellBadges.className = 'num';
  cellBadges.dataset.sort = String((r.badges || []).length);
  cellBadges.textContent = (r.badges || []).map((b) => b.icon).join(' ');
  tr.appendChild(cellBadges);

  const cellOrder = document.createElement('td');
  cellOrder.textContent = r.order || '';
  tr.appendChild(cellOrder);

  const cellFamily = document.createElement('td');
  cellFamily.textContent = r.family || '';
  tr.appendChild(cellFamily);

  const cellLocal = document.createElement('td');
  cellLocal.className = 'num';
  cellLocal.dataset.sort = r.local === null ? '-1' : String(r.local);
  cellLocal.textContent = r.local === null ? '—' : String(r.local);
  tr.appendChild(cellLocal);

  const cellResidency = document.createElement('td');
  cellResidency.textContent = r.residency || '—';
  tr.appendChild(cellResidency);

  const cellDawnPct = document.createElement('td');
  cellDawnPct.className = 'num';
  cellDawnPct.dataset.sort = r.dawn_total > 0 ? String(r.dawn_frac) : '-1';
  cellDawnPct.textContent = r.dawn_total > 0 ? Math.round(r.dawn_frac * 100) + '%' : '—';
  tr.appendChild(cellDawnPct);

  const cellDawnN = document.createElement('td');
  cellDawnN.className = 'num';
  cellDawnN.dataset.sort = String(r.dawn_total);
  cellDawnN.textContent = String(r.dawn_total);
  tr.appendChild(cellDawnN);

  const cellWeek = document.createElement('td');
  cellWeek.className = 'num';
  cellWeek.dataset.sort = String(r.week);
  cellWeek.textContent = String(r.week);
  tr.appendChild(cellWeek);

  const cellLastSeen = document.createElement('td');
  cellLastSeen.textContent = r.last_seen;
  tr.appendChild(cellLastSeen);

  const cellConf = document.createElement('td');
  cellConf.className = 'num';
  cellConf.dataset.sort = r.confidence === null ? '-1' : String(r.confidence);
  cellConf.textContent = fmtPct(r.confidence, 1);
  tr.appendChild(cellConf);

  const cellV3 = document.createElement('td');
  cellV3.className = 'num';
  if (r.v3_confidence === null || r.v3_confidence === undefined) {
    cellV3.dataset.sort = '-1';
    cellV3.textContent = '—';
  } else {
    cellV3.classList.add(r.v3_confidence >= 0.3 ? 'yes' : 'no');
    cellV3.dataset.sort = String(r.v3_confidence);
    cellV3.textContent = fmtPct(r.v3_confidence, 1);
    if (r.v3_top_label) {
      const label = r.v3_top_label.replace('_', ' — ');
      cellV3.title = `V3.0 top guess: ${label} (${fmtPct(r.v3_top_confidence, 1)})`;
    }
  }
  tr.appendChild(cellV3);

  const cellV3Top = document.createElement('td');
  if (!r.v3_top_label) {
    cellV3Top.dataset.sort = '-1';
    cellV3Top.textContent = '—';
  } else {
    const [topSci, topCom] = r.v3_top_label.split(/_(.*)/s);
    const matches = topSci === r.sci;
    cellV3Top.classList.add(matches ? 'yes' : 'no');
    cellV3Top.dataset.sort = String(r.v3_top_confidence);
    cellV3Top.textContent = `${topCom || topSci} (${fmtPct(r.v3_top_confidence, 1)})`;
  }
  tr.appendChild(cellV3Top);

  const cellPerch = document.createElement('td');
  cellPerch.className = 'num';
  if (r.perch_confidence === null || r.perch_confidence === undefined) {
    cellPerch.dataset.sort = '-1';
    cellPerch.textContent = '—';
  } else {
    cellPerch.classList.add(r.perch_confidence >= 0.3 ? 'yes' : 'no');
    cellPerch.dataset.sort = String(r.perch_confidence);
    cellPerch.textContent = fmtPct(r.perch_confidence, 1);
    if (r.perch_top_label) {
      const label = r.perch_top_label.replace('_', ' — ');
      cellPerch.title = `Perch top guess: ${label} (${fmtPct(r.perch_top_confidence, 1)})`;
    }
  }
  tr.appendChild(cellPerch);

  const cellPerchTop = document.createElement('td');
  if (!r.perch_top_label) {
    cellPerchTop.dataset.sort = '-1';
    cellPerchTop.textContent = '—';
  } else {
    const [perchTopSci, perchTopCom] = r.perch_top_label.split(/_(.*)/s);
    const perchMatches = perchTopSci === r.sci;
    cellPerchTop.classList.add(perchMatches ? 'yes' : 'no');
    cellPerchTop.dataset.sort = String(r.perch_top_confidence);
    cellPerchTop.textContent = `${perchTopCom || perchTopSci} (${fmtPct(r.perch_top_confidence, 1)})`;
  }
  tr.appendChild(cellPerchTop);

  const cellPhoto = document.createElement('td');
  cellPhoto.classList.add(r.photo ? 'yes' : 'no');
  cellPhoto.dataset.sort = r.photo ? '1' : '0';
  cellPhoto.textContent = r.photo ? '✓' : '—';
  tr.appendChild(cellPhoto);

  const cellAudio = document.createElement('td');
  if (r.audio) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = r.audio;
    cellAudio.appendChild(audio);
  } else {
    cellAudio.textContent = '—';
  }
  tr.appendChild(cellAudio);

  return tr;
}

let allData = [];

fetch('expert-data.json')
  .then((r) => r.json())
  .then((data) => {
    allData = data;
    countLine.textContent = `${data.length} species · full BirdNET Kids dataset`;
    data.forEach((r) => tbody.appendChild(makeRow(r)));
    wireSort();
  })
  .catch(() => {
    countLine.textContent = 'Could not load the data right now. Try again later!';
  });

function wireSort() {
  const table = document.querySelector('table');
  table.querySelectorAll('th').forEach((th, colIndex) => {
    th.addEventListener('click', () => {
      const dir = th.classList.contains('sorted-asc') ? 'desc' : 'asc';
      table.querySelectorAll('th').forEach((h) => h.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');

      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const cellA = a.children[colIndex];
        const cellB = b.children[colIndex];
        const rawA = cellA.dataset.sort;
        const rawB = cellB.dataset.sort;
        let cmp;
        if (rawA !== undefined && rawB !== undefined) {
          cmp = parseFloat(rawA) - parseFloat(rawB);
        } else {
          cmp = cellA.textContent.trim().localeCompare(cellB.textContent.trim(), undefined, { sensitivity: 'base', numeric: true });
        }
        return dir === 'asc' ? cmp : -cmp;
      });
      rows.forEach((r) => tbody.appendChild(r));
    });
  });
}

search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  let visible = 0;
  Array.from(tbody.querySelectorAll('tr')).forEach((row) => {
    const nameCells = row.querySelectorAll('[data-search="name"]');
    const match = !q || Array.from(nameCells).some((c) => c.textContent.toLowerCase().includes(q));
    row.style.display = match ? '' : 'none';
    if (match) {
      visible++;
    }
  });
  searchCount.textContent = q ? `${visible} of ${allData.length} species match` : '';
});
