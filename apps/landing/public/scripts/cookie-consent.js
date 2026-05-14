/*
 * Seald cookie-consent (T-30, /legal/cookies §4 implementation).
 *
 * Vanilla JS. No deps. Runs on every page of seald.nromomentum.com
 * (both the Astro landing and the React SPA share this domain).
 *
 * Behaviour, in plain words:
 *   - On first visit, show a non-blocking banner pinned to the bottom
 *     with a Reject button shown with the same prominence as Accept
 *     (EDPB 03/2022 dark-pattern guidelines).
 *   - If the browser sends Global Privacy Control (CCPA Reg §7025,
 *     CO/CT universal-opt-out), silently record a "rejected" choice
 *     and never show the banner.
 *   - If the visitor's choice is already on file in `seald_consent_v1`,
 *     respect it without re-prompting.
 *   - On "Accept", inject the Cloudflare Web Analytics beacon. The
 *     beacon token is read from <meta name="cf-beacon-token" ...>; if
 *     the meta is missing or empty, no beacon is loaded. (No analytics
 *     in production until the token lands — fail closed.)
 *   - The "Manage cookie preferences" button in the footer calls
 *     window.SealdConsent.openBanner() to re-open the banner.
 *
 * Cookie:
 *   name:   seald_consent_v1
 *   values: "accepted" | "rejected"
 *   attrs:  Path=/; Max-Age=31536000 (12mo, EDPB 03/2022 max);
 *           Secure (HTTPS only); SameSite=Lax
 *
 * Test hooks:
 *   - Playwright/E2E can pre-set the cookie via context.addCookies()
 *     to suppress the banner. Or they can set
 *     window.__SEALD_CONSENT_DISABLED = true before the script runs.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.SealdConsent) return; // idempotent
  if (window.__SEALD_CONSENT_DISABLED === true) return;

  var COOKIE_NAME = 'seald_consent_v1';
  var COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // 12 months
  var BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

  function readCookie(name) {
    var pairs = (document.cookie || '').split(';');
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i].trim();
      if (p.indexOf(name + '=') === 0) {
        return decodeURIComponent(p.slice(name.length + 1));
      }
    }
    return null;
  }

  function writeCookie(name, value) {
    var attrs = [
      name + '=' + encodeURIComponent(value),
      'Path=/',
      'Max-Age=' + COOKIE_MAX_AGE_S,
      'SameSite=Lax',
    ];
    // Secure attribute only when served over HTTPS — keeps localhost dev usable.
    if (location.protocol === 'https:') attrs.push('Secure');
    document.cookie = attrs.join('; ');
  }

  function gpcEnabled() {
    return navigator && navigator.globalPrivacyControl === true;
  }

  function getBeaconToken() {
    var meta = document.querySelector('meta[name="cf-beacon-token"]');
    if (!meta) return '';
    var v = meta.getAttribute('content') || '';
    return v.trim();
  }

  function loadBeacon() {
    var token = getBeaconToken();
    if (!token) return; // no token configured — nothing to load
    if (document.querySelector('script[data-seald-beacon]')) return;
    var s = document.createElement('script');
    s.defer = true;
    s.src = BEACON_SRC;
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: token }));
    s.setAttribute('data-seald-beacon', '1');
    document.head.appendChild(s);
  }

  /* ---------- Banner DOM ---------- */

  var STYLE_ID = 'seald-consent-style';
  var ROOT_ID = 'seald-consent-banner';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + ROOT_ID + '{' +
        'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;' +
        'max-width:560px;margin:0 auto;' +
        'background:#0B1220;color:#F5F7FB;' +
        'border:1px solid rgba(255,255,255,0.08);border-radius:14px;' +
        'box-shadow:0 12px 32px rgba(11,18,32,0.32);' +
        'padding:18px 20px;font:14px/1.5 Inter,system-ui,-apple-system,sans-serif;' +
      '}' +
      '#' + ROOT_ID + ' p{margin:0 0 12px 0;color:inherit;}' +
      '#' + ROOT_ID + ' a{color:#A5B4FC;text-decoration:underline;text-underline-offset:2px;}' +
      '#' + ROOT_ID + ' a:focus-visible{outline:2px solid #A5B4FC;outline-offset:2px;border-radius:2px;}' +
      '#' + ROOT_ID + ' .seald-consent-actions{display:flex;flex-wrap:wrap;gap:10px;}' +
      '#' + ROOT_ID + ' button{' +
        'flex:1 1 auto;min-width:120px;cursor:pointer;' +
        'padding:10px 16px;border-radius:10px;font:600 14px/1 Inter,system-ui,sans-serif;' +
        'border:1px solid rgba(255,255,255,0.16);' +
        'background:rgba(255,255,255,0.06);color:#F5F7FB;' +
        'transition:background 120ms ease,border-color 120ms ease;' +
      '}' +
      '#' + ROOT_ID + ' button:hover{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.24);}' +
      '#' + ROOT_ID + ' button:focus-visible{outline:2px solid #A5B4FC;outline-offset:2px;}' +
      '@media (prefers-reduced-motion:reduce){#' + ROOT_ID + ' button{transition:none;}}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  var bannerEl = null;
  var lastFocusEl = null;

  function buildBanner() {
    var root = document.createElement('aside');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'false');
    root.setAttribute('aria-labelledby', 'seald-consent-title');
    root.setAttribute('aria-describedby', 'seald-consent-desc');
    root.setAttribute('data-testid', 'cookie-consent-banner');

    var title = document.createElement('p');
    title.id = 'seald-consent-title';
    title.style.fontWeight = '600';
    title.style.fontSize = '15px';
    title.appendChild(document.createTextNode('Cookies on Seald'));

    var desc = document.createElement('p');
    desc.id = 'seald-consent-desc';
    desc.appendChild(document.createTextNode(
      'We use one privacy-friendly analytics beacon (Cloudflare Web Analytics) to count page views. ' +
      'Strictly necessary cookies always run. See our '
    ));
    var link = document.createElement('a');
    link.href = '/legal/cookies';
    link.appendChild(document.createTextNode('Cookie Policy'));
    desc.appendChild(link);
    desc.appendChild(document.createTextNode(' for details.'));

    var actions = document.createElement('div');
    actions.className = 'seald-consent-actions';

    var rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.setAttribute('data-testid', 'cookie-consent-reject');
    rejectBtn.appendChild(document.createTextNode('Reject analytics'));
    rejectBtn.addEventListener('click', function () { recordChoice('rejected'); });

    var acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.setAttribute('data-testid', 'cookie-consent-accept');
    acceptBtn.appendChild(document.createTextNode('Accept analytics'));
    acceptBtn.addEventListener('click', function () { recordChoice('accepted'); });

    actions.appendChild(rejectBtn);
    actions.appendChild(acceptBtn);

    root.appendChild(title);
    root.appendChild(desc);
    root.appendChild(actions);
    return root;
  }

  function showBanner() {
    if (bannerEl && document.body.contains(bannerEl)) return;
    injectStyles();
    bannerEl = buildBanner();
    lastFocusEl = document.activeElement;
    document.body.appendChild(bannerEl);
    // Move focus to the first action so keyboard users can reach it.
    var first = bannerEl.querySelector('button');
    if (first && typeof first.focus === 'function') first.focus();
  }

  function hideBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
    if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
      try { lastFocusEl.focus(); } catch (_) { /* noop */ }
    }
    lastFocusEl = null;
  }

  function recordChoice(choice) {
    writeCookie(COOKIE_NAME, choice);
    hideBanner();
    if (choice === 'accepted') loadBeacon();
    try {
      window.dispatchEvent(new CustomEvent('seald:consent', { detail: { choice: choice } }));
    } catch (_) { /* old browsers without CustomEvent ctor */ }
  }

  /* ---------- Public API ---------- */

  function openBanner() {
    // "Manage cookie preferences" — always reopen, even if a choice exists.
    showBanner();
  }

  function getChoice() {
    return readCookie(COOKIE_NAME); // 'accepted' | 'rejected' | null
  }

  window.SealdConsent = {
    openBanner: openBanner,
    getChoice: getChoice,
    // Exposed for tests; not part of the public contract.
    _recordChoice: recordChoice,
  };

  /*
   * Click-delegate for the "Manage cookie preferences" buttons in the
   * footers of every page. We can't use `onclick="..."` attributes
   * because the production CSP at apps/landing/public/_headers ships
   * `script-src 'self' …` — no `'unsafe-inline'` — so the browser
   * silently drops inline handlers. This was the *only* consent-
   * withdrawal entry point reachable from /contact, /dsar and every
   * /legal/* page, so the inline handler being blocked was a direct
   * EDPB 03/2022 / CPRA §7026(a)(4) same-ease-withdrawal violation.
   * Audit E · BaseLayout + index.astro H (CSP breaks cookie buttons).
   */
  function attachBannerDelegate() {
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || typeof target.closest !== 'function') return;
      var trigger = target.closest('[data-action="open-cookie-banner"]');
      if (!trigger) return;
      e.preventDefault();
      openBanner();
    });
  }

  /* ---------- Init ---------- */

  function init() {
    attachBannerDelegate();
    var existing = getChoice();
    if (existing === 'accepted') {
      loadBeacon();
      return;
    }
    if (existing === 'rejected') {
      return;
    }
    // No prior choice on file.
    if (gpcEnabled()) {
      // Treat GPC as a clear opt-out; persist so the banner doesn't appear.
      writeCookie(COOKIE_NAME, 'rejected');
      return;
    }
    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
