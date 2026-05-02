// Landing-page interactivity. Externalised from src/pages/index.astro
// because the site ships with a strict CSP (`script-src 'self'` —
// no `'unsafe-inline'`). An inline <script> is silently blocked in
// production, which left every `.reveal` element stuck at
// `opacity: 0` and made the page look empty below the hero.
//
// Loaded via `<script defer src="/scripts/landing.js">` from
// index.astro. Same pattern as /scripts/dsar.js and
// /scripts/cookie-consent.js. See memory/security_report_2026-05-02.md
// finding F-002.

(function () {
  // ===== Sticky nav border on scroll =====
  var nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 8);
    });
  }

  // ===== Reveal on scroll =====
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

  // ===== Trust counters =====
  var counters = document.querySelectorAll('[data-count]');
  var counterIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      var target = parseInt(el.dataset.count || '0', 10);
      var dur = 1400;
      var start = performance.now();
      var fmt = function (n) { return n >= 1000 ? n.toLocaleString() : String(n); };
      function tick(now) {
        var t = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      counterIO.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(function (c) { counterIO.observe(c); });

  // ===== CTA underline draw =====
  var ctaLine = document.getElementById('ctaLine');
  if (ctaLine) {
    var ctaIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          ctaLine.classList.add('in');
          ctaIO.unobserve(ctaLine);
        }
      });
    }, { threshold: 0.4 });
    ctaIO.observe(ctaLine);
  }

  // ===== Interactive sign canvas =====
  (function () {
    var canvas = document.getElementById('signCanvas');
    var hint = document.getElementById('demoHint');
    var clearBtn = document.getElementById('demoClear');
    if (!canvas || !hint || !clearBtn) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var drawing = false;
    var last = null;
    var hasDrawn = false;

    function resize() {
      if (!canvas || !ctx) return;
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#0B1220';
    }
    resize();
    window.addEventListener('resize', function () {
      if (!canvas || !ctx) return;
      var tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      var tmpCtx = tmp.getContext('2d');
      if (tmpCtx) tmpCtx.drawImage(canvas, 0, 0);
      resize();
      if (tmpCtx) {
        ctx.drawImage(
          tmp,
          0,
          0,
          canvas.width / (window.devicePixelRatio || 1),
          canvas.height / (window.devicePixelRatio || 1)
        );
      }
    });

    function pos(e) {
      if (!canvas) return { x: 0, y: 0 };
      var r = canvas.getBoundingClientRect();
      var t = 'touches' in e ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function start(e) {
      e.preventDefault();
      drawing = true;
      last = pos(e);
      if (!hasDrawn && hint) {
        hasDrawn = true;
        hint.style.opacity = '0';
      }
    }
    function move(e) {
      if (!drawing || !ctx || !last) return;
      e.preventDefault();
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }
    function end() { drawing = false; last = null; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    clearBtn.addEventListener('click', function () {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (hint) hint.style.opacity = '1';
      hasDrawn = false;
    });

    document.querySelectorAll('.demo-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.demo-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
      });
    });
  })();

  // ===== Tilt the doc with mouse parallax =====
  (function () {
    var stage = document.querySelector('.stage');
    var doc = document.querySelector('.doc');
    if (!stage || !doc) return;
    var raf = null;
    var target = { x: 0, y: 0 };
    var current = { x: 0, y: 0 };
    function tick() {
      if (!doc) return;
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      doc.style.transform = 'rotate(' + (-2.4 + current.x * 0.5) + 'deg) translateY(' + (current.y * 4) + 'px)';
      raf = requestAnimationFrame(tick);
    }
    stage.addEventListener('mousemove', function (e) {
      var r = stage.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) tick();
    });
    stage.addEventListener('mouseleave', function () {
      target.x = 0;
      target.y = 0;
    });
  })();
})();
