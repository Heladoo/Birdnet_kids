/*
 * Anonymous usage counters for the public site. Loaded before app.js /
 * expert.js; exposes window.kidsStats.event(name).
 *
 * Counts only - no ids, no personal data leave the browser. Each counter is a
 * plain number on abacus.jasoncameron.dev (namespace "heladoo", keys "bk-*"),
 * which is also what the "visits" number in the page footer uses. Read them
 * with stats.html.
 *
 *   bk-visit            a visit = first activity after 30+ minutes of silence
 *   bk-user             a "user" = a browser seen for the first time (a device,
 *                       not a person - clearing site data makes it new again)
 *   bk-visit-active     visits with at least one interaction
 *   bk-visit-popup      visits that opened a bird's info popup
 *   bk-user-active      users who ever interacted
 *   bk-user-popup       users who ever opened an info popup
 *   bk-event            every interaction (total)
 *   bk-event-<name>     per kind: play, popup, clip, soundplay, graph, sort,
 *                       filter, tip, expert
 *   bk-src-<name>       where each visit came from (see sourceOf()):
 *                       whatsapp, facebook, instagram, telegram, x, reddit, youtube,
 *                       google, github, birdweather, email, other (a site we don't
 *                       list) and direct (no referrer - typed address, bookmark,
 *                       and most chat apps, WhatsApp included, which hide it)
 *   bk-usersrc-<name>   the same, for a browser's first visit only
 *   bk-tick             one per 30 s of *active* time (tab visible and the
 *                       person touched / scrolled / typed in the last minute)
 *
 * Opt out on your own device with ?stats=off on any page (?stats=on undoes it).
 */
(function () {
  'use strict';

  var BASE = 'https://abacus.jasoncameron.dev/hit/heladoo/';
  var SESSION_GAP = 30 * 60 * 1000;
  var TICK_MS = 30 * 1000;
  var IDLE_MS = 60 * 1000;

  // Referrer host -> source name. A link you share can also say so itself
  // (?src=whatsapp), which beats the referrer - chat apps rarely send one.
  var SOURCES = {
    whatsapp: ['whatsapp.com', 'wa.me'],
    facebook: ['facebook.com', 'fb.com', 'fb.me', 'messenger.com'],
    instagram: ['instagram.com'],
    telegram: ['t.me', 'telegram.org', 'telegram.me'],
    x: ['t.co', 'twitter.com', 'x.com'],
    reddit: ['reddit.com'],
    youtube: ['youtube.com', 'youtu.be'],
    google: ['google.com', 'google.co.il', 'bing.com', 'duckduckgo.com'],
    github: ['github.com', 'github.io'],
    birdweather: ['birdweather.com'],
    email: ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com']
  };

  function sourceOf() {
    var tag = /[?&](?:src|utm_source)=([a-z]+)/i.exec(location.search);
    if (tag) {
      var name = tag[1].toLowerCase();
      return name === 'twitter' ? 'x' : (SOURCES[name] ? name : 'other');
    }
    var host = '';
    try {
      host = new URL(document.referrer).hostname.toLowerCase();
    } catch (e) { /* no referrer */ }
    if (!host || host === location.hostname) {
      return 'direct';
    }
    for (var name2 in SOURCES) {
      for (var i = 0; i < SOURCES[name2].length; i++) {
        var d = SOURCES[name2][i];
        if (host === d || host.slice(-d.length - 1) === '.' + d) {
          // github.io is any GitHub Pages site, but ours is skipped above
          return name2;
        }
      }
    }
    return 'other';
  }

  // Only the page load that starts a visit knows its referrer; a visit that
  // resumes later in the same open page is not a new arrival.
  var arrival = sourceOf();

  var memory = {};
  function store(key, value) {
    try {
      if (value === undefined) {
        return localStorage.getItem(key);
      }
      localStorage.setItem(key, value);
    } catch (e) {
      if (value === undefined) {
        return memory[key] || null;
      }
      memory[key] = value;
    }
    return null;
  }

  var q = /[?&]stats=(on|off)\b/.exec(location.search);
  if (q) {
    store('bk-off', q[1] === 'off' ? '1' : '0');
  }
  var disabled = store('bk-off') === '1'
    || /^(localhost|127\.|\[::1\])/.test(location.hostname)
    || navigator.doNotTrack === '1';

  function hit(key) {
    if (disabled) {
      return;
    }
    try {
      fetch(BASE + key, { keepalive: true, mode: 'cors' }).catch(function () {});
    } catch (e) { /* counting must never break the page */ }
  }

  // Count something once per browser / once per visit.
  var visitFlags = {};
  function once(flag, key, scope) {
    if (scope === 'user') {
      if (store('bk-f-' + flag) === '1') {
        return;
      }
      store('bk-f-' + flag, '1');
    } else {
      if (visitFlags[flag]) {
        return;
      }
      visitFlags[flag] = true;
    }
    hit(key);
  }

  var lastInput = Date.now();
  var sessionChecked = false;

  // A visit starts with the first interaction/page view after a long gap.
  function touchSession() {
    var now = Date.now();
    var last = parseInt(store('bk-last') || '0', 10);
    if (!sessionChecked || now - last > SESSION_GAP) {
      if (now - last > SESSION_GAP) {
        visitFlags = {};
        var src = arrival || 'direct';
        arrival = null;
        hit('bk-visit');
        hit('bk-src-' + src);
        if (store('bk-f-user') !== '1') {
          store('bk-f-user', '1');
          hit('bk-user');
          hit('bk-usersrc-' + src);
        }
      }
      sessionChecked = true;
    }
    store('bk-last', String(now));
  }

  function markInput() {
    lastInput = Date.now();
    touchSession();
  }

  function event(name) {
    if (disabled) {
      return;
    }
    touchSession();
    hit('bk-event');
    hit('bk-event-' + name);
    once('active', 'bk-visit-active', 'visit');
    once('uactive', 'bk-user-active', 'user');
    if (name === 'popup') {
      once('popup', 'bk-visit-popup', 'visit');
      once('upopup', 'bk-user-popup', 'user');
    }
  }

  window.kidsStats = { event: event };

  if (!disabled) {
    touchSession();
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (name) {
      window.addEventListener(name, markInput, { passive: true, capture: true });
    });
    setInterval(function () {
      if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MS) {
        touchSession();
        hit('bk-tick');
      }
    }, TICK_MS);
  }
}());
