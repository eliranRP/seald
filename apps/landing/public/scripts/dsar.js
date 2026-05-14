// DSAR form — serializes the privacy-request form into a structured
// `mailto:` URL pointed at privacy@seald.nromomentum.com.
//
// Extracted from `apps/landing/src/pages/dsar.astro` so the landing
// site can ship a strict CSP without `'unsafe-inline'` in script-src.
// See memory/security_report_2026-05-02.md F-002.
//
// PR-7 / Audit E · dsar.astro H — adds inline error / success display
// and a clipboard-copy fallback when the user has no default mail
// client (Chromebook with web-only Gmail, Windows without a mailto
// association). The page used to promise "All submissions reach our
// privacy team" while silently no-op-ing if mailto wasn't wired.
(function () {
  var form = document.getElementById('dsar-form');
  if (!form) return;

  var PRIVACY_EMAIL = 'privacy@seald.nromomentum.com';

  function ensureStatusNode() {
    var existing = document.getElementById('dsar-status');
    if (existing) return existing;
    var node = document.createElement('div');
    node.id = 'dsar-status';
    node.className = 'dsar-status';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    form.appendChild(node);
    return node;
  }

  function showStatus(kind, html) {
    var node = ensureStatusNode();
    node.className = 'dsar-status dsar-status-' + kind;
    node.innerHTML = html;
  }

  function clearStatus() {
    var node = document.getElementById('dsar-status');
    if (node) node.remove();
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearStatus();
    var data = new FormData(form);
    var name = String(data.get('name') || '').trim();
    var email = String(data.get('email') || '').trim();
    var juris = String(data.get('jurisdiction') || '').trim();
    var details = String(data.get('details') || '').trim();
    var agent = String(data.get('agent') || 'No');
    var types = data.getAll('type').map(String);

    if (!name || !email || !juris) {
      showStatus(
        'error',
        '<strong>Almost there.</strong> Please fill in your name, email, and jurisdiction.'
      );
      return;
    }
    if (types.length === 0) {
      showStatus(
        'error',
        '<strong>Pick a request type.</strong> At least one of Access, Deletion, Correction, etc. must be checked.'
      );
      return;
    }

    var subject = 'DSAR — ' + types.join(', ');
    var body =
      'Submitted via the Seald privacy form (https://seald.nromomentum.com/dsar)\n\n' +
      'Name: ' +
      name +
      '\n' +
      'Email: ' +
      email +
      '\n' +
      'Jurisdiction: ' +
      juris +
      '\n' +
      'Authorized agent: ' +
      agent +
      '\n' +
      'Request type(s): ' +
      types.join(', ') +
      '\n\n' +
      'Details:\n' +
      (details || '(none provided)') +
      '\n';

    var href =
      'mailto:' +
      PRIVACY_EMAIL +
      '?subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body);

    // Detect mailto-failure. Open the mailto in a hidden iframe and
    // poll for the timeout — if nothing happens within a short window,
    // surface the clipboard fallback. We can't detect mailto failure
    // synchronously across all platforms, so we belt-and-braces:
    //   (1) optimistically try the mailto via window.location.assign()
    //   (2) ALWAYS render the success / fallback panel underneath the
    //       form with a "Copy email to clipboard" button + the
    //       full email body shown verbatim. Users on Chromebooks /
    //       Windows-without-mail / iOS-with-mail-deleted get a clear
    //       path that doesn't depend on a registered handler.
    try {
      window.location.assign(href);
    } catch (_) {
      /* fall through to the manual panel */
    }

    var safeBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var html =
      '<strong>Submitted.</strong> A pre-filled email should have opened in your mail client.' +
      ' If nothing appeared, copy the body below and email it to ' +
      '<a href="mailto:' + PRIVACY_EMAIL + '">' + PRIVACY_EMAIL + '</a> manually.' +
      '<div class="dsar-status-actions">' +
      '  <button type="button" class="dsar-btn dsar-btn-ghost" data-dsar-copy>Copy email body to clipboard</button>' +
      '</div>' +
      '<pre class="dsar-status-body" aria-label="Pre-filled email body">' + safeBody + '</pre>';
    showStatus('success', html);

    var copyBtn = document.querySelector('[data-dsar-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyToClipboard('To: ' + PRIVACY_EMAIL + '\nSubject: ' + subject + '\n\n' + body)
          .then(function () {
            copyBtn.textContent = 'Copied — paste into your mail client';
          })
          .catch(function () {
            copyBtn.textContent = 'Copy failed — select the text below manually';
          });
      });
    }
  });
})();
