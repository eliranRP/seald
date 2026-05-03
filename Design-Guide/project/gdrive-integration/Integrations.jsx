/* @jsx React.createElement */
/* Sealed — Settings → Integrations
   Standalone page with breadcrumb (no left rail per Phase 2 watchpoint #1).
   Re-uses TopNav, Card, Button, Badge, Icon from _shared/components.jsx.
*/

function GDriveLogo({ size = 28 }) {
  // Inline Drive triangle mark — no new icon dependency.
  // Three-tone glyph mirrors Google Drive without being pixel-faithful (avoids trademark mimicry).
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Google Drive"
      style={{ flexShrink: 0 }}
    >
      <title>Google Drive</title>
      <path d="M11 4 L21 4 L31 21 L26 30 L16 13 Z" fill="#FBBC04"/>
      <path d="M11 4 L1 21 L6 30 L16 13 Z" fill="#1FA463"/>
      <path d="M6 30 L26 30 L31 21 L11 21 Z" fill="#4285F4"/>
    </svg>
  );
}

function Breadcrumb({ items = [], onJump }) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 'var(--fs-caption)', color: 'var(--fg-3)',
      }}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={it.label}>
            {last
              ? <span aria-current="page" style={{ color: 'var(--fg-1)', fontWeight: 600 }}>{it.label}</span>
              : (
                <button
                  onClick={() => onJump && onJump(it)}
                  style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--fg-3)', cursor: 'pointer', fontSize: 'var(--fs-caption)' }}>
                  {it.label}
                </button>
              )}
            {!last && <Icon name="chevron-right" size={12} style={{ color: 'var(--fg-4)' }}/>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function PermissionList() {
  const items = [
    { icon: 'eye', text: 'Read only the files you pick — never your full Drive.' },
    { icon: 'lock', text: 'Tokens are encrypted at rest with KMS envelope encryption.' },
    { icon: 'x-circle', text: 'Revoke access any time — disconnecting deletes the tokens.' },
  ];
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it) => (
        <li key={it.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
          <span style={{
            width: 24, height: 24, borderRadius: 8, background: 'var(--ink-100)',
            color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name={it.icon} size={13}/>
          </span>
          <span style={{ paddingTop: 3 }}>{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

function GDriveCard({ state, onConnect, onDisconnect, account }) {
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid var(--border-1)',
      }}>
        <GDriveLogo size={32}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-1)' }}>Google Drive</div>
          <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 2 }}>
            Pick PDFs and Google Docs from Drive when starting a new document or applying a template.
          </div>
        </div>
        {state === 'connected' && <Badge tone="emerald">Connected</Badge>}
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        {state === 'empty' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--fg-3)', marginBottom: 14 }}>
                No accounts connected.
              </div>
              <Button variant="primary" icon="link" onClick={onConnect}>
                Connect Google Drive
              </Button>
              <div style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 10 }}>
                Opens Google's sign-in window. You'll choose what to share.
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{
                fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-micro)', fontWeight: 600,
                letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase',
                color: 'var(--fg-3)', marginBottom: 12,
              }}>What we ask for</div>
              <PermissionList/>
            </div>
          </div>
        )}

        {state === 'connected' && (
          <div>
            {/* Account row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', border: '1px solid var(--border-1)', borderRadius: 12,
              background: 'var(--ink-50)',
            }}>
              <Avatar name={account.name} size={36}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{account.email}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>
                  Connected {account.connectedAt} · Last used {account.lastUsedAt}
                </div>
              </div>
              <Button variant="danger" icon="unlink" onClick={onDisconnect}>Disconnect</Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12, color: 'var(--fg-4)' }}>
              <Icon name="plus" size={12}/>
              <span>Add another account</span>
              <span style={{
                marginLeft: 4, padding: '2px 8px', borderRadius: 999,
                background: 'var(--ink-100)', color: 'var(--fg-3)', fontSize: 10, fontWeight: 600,
                letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
              }}>Coming soon</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ComingSoonCard({ name, description }) {
  return (
    <Card padding={0} style={{ overflow: 'hidden', opacity: 0.65 }}>
      <div style={{
        padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: 'var(--ink-100)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)',
          flexShrink: 0,
        }}>
          <Icon name="cloud" size={18}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-1)' }}>{name}</div>
          <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 2 }}>{description}</div>
        </div>
        <Badge tone="neutral">Coming soon</Badge>
      </div>
    </Card>
  );
}

function IntegrationsPage({ state, onConnect, onDisconnect, account, onBreadcrumb }) {
  return (
    <div data-screen-label={`Settings → Integrations · ${state}`} style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      <TopNav active="documents" logoSrc="../assets/logo.svg"/>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 32px 80px' }}>
        <Breadcrumb
          items={[{ label: 'Settings', key: 'settings' }, { label: 'Integrations', key: 'integrations' }]}
          onJump={onBreadcrumb}/>

        <div style={{ marginTop: 14, marginBottom: 28 }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'var(--fs-h2)', fontWeight: 500,
            letterSpacing: 'var(--tracking-tight)', color: 'var(--fg-1)', margin: 0, lineHeight: 'var(--lh-tight)',
          }}>Integrations</h1>
          <p style={{
            margin: '8px 0 0', fontSize: 'var(--fs-body)', color: 'var(--fg-3)', lineHeight: 'var(--lh-relaxed)', maxWidth: 640,
          }}>
            Connect external services to import documents into Seald. We only ever read files you explicitly pick.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GDriveCard
            state={state === 'connected' ? 'connected' : 'empty'}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            account={account}/>
          <ComingSoonCard name="Dropbox" description="Pick documents from Dropbox folders and shared drives."/>
          <ComingSoonCard name="OneDrive" description="Import documents from Microsoft 365 OneDrive."/>
        </div>
      </div>
    </div>
  );
}

function DisconnectModal({ open, onClose, onConfirm, accountEmail }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disconnect-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        animation: 'fadeIn 160ms var(--ease-standard)',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: '100%', background: '#fff',
          borderRadius: 18, boxShadow: 'var(--shadow-xl)', padding: '28px 28px 22px',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--danger-50)', color: 'var(--danger-700)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name="unlink" size={20}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id="disconnect-title"
              style={{
                fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500,
                color: 'var(--fg-1)', letterSpacing: '-0.01em', lineHeight: 1.2,
              }}>
              Disconnect Google Drive?
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 4, lineHeight: 1.5 }}>
              Documents you've already imported will keep working. You won't be able to pick new files until you reconnect.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent', border: 'none', padding: 6, borderRadius: 8,
              color: 'var(--fg-3)', cursor: 'pointer', flexShrink: 0,
            }}>
            <Icon name="x" size={18}/>
          </button>
        </div>

        <div style={{
          marginTop: 8, padding: '12px 14px', background: 'var(--ink-50)',
          border: '1px solid var(--border-1)', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <GDriveLogo size={20}/>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>{accountEmail}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="unlink"
            onClick={onConfirm}
            style={{
              background: 'var(--danger-700)',
              borderColor: 'var(--danger-700)',
            }}>
            Disconnect
          </Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { IntegrationsPage, DisconnectModal, GDriveLogo, Breadcrumb });
