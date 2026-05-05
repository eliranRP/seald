/* @jsx React.createElement */
/* Set your signature details — center modal matching the reference.
   Full name + Initials inputs, Signature/Initials tabs,
   4 font options with radio, color picker, Cancel/Apply. */

const SIG_FONTS = [
  { id: 'caveat',   family: "'Caveat', cursive" },
  { id: 'dancing',  family: "'Dancing Script', cursive" },
  { id: 'inter',    family: "'Inter', sans-serif" },
  { id: 'serif',    family: "'Source Serif 4', serif" },
];

const SIG_COLORS = [
  { id: 'black', hex: '#0B1220' },
  { id: 'red',   hex: '#C0392B' },
  { id: 'blue',  hex: '#2E5BBA' },
  { id: 'green', hex: '#1B8C5A' },
];

function SignatureCaptureModal({ open, signerName, onCancel, onApply }) {
  const [name, setName] = useState(signerName);
  const [initials, setInitials] = useState(
    () => signerName.replace(/[,.\-]/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('')
  );
  const [selectedFont, setSelectedFont] = useState('caveat');
  const [selectedColor, setSelectedColor] = useState('black');
  const [tab, setTab] = useState('signature');
  const [focusedInput, setFocusedInput] = useState(null);

  if (!open) return null;
  const displayText = tab === 'initials' ? initials : name;
  const activeColor = SIG_COLORS.find(c => c.id === selectedColor)?.hex || '#0B1220';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'rgba(11, 18, 32, 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 200ms',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: 520, maxWidth: '94vw',
        boxShadow: 'var(--shadow-xl)', fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--fg-1)' }}>
              Set your signature details
            </h2>
            <button onClick={onCancel} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 8, color: 'var(--fg-3)', display: 'inline-flex',
            }}><Icon name="x" size={18} /></button>
          </div>

          {/* Name + Initials row */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 6, display: 'block' }}>Full name:</label>
              <input value={name} onChange={e => setName(e.target.value)}
                onFocus={() => setFocusedInput('name')} onBlur={() => setFocusedInput(null)}
                style={{
                  width: '100%', padding: '10px 14px',
                  border: `1.5px solid ${focusedInput === 'name' ? 'var(--indigo-500)' : 'var(--border-2)'}`,
                  borderRadius: 8, fontSize: 14, outline: 'none',
                  color: 'var(--fg-1)', fontFamily: 'var(--font-sans)',
                  boxShadow: focusedInput === 'name' ? 'var(--shadow-focus)' : 'none',
                  transition: 'border-color 120ms, box-shadow 120ms',
                }} />
            </div>
            <div style={{ width: 90 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 6, display: 'block' }}>Initials:</label>
              <input value={initials} onChange={e => setInitials(e.target.value)}
                onFocus={() => setFocusedInput('ini')} onBlur={() => setFocusedInput(null)}
                style={{
                  width: '100%', padding: '10px 14px',
                  border: `1.5px solid ${focusedInput === 'ini' ? 'var(--indigo-500)' : 'var(--border-2)'}`,
                  borderRadius: 8, fontSize: 14, outline: 'none',
                  color: 'var(--fg-1)', fontFamily: 'var(--font-sans)',
                  boxShadow: focusedInput === 'ini' ? 'var(--shadow-focus)' : 'none',
                  transition: 'border-color 120ms, box-shadow 120ms',
                }} />
            </div>
          </div>

          {/* Signature / Initials tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-1)', marginBottom: 0 }}>
            {[{ id: 'signature', icon: 'pen-tool', label: 'Signature' }, { id: 'initials', icon: 'type', label: 'Initials' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  color: tab === t.id ? 'var(--fg-1)' : 'var(--fg-3)',
                  borderBottom: tab === t.id ? '2px solid var(--fg-1)' : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-sans)', transition: 'color 120ms',
                }}>
                <Icon name={t.icon} size={14} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font options list */}
        <div style={{ padding: '0 28px', maxHeight: 220, overflowY: 'auto' }}>
          {SIG_FONTS.map((font, i) => {
            const isSelected = selectedFont === font.id;
            return (
              <label key={font.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 4px', cursor: 'pointer',
                borderBottom: i < SIG_FONTS.length - 1 ? '1px solid var(--border-1)' : 'none',
              }}>
                {/* Radio dot */}
                <span style={{
                  width: 18, height: 18, borderRadius: 999, flexShrink: 0,
                  border: isSelected ? 'none' : '2px solid var(--border-2)',
                  background: isSelected ? 'var(--success-500)' : '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 120ms, border 120ms',
                }}>
                  {isSelected && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
                </span>
                <input type="radio" name="sig-font" checked={isSelected}
                  onChange={() => setSelectedFont(font.id)}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                <span style={{
                  fontFamily: font.family, fontSize: 22, color: activeColor,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                }}>{displayText || 'Preview'}</span>
              </label>
            );
          })}
        </div>

        {/* Color picker */}
        <div style={{ padding: '12px 28px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)' }}>Color:</span>
          {SIG_COLORS.map(c => (
            <button key={c.id} onClick={() => setSelectedColor(c.id)}
              style={{
                width: 20, height: 20, borderRadius: 999, border: 'none',
                background: c.hex, cursor: 'pointer',
                outline: selectedColor === c.id ? `2px solid ${c.hex}` : 'none',
                outlineOffset: 2,
                transition: 'outline 100ms',
              }} />
          ))}
        </div>

        {/* Divider + Footer */}
        <div style={{ margin: '16px 0 0', borderTop: '1px solid var(--border-1)', padding: '14px 28px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            padding: '8px 16px', fontSize: 14, fontWeight: 500,
            color: 'var(--indigo-600)', fontFamily: 'var(--font-sans)',
          }}>Cancel</button>
          <Button variant="primary" size="md" onClick={() => onApply({ name, initials, font: selectedFont, color: selectedColor })}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
