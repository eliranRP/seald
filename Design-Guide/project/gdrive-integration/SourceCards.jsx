/* @jsx React.createElement */
/* Sealed — surface 3 (New Document source) + surface 4 (Use Template step 1).
   Both screens add Drive as a first-class source. */

function SourceCard({ icon, iconColor, iconBg, title, description, ctaLabel, onClick, helperLink, accent }) {
  return (
    <div
      style={{
        background: '#fff', border: `1px solid ${accent ? 'var(--indigo-300)' : 'var(--border-1)'}`,
        borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        minHeight: 220, transition: 'box-shadow 160ms var(--ease-standard), transform 160ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: iconBg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: iconColor,
        flexShrink: 0,
      }}>
        {typeof icon === 'string' ? <Icon name={icon} size={22}/> : icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg-1)' }}>{title}</div>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--fg-3)', lineHeight: 1.55 }}>{description}</p>
      </div>
      <div>
        <Button variant={accent ? 'primary' : 'secondary'} onClick={onClick} icon={accent ? 'arrow-right' : undefined}>
          {ctaLabel}
        </Button>
        {helperLink && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-4)' }}>
            <button
              onClick={helperLink.onClick}
              style={{
                background: 'transparent', border: 'none', padding: 0,
                color: 'var(--accent)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}>
              {helperLink.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewDocumentScreen({ onUpload, onTemplate, onPickDrive, driveConnected, onConnectDrive }) {
  return (
    <div data-screen-label="New Document — source selection" style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      <TopNav active="documents" logoSrc="../assets/logo.svg"/>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 32px 80px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'var(--fs-h2)', fontWeight: 500,
            letterSpacing: 'var(--tracking-tight)', color: 'var(--fg-1)', margin: 0,
            lineHeight: 'var(--lh-tight)',
          }}>Start a new document</h1>
          <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-body)', color: 'var(--fg-3)', maxWidth: 640 }}>
            Pick a source for the document you want signed.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>
          <SourceCard
            icon="upload-cloud"
            iconColor="var(--indigo-700)"
            iconBg="var(--indigo-50)"
            title="Upload a PDF"
            description="Drag a file here or click to browse. PDFs up to 25 MB."
            ctaLabel="Choose a PDF"
            onClick={onUpload}/>
          <SourceCard
            icon="bookmark"
            iconColor="var(--success-700)"
            iconBg="var(--success-50)"
            title="From a template"
            description="Reuse a saved template with signers and fields preset."
            ctaLabel="Browse templates"
            onClick={onTemplate}/>
          <SourceCard
            icon={<GDriveLogo size={26}/>}
            iconColor="transparent"
            iconBg="#fff"
            title="From Google Drive"
            description="Pick a PDF, Google Doc, or Word document from your Drive."
            ctaLabel={driveConnected ? 'Pick from Google Drive' : 'Connect Google Drive'}
            onClick={driveConnected ? onPickDrive : onConnectDrive}
            accent={driveConnected}
            helperLink={driveConnected ? null : {
              label: 'Manage in Settings → Integrations',
              onClick: onConnectDrive,
            }}/>
        </div>

        <div style={{
          marginTop: 28, padding: '14px 18px', background: 'var(--ink-100)',
          borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="shield-check" size={16} style={{ color: 'var(--success-700)' }}/>
          <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>
            Anything you upload stays in Seald — we never share it with the integration source.
          </span>
        </div>
      </div>
    </div>
  );
}

function UseTemplateStep1({ templateName = 'Acme NDA v3', onContinue, onCancel, onUpload, onPickDrive, driveConnected, onConnectDrive }) {
  return (
    <div data-screen-label="Use Template — step 1 (Document)" style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      <TopNav active="documents" logoSrc="../assets/logo.svg"/>

      {/* Wizard chrome — mirrors templates-flow FlowHeader */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, padding: '18px 28px',
        borderBottom: '1px solid var(--border-1)', background: '#fff',
      }}>
        <Button variant="ghost" icon="arrow-left" size="sm" onClick={onCancel}>Back</Button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999, background: 'var(--indigo-50)', color: 'var(--indigo-700)',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <Icon name="bookmark" size={11}/> Use template
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{templateName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {[
            { n: 1, label: 'Document', state: 'active' },
            { n: 2, label: 'Signers',  state: 'pending' },
            { n: 3, label: 'Send',     state: 'pending' },
          ].map((s, i, all) => (
            <React.Fragment key={s.n}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999,
                background: s.state === 'active' ? 'var(--ink-900)' : 'transparent',
                color: s.state === 'active' ? '#fff' : 'var(--fg-3)',
                fontSize: 12, fontWeight: 600,
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 999,
                  border: `1.5px solid ${s.state === 'active' ? '#fff' : 'var(--border-2)'}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: s.state === 'active' ? '#fff' : 'var(--fg-3)',
                }}>{s.n}</span>
                {s.label}
              </div>
              {i < all.length - 1 && <div style={{ width: 18, height: 1, background: 'var(--border-1)' }}/>}
            </React.Fragment>
          ))}
        </div>
        <button
          onClick={onCancel}
          aria-label="Cancel wizard"
          style={{ background: 'transparent', border: 'none', color: 'var(--fg-3)', padding: 6, borderRadius: 8, cursor: 'pointer' }}>
          <Icon name="x" size={18}/>
        </button>
      </div>

      <div style={{ padding: '32px 48px 80px', maxWidth: 880, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <h2 style={{
            fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500, color: 'var(--fg-1)',
            letterSpacing: '-0.02em', margin: 0, flex: 1,
          }}>Document</h2>
        </div>

        {/* Saved doc card */}
        <div style={{
          background: '#fff', border: '1px solid var(--border-1)', borderRadius: 14,
          padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18,
        }}>
          <div style={{
            position: 'relative', width: 56, height: 72, flexShrink: 0,
            background: '#fff', border: '1px solid var(--border-1)', borderRadius: 5,
            padding: '7px 6px', boxShadow: 'var(--shadow-paper)',
          }}>
            <div style={{ height: 3, borderRadius: 1.5, background: 'var(--indigo-300)', width: '62%' }}/>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                height: 1.8, borderRadius: 1, background: 'var(--ink-200)',
                width: `${60 + (i * 11) % 32}%`, marginTop: 3.5,
              }}/>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>Acme NDA v3.pdf</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 12, color: 'var(--fg-3)' }}>
              <span>3 pages</span>
              <span>·</span>
              <span>4 field rules</span>
              <span>·</span>
              <span>Template default</span>
            </div>
          </div>
          <Badge tone="emerald">Selected</Badge>
        </div>

        {/* Replace-with row */}
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="repeat" size={14} style={{ color: 'var(--fg-3)' }}/>
            Or replace with a different document
            <span style={{ fontSize: 12, color: 'var(--fg-4)', fontWeight: 500 }}>
              — fields stay in place
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="secondary" icon="upload-cloud" onClick={onUpload}>Upload a PDF</Button>
            <Button
              variant="secondary"
              onClick={driveConnected ? onPickDrive : onConnectDrive}
              icon={undefined}
              style={{
                ...(driveConnected ? {} : { opacity: 0.6 }),
                gap: 10,
              }}
              disabled={!driveConnected}
              title={driveConnected ? undefined : 'Connect Google Drive in Settings to use this.'}>
              <GDriveLogo size={16}/>
              Pick from Google Drive
            </Button>
            {!driveConnected && (
              <button
                onClick={onConnectDrive}
                style={{
                  background: 'transparent', border: 'none', padding: '0 8px',
                  color: 'var(--accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}>
                Connect Google Drive in Settings
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border-1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" iconRight="arrow-right" onClick={onContinue}>Continue</Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewDocumentScreen, UseTemplateStep1 });
