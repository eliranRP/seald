// DSAR form — serializes the privacy-request form into a structured
// `mailto:` URL pointed at privacy@seald.nromomentum.com.
//
// Extracted from `apps/landing/src/pages/dsar.astro` so the landing
// site can ship a strict CSP without `'unsafe-inline'` in script-src.
// See memory/security_report_2026-05-02.md F-002.
(function () {
  var form = document.getElementById('dsar-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var name = String(data.get('name') || '').trim();
    var email = String(data.get('email') || '').trim();
    var juris = String(data.get('jurisdiction') || '').trim();
    var details = String(data.get('details') || '').trim();
    var agent = String(data.get('agent') || 'No');
    var types = data.getAll('type').map(String);

    if (!name || !email || !juris) {
      alert('Please fill in your name, email, and jurisdiction.');
      return;
    }
    if (types.length === 0) {
      alert('Please select at least one request type.');
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
      'mailto:privacy@seald.nromomentum.com?subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body);

    window.location.href = href;
  });
})();
