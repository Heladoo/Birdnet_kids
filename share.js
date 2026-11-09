/* Share sheet for the bird popup (public site only).
 *
 * Makes a short square video in the visitor's own browser: the recording as the
 * sound, with its spectrogram sweeping across and the bird's name above. The Pi
 * can't render on demand and the site is static, so this is the only place the
 * work can happen.
 *
 * Video: WebCodecs + mp4-muxer where both H.264 and AAC encoders exist, else
 * MediaRecorder's MP4 (Safari, in real time). A browser with neither can still
 * send the sound or the link.
 */
(function () {
  const SITE = 'https://heladoo.github.io/Birdnet_kids';
  const SITE_SHORT = 'heladoo.github.io/Birdnet_kids';
  const SIZE = 720;
  const FPS = 30;
  const HOLD = 1.8; // seconds the finished picture stays after the sound ends
  const SAMPLE_RATE = 44100;
  const AUDIO_FRAMES = 4096;

  const shareBtn = document.querySelector('.player-share');
  if (!shareBtn || !window.kidsShareState) {
    return;
  }

  const C = { dark: '#2A2118', cream: '#FBF7EC', peach: '#E8955E', pale: '#FFECBE' };
  const EN = (weight, size) => `${weight} ${size}px "Baloo 2", sans-serif`;
  const HE = (weight, size) => `${weight} ${size}px "Rubik", sans-serif`;

  /* ------------------------------------------------------------ spectrogram */
  const FFT_N = 2048, FMAX = 10000, SW = 1440, SH = 512;
  const hann = new Float32Array(FFT_N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1)));
  const fftCos = new Float32Array(FFT_N / 2).map((_, k) => Math.cos((2 * Math.PI * k) / FFT_N));
  const fftSin = new Float32Array(FFT_N / 2).map((_, k) => Math.sin((2 * Math.PI * k) / FFT_N));

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = fftCos[k * step], wi = -fftSin[k * step], a = i + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  const STOPS = [[0, [42, 33, 24]], [0.4, [150, 60, 35]], [0.75, [217, 122, 66]], [1, [255, 236, 190]]];
  const PALETTE = Array.from({ length: 256 }, (_, i) => {
    const v = i / 255;
    let s = 1;
    while (s < STOPS.length - 1 && v > STOPS[s][0]) s++;
    const [v0, c0] = STOPS[s - 1], [v1, c1] = STOPS[s], t = (v - v0) / (v1 - v0);
    return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
  });

  // Returns the played ("lit") and not-yet-played ("dim") pictures plus the
  // pitch range shown. Background removal, a loudness gate and an auto-zoom make
  // the call stand out; faint low-pitch speckle is deliberately left as it is.
  function buildSpectrogram(samples, sampleRate) {
    const binHz = sampleRate / FFT_N, bins = Math.max(8, Math.floor(FMAX / binHz));
    const mags = new Float32Array(SW * bins), re = new Float32Array(FFT_N), im = new Float32Array(FFT_N);
    for (let c = 0; c < SW; c++) {
      const start = Math.floor(((c + 0.5) / SW) * samples.length) - FFT_N / 2;
      for (let i = 0; i < FFT_N; i++) {
        const idx = start + i;
        re[i] = idx >= 0 && idx < samples.length ? samples[idx] * hann[i] : 0;
        im[i] = 0;
      }
      fft(re, im);
      for (let b = 0; b < bins; b++) {
        mags[c * bins + b] = 20 * Math.log10(Math.sqrt(re[b] * re[b] + im[b] * im[b]) / FFT_N + 1e-9);
      }
    }
    const raw = Float32Array.from(mags), col = new Float32Array(SW);
    for (let b = 0; b < bins; b++) {
      for (let c = 0; c < SW; c++) col[c] = mags[c * bins + b];
      const typical = Float32Array.from(col).sort()[Math.floor(SW * 0.6)];
      for (let c = 0; c < SW; c++) mags[c * bins + b] -= typical;
    }
    const lowBin = Math.ceil(800 / binHz);
    const rawAbove = raw.filter((_, i) => i % bins >= lowBin).sort();
    const gateLo = rawAbove[Math.floor(rawAbove.length * 0.8)], gateHi = gateLo + 10;
    for (let i = 0; i < mags.length; i++) {
      mags[i] *= Math.min(1, Math.max(0, (raw[i] - gateLo) / (gateHi - gateLo)));
    }
    const sorted = Float32Array.from(mags).sort();
    const floor = Math.max(1.5, sorted[Math.floor(sorted.length * 0.9)]);
    const top = Math.max(floor + 9, sorted[Math.floor(sorted.length * 0.9985)]);

    const energy = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      for (let c = 0; c < SW; c++) {
        const d = mags[c * bins + b] - floor;
        if (d > 0) energy[b] += d * d;
      }
    }
    const total = energy.reduce((x, y) => x + y, 0) || 1;
    let acc = 0, lo = 0, hi = bins - 1;
    for (let b = 0; b < bins; b++) {
      acc += energy[b];
      if (acc < total * 0.03) lo = b;
      if (acc < total * 0.97) hi = b;
    }
    let fmin = Math.max(0, lo * binHz - 700), fmax = Math.min(FMAX, hi * binHz + 900);
    if (fmax - fmin < 4000) {
      const mid = (fmax + fmin) / 2;
      fmin = Math.max(0, mid - 2000);
      fmax = Math.min(FMAX, fmin + 4000);
    }

    const lit = document.createElement('canvas'), dim = document.createElement('canvas');
    lit.width = dim.width = SW;
    lit.height = dim.height = SH;
    const lc = lit.getContext('2d'), dc = dim.getContext('2d');
    const li = lc.createImageData(SW, SH), di = dc.createImageData(SW, SH);
    for (let c = 0; c < SW; c++) {
      for (let y = 0; y < SH; y++) {
        const fb = (fmax - ((y + 0.5) / SH) * (fmax - fmin)) / binHz;
        const b0 = Math.min(bins - 2, Math.floor(fb)), f = fb - b0;
        const db = mags[c * bins + b0] * (1 - f) + mags[c * bins + b0 + 1] * f;
        const v = Math.pow(Math.min(1, Math.max(0, (db - floor) / (top - floor))), 0.8);
        const [r, g, b] = PALETTE[Math.round(v * 255)];
        const p = (y * SW + c) * 4;
        li.data[p] = r; li.data[p + 1] = g; li.data[p + 2] = b; li.data[p + 3] = 255;
        // The not-yet-played part: the same shape in pale cream, so the first
        // frame (the chat thumbnail) already shows the whole song.
        const m = Math.pow(v, 0.9) * 0.62;
        di.data[p] = 42 + (232 - 42) * m;
        di.data[p + 1] = 33 + (214 - 33) * m;
        di.data[p + 2] = 24 + (180 - 24) * m;
        di.data[p + 3] = 255;
      }
    }
    lc.putImageData(li, 0, 0);
    dc.putImageData(di, 0, 0);
    return { lit, dim, fmin, fmax };
  }

  /* ---------------------------------------------------------------- drawing */
  function ease(x) {
    const v = Math.min(1, Math.max(0, x));
    return 1 - (1 - v) ** 3;
  }

  function drawKhz(ctx, spec, x, y, h) {
    ctx.font = EN(600, 19);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,249,239,0.72)';
    const lo = Math.ceil(spec.fmin / 1000), hi = Math.floor(spec.fmax / 1000), step = hi - lo > 5 ? 2 : 1;
    const ticks = [];
    for (let k = lo; k <= hi; k += step) ticks.push(k);
    ticks.forEach((k, i) => {
      const ly = y + h * (1 - (k * 1000 - spec.fmin) / (spec.fmax - spec.fmin));
      if (ly < y + 14 || ly > y + h - 14) return;
      ctx.fillRect(x, ly, 10, 1.5);
      ctx.fillText(i === ticks.length - 1 ? `${k} kHz` : String(k), x + 15, ly);
    });
    ctx.textBaseline = 'alphabetic';
  }

  function drawFrame(ctx, job, t) {
    const W = SIZE, H = SIZE, { spec, dur, name, heName, line } = job;
    const p = t / dur, end = ease((t - dur - 0.1) / 0.4);
    ctx.fillStyle = C.dark;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = C.cream;
    let size = 54;
    ctx.font = EN(800, size);
    while (size > 28 && ctx.measureText(name).width > W - 80) {
      size -= 1;
      ctx.font = EN(800, size);
    }
    ctx.fillText(name, W / 2, 76);
    if (heName) {
      ctx.fillStyle = C.peach;
      ctx.font = HE(700, 38);
      ctx.fillText(heName, W / 2, 122);
    }

    const sy = 150, sh = 460;
    ctx.drawImage(spec.dim, 0, sy, W, sh);
    const cut = Math.max(0, Math.min(1, p));
    if (cut > 0) {
      ctx.drawImage(spec.lit, 0, 0, SW * cut, SH, 0, sy, W * cut, sh);
    }
    if (p > 0 && p < 1) {
      const px = W * p, g = ctx.createLinearGradient(px - 26, 0, px, 0);
      g.addColorStop(0, 'rgba(255,236,190,0)');
      g.addColorStop(1, 'rgba(255,236,190,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(px - 26, sy, 26, sh);
      ctx.fillStyle = C.pale;
      ctx.fillRect(px - 1.5, sy, 3, sh);
    }
    drawKhz(ctx, spec, 14, sy, sh);

    ctx.textAlign = 'left';
    ctx.font = EN(600, 25);
    ctx.fillStyle = 'rgba(255,249,239,0.88)';
    ctx.globalAlpha = 1 - end;
    ctx.fillText(line, 28, 672);
    ctx.globalAlpha = end;
    ctx.font = EN(700, 25);
    ctx.fillStyle = C.pale;
    ctx.fillText(`More birds: ${SITE_SHORT}`, 28, 672);
    ctx.globalAlpha = 1;
    // Plain words, no logo: its hoopoe would sit over a different bird's sound.
    ctx.textAlign = 'right';
    ctx.font = EN(800, 25);
    ctx.fillStyle = C.peach;
    ctx.fillText('BirdNET Kids', W - 28, 672);
  }

  /* --------------------------------------------------------------- encoding */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function recorderMime() {
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      return null;
    }
    return ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']
      .find((m) => MediaRecorder.isTypeSupported(m)) || null;
  }

  async function pickVideoCodec() {
    if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
      return null;
    }
    try {
      const audio = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 96000 });
      if (!audio.supported) {
        return null;
      }
      for (const codec of ['avc1.42001f', 'avc1.4d401f', 'avc1.640028']) {
        const video = await VideoEncoder.isConfigSupported({ codec, width: SIZE, height: SIZE, bitrate: 600000, framerate: FPS });
        if (video.supported) {
          return codec;
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  async function encodeWithWebCodecs(job, codec, onProgress) {
    if (!window.Mp4Muxer) {
      await loadScript('mp4-muxer.js?v=5.2.2');
    }
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({
      target,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: SIZE, height: SIZE },
      audio: { codec: 'aac', numberOfChannels: 1, sampleRate: SAMPLE_RATE },
    });
    let failure = null;
    const fail = (e) => { failure = failure || e; };

    const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: fail });
    audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 96000 });
    // Silence under the held end picture, so both tracks last equally long.
    const totalSamples = Math.ceil((job.dur + HOLD) * SAMPLE_RATE);
    for (let from = 0; from < totalSamples; from += AUDIO_FRAMES) {
      const data = new Float32Array(Math.min(AUDIO_FRAMES, totalSamples - from));
      data.set(job.samples.subarray(from, Math.min(from + data.length, job.samples.length)));
      const frame = new AudioData({
        format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: data.length, numberOfChannels: 1,
        timestamp: Math.round((from / SAMPLE_RATE) * 1e6), data,
      });
      audioEncoder.encode(frame);
      frame.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();

    const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: fail });
    videoEncoder.configure({ codec, width: SIZE, height: SIZE, bitrate: 600000, framerate: FPS });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const total = Math.ceil((job.dur + HOLD) * FPS);
    for (let f = 0; f < total; f++) {
      if (failure) {
        throw failure;
      }
      drawFrame(ctx, job, f / FPS);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f / FPS) * 1e6), duration: Math.round(1e6 / FPS) });
      videoEncoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
      frame.close();
      while (videoEncoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 5));
      }
      if (f % 6 === 0) {
        onProgress(f / total);
        await new Promise((r) => setTimeout(r));
      }
    }
    await videoEncoder.flush();
    videoEncoder.close();
    if (failure) {
      throw failure;
    }
    muxer.finalize();
    return new Blob([target.buffer], { type: 'video/mp4' });
  }

  // Safari: records the canvas and sound as they play, so it takes as long as
  // the video itself. The audio context was created by the Share tap.
  function encodeWithRecorder(job, mime, audioContext, onProgress) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      drawFrame(ctx, job, 0);
      const stream = canvas.captureStream(FPS);
      const dest = audioContext.createMediaStreamDestination();
      const source = audioContext.createBufferSource();
      source.buffer = job.buffer;
      source.connect(dest);
      dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 600000, audioBitsPerSecond: 96000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = (e) => reject(e.error || new Error('recorder failed'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }));
      recorder.start();
      source.start();
      const started = performance.now();
      const total = job.dur + HOLD;
      const tick = () => {
        const t = (performance.now() - started) / 1000;
        if (t >= total) {
          recorder.stop();
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        drawFrame(ctx, job, t);
        onProgress(t / total);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ------------------------------------------------------------------- text */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function whenText(clip) {
    if (!clip.date) {
      return '';
    }
    const [y, m, d] = clip.date.split('-').map(Number);
    const year = y === new Date().getFullYear() ? '' : ` ${y}`;
    return { day: `${d} ${MONTHS[m - 1]}${year}`, time: String(clip.time || '').slice(0, 5) };
  }

  function videoLine(clip) {
    const when = whenText(clip);
    if (!when) {
      return 'Kibbutz Dorot';
    }
    return `Kibbutz Dorot · ${when.day}, ${when.time} · ${Math.round(clip.confidence * 100)}% sure`;
  }

  function messageText(card, clip) {
    const name = card.he_name ? `${card.name} (${card.he_name})` : card.name;
    const article = /^[AEIOU]/.test(card.name) ? 'An' : 'A';
    const when = whenText(clip);
    return when
      ? `Listen! ${article} ${name} sang in Dorot on ${when.day} at ${when.time}.`
      : `Listen! ${article} ${name} sang in Dorot.`;
  }

  /* -------------------------------------------------------------- the sheet */
  let els = null;
  let session = 0; // a newer open cancels what an older one was still making
  let state = null;
  let videoFile = null;
  let videoUrl = null;
  let audioFile = null;
  let lastFocused = null;

  function buildSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'share-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button type="button" class="share-close" aria-label="Close">✕</button>
        <div class="share-head">
          <h2 id="share-title">Share this bird song</h2>
          <p class="share-sub"></p>
        </div>
        <div class="share-stage">
          <video controls playsinline preload="metadata" hidden></video>
          <div class="share-progress">
            <span class="share-progress-text"></span>
            <span class="share-bar"><span></span></span>
          </div>
        </div>
        <button type="button" class="share-main" disabled></button>
        <div class="share-others">
          <button type="button" class="share-copy">Copy link</button>
          <button type="button" class="share-audio">Send audio</button>
          <button type="button" class="share-save">Save audio</button>
        </div>
        <label class="share-message">Message
          <textarea rows="2"></textarea>
        </label>
        <p class="share-note" role="status"></p>
      </div>`;
    document.body.appendChild(overlay);
    const q = (s) => overlay.querySelector(s);
    els = {
      overlay, sub: q('.share-sub'), video: q('video'), progress: q('.share-progress'),
      progressText: q('.share-progress-text'), bar: q('.share-bar span'), main: q('.share-main'),
      copy: q('.share-copy'), audio: q('.share-audio'), save: q('.share-save'),
      message: q('textarea'), note: q('.share-note'), close: q('.share-close'),
    };
    els.close.addEventListener('click', closeSheet);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
    // Capture phase, so Escape closes only the sheet and not the popup below it.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) {
        e.stopPropagation();
        closeSheet();
      }
    }, true);
    els.main.addEventListener('click', sendVideo);
    els.copy.addEventListener('click', copyLink);
    els.audio.addEventListener('click', sendAudio);
    els.save.addEventListener('click', saveAudio);
  }

  function closeSheet() {
    session++;
    els.overlay.hidden = true;
    els.video.pause();
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
  }

  function shareUrl() {
    const c = state.clipIndex ? `?c=${state.clipIndex}` : '';
    return `${SITE}/b/${state.slug}${c}`;
  }

  function fullMessage() {
    return `${els.message.value.trim()}\n${shareUrl()}`;
  }

  function note(text) {
    els.note.textContent = text;
  }

  function canShareFile(file) {
    return !!(navigator.canShare && navigator.canShare({ files: [file] }));
  }

  function count(name) {
    if (window.kidsStats) {
      window.kidsStats.event(name);
    }
  }

  async function shareFile(file) {
    try {
      await navigator.share({ files: [file], text: fullMessage() });
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        note('Sharing did not work here. Try Copy link instead.');
      }
      return false;
    }
  }

  function download(blob, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  async function sendVideo() {
    if (!videoFile) {
      return;
    }
    count('sharevideo');
    if (canShareFile(videoFile)) {
      await shareFile(videoFile);
    } else {
      download(videoFile, videoFile.name);
      note('Video saved. Attach it in WhatsApp.');
    }
  }

  async function copyLink() {
    count('sharelink');
    const text = shareUrl();
    try {
      await navigator.clipboard.writeText(text);
      note('Link copied!');
    } catch (e) {
      window.prompt('Copy this link:', text);
    }
  }

  async function sendAudio() {
    count('shareaudio');
    if (audioFile && canShareFile(audioFile)) {
      await shareFile(audioFile);
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(fullMessage())}`, '_blank', 'noopener');
    }
  }

  function saveAudio() {
    count('save');
    const link = document.createElement('a');
    link.href = state.clip.audio;
    link.download = state.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function loadFonts() {
    if (!document.getElementById('share-font')) {
      const link = document.createElement('link');
      link.id = 'share-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Rubik:wght@700&display=swap';
      document.head.appendChild(link);
    }
    const fonts = Promise.all([
      document.fonts.load(EN(800, 40), 'Bird'), document.fonts.load(EN(700, 25), 'Bird'),
      document.fonts.load(EN(600, 25), 'Bird'), document.fonts.load(HE(700, 38), 'שלדג'),
    ]).catch(() => {});
    // A slow font must not hold the video up forever.
    return Promise.race([fonts, new Promise((r) => setTimeout(r, 4000))]);
  }

  async function makeVideo(mySession, audioContext) {
    const setProgress = (v) => { els.bar.style.width = `${Math.round(v * 100)}%`; };
    els.progressText.textContent = 'Making your video…';
    setProgress(0);
    try {
      const response = await fetch(state.clip.audio);
      const blob = await response.blob();
      audioFile = new File([blob], state.fileName, { type: 'audio/mpeg' });
      const codec = await pickVideoCodec();
      const mime = codec ? null : recorderMime();
      if (!codec && !mime) {
        throw new Error('no video encoder');
      }
      const [buffer] = await Promise.all([audioContext.decodeAudioData(await blob.arrayBuffer()), loadFonts()]);
      if (mySession !== session) {
        return;
      }
      const samples = buffer.getChannelData(0);
      const job = {
        buffer, samples, dur: buffer.duration,
        spec: buildSpectrogram(samples, buffer.sampleRate),
        name: state.card.name, heName: state.card.he_name, line: videoLine(state.clip),
      };
      const video = codec
        ? await encodeWithWebCodecs(job, codec, setProgress)
        : await encodeWithRecorder(job, mime, audioContext, setProgress);
      if (mySession !== session) {
        return;
      }
      videoFile = new File([video], state.fileName.replace(/\.mp3$/, '.mp4'), { type: 'video/mp4' });
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      videoUrl = URL.createObjectURL(videoFile);
      els.video.src = videoUrl;
      els.video.hidden = false;
      els.progress.hidden = true;
      els.main.disabled = false;
      els.main.textContent = canShareFile(videoFile) ? 'Send video to WhatsApp' : 'Download video';
    } catch (e) {
      if (mySession !== session) {
        return;
      }
      els.progressText.textContent = 'This browser can\'t make the video, but you can still send the sound or the link.';
      els.bar.parentElement.hidden = true;
      els.main.hidden = true;
    }
  }

  function openSheet() {
    state = window.kidsShareState();
    if (!state) {
      return;
    }
    if (!els) {
      buildSheet();
    }
    count('share');
    const mySession = ++session;
    videoFile = null;
    audioFile = null;
    lastFocused = document.activeElement;
    const slotName = state.clip.last ? 'Last' : ['Best', '2nd'][state.clipIndex] || 'Best';
    els.sub.textContent = `${state.card.name} · ${slotName} recording`;
    els.message.value = messageText(state.card, state.clip);
    els.video.hidden = true;
    els.video.removeAttribute('src');
    els.progress.hidden = false;
    els.bar.parentElement.hidden = false;
    els.main.hidden = false;
    els.main.disabled = true;
    els.main.textContent = 'Send video to WhatsApp';
    note('');
    els.overlay.hidden = false;
    els.close.focus();
    // Created inside the tap: Safari only lets a tap start audio.
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const audioContext = new Ctx({ sampleRate: SAMPLE_RATE });
    const pauseAudio = document.querySelector('.modal-audio');
    if (pauseAudio) {
      pauseAudio.pause();
    }
    audioContext.resume().catch(() => {});
    makeVideo(mySession, audioContext).finally(() => audioContext.close().catch(() => {}));
  }

  shareBtn.addEventListener('click', openSheet);
})();
