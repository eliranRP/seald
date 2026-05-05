/**
 * Signature Capture Modal — opened when the user clicks the gear icon
 * on a signature/initials preview card.
 *
 * Shows: name input, initials input, font selector with 4 options,
 * and Cancel/Apply actions.
 */

const FONTS = [
  { id: 'caveat',    family: "'Caveat', cursive",         label: 'Caveat' },
  { id: 'dancing',   family: "'Dancing Script', cursive", label: 'Dancing Script' },
  { id: 'sans',      family: "'Inter', sans-serif",       label: 'Inter' },
  { id: 'handlee',   family: "'Handlee', cursive",        label: 'Handlee' },
];

function SignatureCaptureModal({ open, kind, signerName, onCancel, onApply }) {
  const [name, setName] = React.useState(signerName);
  const [initials, setInitials] = React.useState(() =>
    signerName.replace(/[,.\-]/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('')
  );
  const [selectedFont, setSelectedFont] = React.useState('caveat');
  const [tab, setTab] = React.useState('type'); // type | draw

  if (!open) return null;

  const kindLabel = kind === 'initials' ? 'initials' : 'signature';
  const displayText = kind === 'initials' ? initials : name;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.4)',
      animation: 'fadeIn 200ms ease',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: 480, maxWidth: '92vw',
        padding: '28px 28px 20px', boxShadow: '0 8px 32px rgba(0,0,0,.15)',
        fontFamily: 'var(--font-sans)',
      }}>
        {/* Title */}
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px', color: '#1a1a1a' }}>
          Set your {kindLabel} details
        </h2>

        {/* Name + Initials inputs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, display: 'block' }}>
              Full name:
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #d0d0d0',
                borderRadius: 8, fontSize: 14, outline: 'none',
                borderBottom: '2px solid #d4817a',
              }}
            />
          </div>
          <div style={{ width: 90 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4, display: 'block' }}>
              Initials:
            </label>
            <input
              value={initials}
              onChange={e => setInitials(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #d0d0d0',
                borderRadius: 8, fontSize: 14, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Tabs: Signature / Initials type selector */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid #eee', marginBottom: 12,
        }}>
          {['type', 'draw'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                color: tab === t ? '#d4817a' : '#888',
                borderBottom: tab === t ? '2px solid #d4817a' : '2px solid transparent',
              }}
            >
              {t === 'type' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/></svg>
                  {kind === 'initials' ? 'Initials' : 'Signature'}
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
                  Draw
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Font options (type tab) */}
        {tab === 'type' && (
          <div style={{
            border: '1px solid #eee', borderRadius: 10, padding: 8,
            maxHeight: 180, overflow: 'auto',
          }}>
            {FONTS.map(font => (
              <label
                key={font.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  background: selectedFont === font.id ? '#faf5f5' : 'transparent',
                  transition: 'background 100ms',
                }}
                onMouseEnter={e => { if (selectedFont !== font.id) e.currentTarget.style.background = '#f8f8f8'; }}
                onMouseLeave={e => { if (selectedFont !== font.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <input
                  type="radio"
                  name="font"
                  checked={selectedFont === font.id}
                  onChange={() => setSelectedFont(font.id)}
                  style={{ accentColor: '#d4817a' }}
                />
                <span style={{
                  fontFamily: font.family, fontSize: 20, color: '#1a1a1a',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {displayText || 'Preview'}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Draw tab placeholder */}
        {tab === 'draw' && (
          <div style={{
            border: '1px dashed #ccc', borderRadius: 10,
            height: 160, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#999', fontSize: 14,
          }}>
            Draw your {kindLabel} here
          </div>
        )}

        {/* Actions */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee',
        }}>
          <button
            onClick={onCancel}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              padding: '8px 16px', fontSize: 14, fontWeight: 500, color: '#666',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onApply({ name, initials, font: selectedFont })}
            style={{
              border: 'none', borderRadius: 8, cursor: 'pointer',
              padding: '8px 20px', fontSize: 14, fontWeight: 600,
              background: '#d4817a', color: '#fff',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
