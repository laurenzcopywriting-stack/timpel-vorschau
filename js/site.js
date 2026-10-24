/* Ingrid & Wolfgang Timpel — Menü, Einblendungen, scrollgebundene Bewegung, Bildbetrachter.
   Alles Bewegte hängt am Scrollen oder an der Hand, nichts läuft von allein ab. */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Menü auf dem Handy ---------- */
  const head = document.querySelector('.site-head');
  const toggle = head && head.querySelector('.menu-toggle');
  if (toggle) {
    const close = () => { head.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', () => {
      const open = !head.classList.contains('is-open');
      head.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && head.classList.contains('is-open')) { close(); toggle.focus(); } });
    document.addEventListener('click', (e) => { if (head.classList.contains('is-open') && !head.contains(e.target)) close(); });
  }

  /* ---------- aktuelle Seite im Menü markieren ---------- */
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.site-nav ul a').forEach((a) => {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });

  /* ---------- Kontaktkarte: in der lokalen Vorschau nichts verschicken ---------- */
  const form = document.querySelector('form[data-netlify]');
  if (form && (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$|\.github\.io$/.test(location.hostname))) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = form.querySelector('[data-form-note]');
      if (note) { note.hidden = false; note.textContent = 'Vorschau: Die Karte wurde nicht verschickt. Auf der fertigen Seite kommt sie bei Ingrid Timpel an.'; }
    });
  }

  /* ---------- Einblendung: Überschrift, dann Text, dann Bild ---------- */
  const groups = document.querySelectorAll('[data-reveal]');
  groups.forEach((g) => { [...g.children].forEach((c, i) => c.style.setProperty('--i', i)); });
  if (reduce || !('IntersectionObserver' in window)) {
    groups.forEach((g) => g.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    groups.forEach((g) => io.observe(g));
  }

  /* ---------- Scrollgebunden: Drift, Verschluss, Zoom ---------- */
  if (reduce) return initLightbox();

  const drifts = [...document.querySelectorAll('[data-drift]')];
  const shutters = [...document.querySelectorAll('[data-shutter]')];
  const zooms = [...document.querySelectorAll('[data-zoom]')];
  const checked = new Set();
  // Ein Element mit eigener Transform bekommt keine zweite: melden statt überschreiben.
  [...drifts, ...shutters.map((s) => s.querySelector('img')), ...zooms.map((z) => z.querySelector('img'))].forEach((el) => {
    if (!el || checked.has(el)) return;
    checked.add(el);
    if (el.closest('[data-reveal]')) console.warn('Bewegung übersprungen, Element liegt in einer Einblendung:', el);
  });

  let ticking = false;
  const vh = () => window.innerHeight;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function frame() {
    ticking = false;
    const h = vh();
    drifts.forEach((el) => {
      if (el.closest('[data-reveal]')) return;
      const k = parseFloat(el.dataset.drift) || 0;
      const y = window.scrollY;
      if (y > h * 1.6) return;
      el.style.transform = `translate3d(0, ${(y * k).toFixed(1)}px, 0)`;
    });
    shutters.forEach((fr) => {
      const r = fr.getBoundingClientRect();
      // 0, wenn die Oberkante unten ins Bild kommt; 1, wenn sie bei 35 % der Höhe steht
      const p = clamp((h - r.top) / (h * 0.65), 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      fr.style.clipPath = `inset(${((1 - e) * 100).toFixed(2)}% 0 0 0)`;
      const img = fr.querySelector('img');
      if (img) img.style.transform = `scale(${(1.12 - 0.12 * e).toFixed(4)})`;
    });
    zooms.forEach((z) => {
      const r = z.getBoundingClientRect();
      const p = clamp((h - r.top) / (h + r.height * 0.5), 0, 1);
      const img = z.querySelector('img');
      if (img) img.style.transform = `scale(${(1.1 - 0.1 * p).toFixed(4)})`;
    });
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  frame();

  initLightbox();

  /* ---------- Bildbetrachter der Galerie ---------- */
  function initLightbox() {
    const shots = [...document.querySelectorAll('.shot button')];
    if (!shots.length) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Bildbetrachter');
    dlg.innerHTML = `
      <button class="btn lightbox__close" type="button">Schließen</button>
      <figure class="lightbox__fig"><img alt=""></figure>
      <div class="lightbox__bar">
        <p aria-live="polite"></p>
        <div class="btns">
          <button class="btn" type="button" data-step="-1">Zurück</button>
          <button class="btn" type="button" data-step="1">Weiter</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    const img = dlg.querySelector('img');
    const cap = dlg.querySelector('p');
    let index = 0;
    let opener = null;

    const show = (i) => {
      index = (i + shots.length) % shots.length;
      const b = shots[index];
      const src = b.querySelector('img');
      img.width = Number(src.getAttribute('width')) || 0;
      img.height = Number(src.getAttribute('height')) || 0;
      img.src = b.dataset.full || src.currentSrc || src.src;
      img.alt = src.alt;
      cap.textContent = `${b.dataset.caption || src.alt} (${index + 1} von ${shots.length})`;
    };
    shots.forEach((b, i) => b.addEventListener('click', () => { opener = b; show(i); dlg.showModal(); }));
    dlg.querySelector('.lightbox__close').addEventListener('click', () => dlg.close());
    dlg.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => show(index + Number(b.dataset.step))));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft') show(index - 1);
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { if (opener) opener.focus(); });
  }
})();
