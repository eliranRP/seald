/* @jsx React.createElement */
/* Sealed — Drive Picker modal
   States: list, selected, expired (token revoked / OAuth declined)
   Re-uses base modal scrim + Button + Icon + Card.
*/

const DEMO_FILES = [
  { id: 'f-contracts', name: 'Contracts', kind: 'folder', meta: '12 items' },
  { id: 'f-hr',        name: 'HR',        kind: 'folder', meta: '4 items'  },
  { id: 'd-nda',       name: '2026 NDA template.gdoc',     kind: 'gdoc', meta: 'Doc · 2 days ago' },
  { id: 'd-msa',       name: 'Acme MSA - signed.pdf',      kind: 'pdf',  meta: 'PDF · 14 KB · Apr 28' },
  { id: 'd-vendor',    name: 'Vendor agreement.docx',      kind: 'docx', meta: 'Word · 32 KB · Apr 1' },
  { id: 'd-statement', name: 'Statement of work — Q2.gdoc',kind: 'gdoc', meta: 'Doc · Mar 28' },
];

function FileTypeBadge({ kind }) {
  const map = {
    folder: { bg: '#FFF7ED', fg: '#9A3412', icon: 'folder' },
    pdf:    { bg: '#FEF2F2', fg: '#B91C1C', icon: 'file-text' },
    gdoc:   { bg: '#EFF6FF', fg: '#1D4ED8', icon: 'file-text' },
    docx:   { bg: '#EEF2FF', fg: '#4338CA', icon: 'file-text' },
  };
  const t = map[kind] || map.pdf;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 36, height: 36, borderRadius: 10, background: t.bg, color: t.fg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
      <Icon name={t.icon} size={18}/>
    </span>
  );
}

function FileRow({ file, selected, onSelect }) {
  const isFolder = file.kind === 'folder';
  return (
    <button
      type="button"
      onClick={() => onSelect(file)}
      aria-pressed={!isFolder ? selected : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', width: '100%', textAlign: 'left',
        background: selected ? 'var(--indigo-50)' : 'transparent',
        border: 'none', borderRadius: 10, cursor: 'pointer',
        outline: 'none',
        transition: 'background 120ms var(--ease-standard)',
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--ink-50)'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <FileTypeBadge kind={file.kind}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: 'var(--fg-1)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{file.name}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{file.meta}</div>
      </div>
      {isFolder
        ? <Icon name="chevron-right" size={16} style={{ color: 'var(--fg-4)' }}/>
        : selected
          ? <span aria-hidden="true" style={{
              width: 22, height: 22, borderRadius: 999, background: 'var(--indigo-600)',
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon name="check" size={14}/>
            </span>
          : <span aria-hidden="true" style={{
              width: 22, height: 22, borderRadius: 999, border: '1.5px solid var(--border-2)',
              flexShrink: 0,
            }}/>
      }
    </button>
  );
}

function DrivePickerModal({ open, state = 'list', onClose, onUseFile, onReconnect, onChangeSource }) {
  // Hooks must be called unconditionally (Rules of Hooks) — early-return after.
  const [selectedId, setSelectedId] = React.useState(null);
  const [search, setSearch] = React.useState('');

  if (!open) return null;

  // Override the local state if the parent forced "selected" demo state.
  const effectiveSelectedId = state === 'selected' ? 'd-msa' : selectedId;
  const selectedFile = DEMO_FILES.find((f) => f.id === effectiveSelectedId) || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-picker-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        animation: 'fadeIn 160ms var(--ease-standard)',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 760, maxWidth: '100%', height: 600, maxHeight: 'calc(100vh - 48px)',
          background: '#fff', borderRadius: 18, boxShadow: 'var(--shadow-xl)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid var(--border-1)', flexShrink: 0,
        }}>
          <GDriveLogo size={22}/>
          <div
            id="drive-picker-title"
            style={{
              fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500, color: 'var(--fg-1)',
              letterSpacing: '-0.01em', flex: 1,
            }}>
            Pick from Google Drive
          </div>
          <button
            onClick={onClose}
            aria-label="Close picker"
            style={{
              background: 'transparent', border: 'none', padding: 6, borderRadius: 8,
              color: 'var(--fg-3)', cursor: 'pointer',
            }}>
            <Icon name="x" size={18}/>
          </button>
        </div>

        {state === 'expired' ? (
          /* ---- Expired / OAuth declined state ---- */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: '32px 48px', textAlign: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 999,
              background: 'var(--warn-50)', color: 'var(--warn-700)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <Icon name="alert-triangle" size={28}/>
            </div>
            <div style={{
              fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--fg-1)',
              letterSpacing: '-0.01em', marginBottom: 8,
            }}>
              Your Google Drive connection expired
            </div>
            <p style={{
              margin: 0, fontSize: 14, color: 'var(--fg-3)', lineHeight: 1.6, maxWidth: 440,
            }}>
              Reconnect to keep importing files. Your in-progress document is safe — we'll pick up where you left off.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
              <Button variant="primary" icon="refresh-cw" onClick={onReconnect}>Reconnect</Button>
              <button
                onClick={onChangeSource}
                style={{
                  background: 'transparent', border: 'none', padding: '8px 4px',
                  color: 'var(--accent)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}>
                Choose a different document source
              </button>
            </div>
          </div>
        ) : (
          /* ---- Default list / selected state ---- */
          <>
            {/* Path + account row */}
            <div style={{
              padding: '12px 22px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid var(--border-1)', flexShrink: 0, background: 'var(--ink-50)',
            }}>
              <Icon name="home" size={14} style={{ color: 'var(--fg-3)' }}/>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>My Drive</span>
              <span style={{ color: 'var(--fg-4)' }}>/</span>
              <div style={{ flex: 1 }}/>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '4px 10px', borderRadius: 999, background: '#fff',
                border: '1px solid var(--border-1)', fontSize: 12, color: 'var(--fg-2)',
              }}>
                <Avatar name="Eliran Azulay" size={18}/>
                <span style={{ fontWeight: 500 }}>eliran@example.com</span>
              </div>
            </div>

            {/* Search */}
            <div style={{ padding: '14px 22px 8px', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }}>
                  <Icon name="search" size={16}/>
                </span>
                <label htmlFor="drive-search" style={{ position: 'absolute', left: -9999, top: 'auto' }}>Search Drive</label>
                <input
                  id="drive-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search PDFs, Docs, and Word documents in Drive…"
                  style={{
                    width: '100%', padding: '11px 14px 11px 38px',
                    border: '1px solid var(--border-1)', borderRadius: 12,
                    font: '400 14px var(--font-sans)', background: '#fff', color: 'var(--fg-1)',
                    outline: 'none', boxShadow: 'none', transition: 'border-color 120ms, box-shadow 120ms',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--indigo-500)'; e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* File list */}
            <div style={{
              flex: 1, minHeight: 0, overflow: 'auto',
              padding: '4px 12px 8px',
            }}>
              {DEMO_FILES.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  selected={effectiveSelectedId === f.id}
                  onSelect={(file) => {
                    if (file.kind === 'folder') return; // would navigate
                    setSelectedId(file.id);
                  }}
                />
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 22px', borderTop: '1px solid var(--border-1)',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
              background: '#fff',
            }}>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--fg-3)' }}>
                Showing PDFs, Google Docs, and Word documents.
              </div>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                icon="check"
                disabled={!selectedFile}
                onClick={() => selectedFile && onUseFile(selectedFile)}>
                Use this file
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DrivePickerModal });
