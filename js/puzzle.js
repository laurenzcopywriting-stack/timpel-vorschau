/* Das Foto-Puzzle: das Bild wird in Teile geschnitten, die sich unter der Hand
   nach vorn heben. Ohne Skript bleibt das normale Bild stehen.
   Wie ein Restaurator Scherben zusammensetzt, so liegt hier ein Bild aus Stücken. */
(() => {
  const fig = document.querySelector('[data-puzzle]');
  if (!fig) return;
  const tilt = fig.querySelector('.puzzle__tilt');
  const img = tilt.querySelector('img');
  const COLS = Number(fig.dataset.cols) || 5;
  const ROWS = Number(fig.dataset.rows) || 6;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // feste Zufallsfolge: das Puzzle sieht bei jedem Besuch gleich aus
  let seed = 1935;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const uni = (a, b) => a + (b - a) * rnd();

  // Nasen und Mulden: eine Kante je Fuge, beide Nachbarn benutzen dieselbe
  const TAB = 0.1, JIT = 0.035;
  const edge = () => ({ flip: rnd() < 0.5 ? 1 : -1, a: uni(-JIT, JIT), b: uni(-JIT, JIT), c: uni(-JIT, JIT), d: uni(-JIT, JIT), e: uni(-JIT, JIT) });
  const H = []; // waagrechte Fugen H[r][c], r = 1 … ROWS-1
  const V = []; // senkrechte Fugen V[r][c], c = 1 … COLS-1
  for (let r = 0; r <= ROWS; r++) { H[r] = []; V[r] = []; for (let c = 0; c <= COLS; c++) { H[r][c] = edge(); V[r][c] = edge(); } }
  const tilts = [];
  for (let i = 0; i < ROWS * COLS; i++) tilts.push(uni(-1, 1));

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  let pieces = [];
  let W = 0, Hh = 0, pw = 0, ph = 0, pad = 0, dpr = 1;
  let pointer = null;
  let releaseTimer = 0;
  let raf = 0;

  // Kurvenzüge einer Kante von P nach Q, in Seitenpixeln
  function segments(P, Q, E, s) {
    const ux = Q[0] - P[0], uy = Q[1] - P[1];
    const len = Math.hypot(ux, uy);
    const nx = (-uy / len) * s * E.flip, ny = (ux / len) * s * E.flip;
    const pt = (l, w) => [P[0] + ux * l + nx * w, P[1] + uy * l + ny * w];
    const t = TAB, { a, b, c, d, e } = E;
    return [
      [pt(0.2, a), pt(0.5 + b + d, -t + c), pt(0.5 - t + b, t + c)],
      [pt(0.5 - 2 * t + b - d, 3 * t + c), pt(0.5 + 2 * t + b - d, 3 * t + c), pt(0.5 + t + b, t + c)],
      [pt(0.5 + b + d, -t + c), pt(0.8, e), pt(1, 0)],
    ];
  }
  function trace(path, P, Q, E, s, reverse) {
    if (!E) { path.lineTo(Q[0], Q[1]); return; }
    if (!reverse) {
      segments(P, Q, E, s).forEach(([c1, c2, p]) => path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p[0], p[1]));
    } else {
      // die Vorwärtskurve P→Q rückwärts gehen, damit beide Nachbarn exakt passen
      const fw = segments(P, Q, E, s);
      const pts = [P, ...fw.map((x) => x[2])];
      for (let i = fw.length - 1; i >= 0; i--) {
        const [c1, c2] = fw[i];
        path.bezierCurveTo(c2[0], c2[1], c1[0], c1[1], pts[i][0], pts[i][1]);
      }
    }
  }

  function piecePath(r, c) {
    const x0 = c * pw, y0 = r * ph, x1 = x0 + pw, y1 = y0 + ph;
    const s = Math.min(pw, ph);
    const p = new Path2D();
    p.moveTo(x0, y0);
    trace(p, [x0, y0], [x1, y0], r === 0 ? null : H[r][c], s, false);           // oben, links → rechts
    trace(p, [x1, y0], [x1, y1], c === COLS - 1 ? null : V[r][c + 1], s, false); // rechts, oben → unten
    if (r === ROWS - 1) p.lineTo(x0, y1); else trace(p, [x0, y1], [x1, y1], H[r + 1][c], s, true); // unten, rückwärts
    if (c === 0) p.lineTo(x0, y0); else trace(p, [x0, y0], [x0, y1], V[r][c], s, true);           // links, rückwärts
    p.closePath();
    return p;
  }

  // Bildausschnitt wie object-fit: cover
  function coverRect(iw, ih, w, h) {
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale, sh = h / scale;
    return [(iw - sw) / 2, (ih - sh) / 2, sw, sh];
  }

  function build() {
    const rect = tilt.getBoundingClientRect();
    W = rect.width; Hh = rect.height;
    if (!W || !Hh || !img.naturalWidth) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    pw = W / COLS; ph = Hh / ROWS;
    pad = Math.round(Math.min(pw, ph) * 0.9);
    canvas.width = Math.round((W + pad * 2) * dpr);
    canvas.height = Math.round((Hh + pad * 2) * dpr);
    canvas.style.width = `${W + pad * 2}px`;
    canvas.style.height = `${Hh + pad * 2}px`;
    canvas.style.left = `${-pad}px`;
    canvas.style.top = `${-pad}px`;

    const [sx, sy, sw, sh] = coverRect(img.naturalWidth, img.naturalHeight, W, Hh);
    const margin = Math.ceil(Math.min(pw, ph) * 0.4);
    const old = pieces;
    pieces = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const path = piecePath(r, c);
        const bx = c * pw - margin, by = r * ph - margin;
        const bw = pw + margin * 2, bh = ph + margin * 2;
        const sprite = document.createElement('canvas');
        sprite.width = Math.ceil(bw * dpr); sprite.height = Math.ceil(bh * dpr);
        const s = sprite.getContext('2d');
        s.scale(dpr, dpr);
        s.translate(-bx, -by);
        s.save();
        s.clip(path);
        s.drawImage(img, sx, sy, sw, sh, 0, 0, W, Hh);
        s.restore();
        // die Fuge: oben links ein Lichtsaum, unten rechts ein Schattensaum
        s.lineWidth = 1.1;
        s.strokeStyle = 'rgba(255, 250, 240, .55)';
        s.save(); s.translate(-0.6, -0.6); s.stroke(path); s.restore();
        s.strokeStyle = 'rgba(40, 28, 20, .28)';
        s.save(); s.translate(0.6, 0.6); s.stroke(path); s.restore();

        // der Schatten des Teils, vorgerechnet
        const shadow = document.createElement('canvas'); // nur unter angehobenen Teilen — taste-skill-ignore
        shadow.width = sprite.width; shadow.height = sprite.height;
        const h = shadow.getContext('2d');
        h.scale(dpr, dpr);
        h.translate(-bx, -by);
        const far = 4000;
        h.shadowColor = 'rgba(38, 26, 18, 1)';
        h.shadowBlur = 14 * dpr;
        h.shadowOffsetX = far * dpr;
        h.translate(-far, 0);
        h.fillStyle = '#000';
        h.fill(path);

        const i = r * COLS + c;
        const prev = old[i];
        pieces.push({ r, c, i, sprite, shadow, bx, by, bw, bh, cx: c * pw + pw / 2, cy: r * ph + ph / 2, z: prev ? prev.z : 0, t: 0, rot: tilts[i] * 0.09 });
      }
    }
    return true;
  }

  function targets() {
    if (!pointer) { pieces.forEach((p) => { p.t = 0; }); return; }
    const R = Math.max(pw, ph) * 1.55;
    let nearest = null, best = Infinity;
    pieces.forEach((p) => {
      const d = Math.hypot(pointer.x - p.cx, pointer.y - p.cy);
      if (d < best) { best = d; nearest = p; }
      const q = Math.max(0, 1 - d / R);
      p.t = q * q * 0.8;
    });
    if (nearest && pointer.inside) nearest.t = 1;
  }

  function draw() {
    raf = 0;
    targets();
    let moving = false;
    const k = Math.min(pw, ph) / 100;
    pieces.forEach((p) => {
      const next = reduce ? p.t : p.z + (p.t - p.z) * 0.16;
      if (Math.abs(next - p.t) > 0.002) moving = true;
      p.z = Math.abs(next - p.t) <= 0.002 ? p.t : next;
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W + pad * 2, Hh + pad * 2);
    ctx.translate(pad, pad);
    const order = [...pieces].sort((a, b) => a.z - b.z);
    order.forEach((p) => {
      const z = p.z;
      if (z > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.55, 0.62 * z);
        ctx.translate(p.cx + (4 + 16 * z) * k, p.cy + (6 + 26 * z) * k);
        ctx.rotate(p.rot * z);
        ctx.scale(1 + 0.1 * z, 1 + 0.1 * z);
        ctx.drawImage(p.shadow, p.bx - p.cx, p.by - p.cy, p.bw, p.bh);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(p.cx - 9 * z * k, p.cy - 16 * z * k);
      ctx.rotate(p.rot * z);
      const sc = 1 + 0.15 * z;
      ctx.scale(sc, sc);
      ctx.drawImage(p.sprite, p.bx - p.cx, p.by - p.cy, p.bw, p.bh);
      ctx.restore();
    });
    if (moving) raf = requestAnimationFrame(draw);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function setPointer(e) {
    const r = tilt.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    pointer = { x, y, inside };
    if (!reduce) {
      const rx = ((y / r.height) - 0.5) * -6;
      const ry = ((x / r.width) - 0.5) * 6;
      tilt.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    }
    kick();
  }
  function clearPointer() {
    pointer = null;
    tilt.style.transform = '';
    kick();
  }

  function start() {
    if (!build()) return;
    tilt.appendChild(canvas);
    fig.classList.add('is-ready');
    draw();

    canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') setPointer(e); });
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') clearPointer(); });
    // Am Telefon: antippen hebt die Teile kurz an
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      clearTimeout(releaseTimer);
      setPointer(e);
      releaseTimer = setTimeout(clearPointer, 1400);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !pointer) return;
      clearTimeout(releaseTimer);
      setPointer(e);
      releaseTimer = setTimeout(clearPointer, 1400);
    });

    let resizeTimer = 0;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (build()) draw(); }, 120);
    }).observe(tilt);
  }

  if (img.complete && img.naturalWidth) start();
  else img.addEventListener('load', start, { once: true });
})();
