/* @jsx React.createElement */
/* Signature Capture Modal — bottom sheet matching the existing
   SignatureCapture component's visual language. */

const SIG_FONTS = [
  { id: 'caveat',  family: "'Caveat', cursive",         label: 'Caveat' },
  { id: 'dancing', family: "'Dancing Script', cursive", label: 'Dancing Script' },
  { id: 'inter',   family: "'Inter', sans-serif",       label: 'Inter' },
  { id: 'serif',   family: "'Source Serif 4', serif",   label: 'Source Serif' },
];

function SignatureCaptureModal({ open, kind, signerName, onCancel, onApply }) {
  const [name, setName] = useState(signerName);
  const [initials, setInitials] = useState(
    () => signerName.replace(/[,.\-]/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('')
  );
  const [selectedFont, setSelectedFont] = useState('caveat');
  const [tab, setTab] = useState('type');
  const [focused, setFocused] = useState(null);

  if (!open) return null;
  const kindLabel = kind === 'initials' ? 'initials' : 'signature';
  const displayText = kind === 'initials' ? initials : name;

  return (
    /* Backdrop — matches ink-900 at 50% */
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'rgba(11, 18, 32, 0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'fadeIn 200ms',
    }}>
      {/* Sheet — bottom-sheet pattern matching SignatureCapture.styles.ts */}
      <div style={{
        background: '#fff', width: '100%', maxWidth: 680,
        borderRadius: '20px 20px 0 0',
        padding: '24px 28px 28px',
        boxShadow: '0 -10px 40px rgba(11, 18, 32, 0.2)',
        fontFamily: 'var(--font-sans)',
        animation: 'slideUp 240ms var(--ease-standard)',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{
            fontSize: 18, fontWeight: 500, margin: 0,
            fontFamily: 'var(--font-serif)', color: 'var(--fg-1)',
          }}>
            Set your {kindLabel} details
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 8, color: 'var(--fg-3)',
              display: 'inline-flex',
            }}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Name + Initials inputs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{
              fontSize: 13, fontWeight: 600, color: 'var(--fg-2)',
              marginBottom: 6, display: 'block',
            }}>Full name:</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused(null)}
              style={{
                width: '100%', padding: '12px 16px',
                border: `1px solid ${focused === 'name' ? 'var(--indigo-500)' : 'var(--border-2)'}`,
                borderRadius: 12, fontSize: 14, outline: 'none',
                boxShadow: focused === 'name' ? 'var(--shadow-focus)' : 'none',
                fontFamily: 'var(--font-sans)', color: 'var(--fg-1)',
                transition: 'border-color 120ms, box-shadow 120ms',
              }}
            />
          </div>
          <div style={{ width: 100 }}>
            <label style={{
              fontSize: 13, fontWeight: 600, color: 'var(--fg-2)',
              marginBottom: 6, display: 'block',
            }}>Initials:</label>
            <input
              value={initials}
              onChange={e => setInitials(e.target.value)}
              onFocus={() => setFocused('initials')}
              onBlur={() => setFocused(null)}
              style={{
                width: '100%', padding: '12px 16px',
                border: `1px solid ${focused === 'initials' ? 'var(--indigo-500)' : 'var(--border-2)'}`,
                borderRadius: 12, fontSize: 14, outline: 'none',
                boxShadow: focused === 'initials' ? 'var(--shadow-focus)' : 'none',
                fontFamily: 'var(--font-sans)', color: 'var(--fg-1)',
                transition: 'border-color 120ms, box-shadow 120ms',
              }}
            />
          </div>
        </div>

        {/* Tabs — matching SignatureCapture tab bar */}
        <div style={{
          display: 'inline-flex', gap: 4, padding: 4,
          background: 'var(--ink-100)', borderRadius: 12,
          marginBottom: 14,
        }}>
          {['type', 'draw'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                border: 'none', cursor: 'pointer',
                padding: '6px 14px', borderRadius: 8,
                fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? 'var(--fg-1)' : 'var(--fg-3)',
                boxShadow: tab === t ? 'var(--shadow-sm)' : 'none',
                transition: 'background 120ms, color 120ms',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon name={t === 'type' ? 'pen-tool' : 'paintbrush'} size={13} />
              {t === 'type' ? (kind === 'initials' ? 'Initials' : 'Signature') : 'Draw'}
            </button>
          ))}
        </div>

        {/* Font selector (type tab) */}
        {tab === 'type' && (
          <div style={{
            border: '1px solid var(--border-1)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            {SIG_FONTS.map((font, i) => (
              <label
                key={font.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', cursor: 'pointer',
                  background: selectedFont === font.id ? 'var(--indigo-50)' : 'transparent',
                  borderBottom: i < SIG_FONTS.length - 1 ? '1px solid var(--border-1)' : 'none',
                  transition: 'background 100ms',
                }}
              >
                <input
                  type="radio" name="sig-font"
                  checked={selectedFont === font.id}
                  onChange={() => setSelectedFont(font.id)}
                  style={{ accentColor: 'var(--indigo-600)', width: 16, height: 16 }}
                />
                <span style={{
                  fontFamily: font.family, fontSize: 22, color: 'var(--fg-1)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  flex: 1,
                }}>
                  {displayText || 'Preview'}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Draw canvas (draw tab) */}
        {tab === 'draw' && (
          <div style={{
            border: '1.5px dashed var(--border-2)',
            borderRadius: 12, height: 180,
            background: 'var(--ink-50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-4)', fontSize: 14,
          }}>
            <div style={{ textAlign: 'center' }}>
              <Icon name="pen-tool" size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div>Draw your {kindLabel} here</div>
            </div>
          </div>
        )}

        {/* Footer — matches SignatureCapture button pattern */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          marginTop: 20,
        }}>
          <Button variant="secondary" size="md" onClick={onCancel}>Cancel</Button>
          <Button variant="dark" size="md" onClick={() => onApply({ name, initials, font: selectedFont })}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
