/* @jsx React.createElement */
/* FieldActionButton — floating button anchored to the active field
   on the PDF canvas. Follows the user as they sign through fields.

   States:
   - "Start"      → first unfilled field, user hasn't signed yet
   - "Sign here"  → active signature/initials field, tap to open capture
   - "Next field" → just signed one field, button moves to the next
   - hidden       → all fields filled (review mode)
*/

function FieldActionButton({ label, position, onClick }) {
  const [hover, setHover] = useState(false);
  if (!position) return null;
  return (
    <div style={{
      position: 'absolute',
      left: position.x - 60,
      top: position.y + position.h + 8,
      zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      animation: 'fadeIn 200ms var(--ease-standard)',
    }}>
      {/* Connector line from field to button */}
      <div style={{
        width: 2, height: 8,
        background: 'var(--indigo-300)',
        borderRadius: 1,
      }} />
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          border: 'none', cursor: 'pointer',
          padding: '10px 22px', borderRadius: 999,
          background: '#C0392B',
          color: '#fff', fontSize: 14, fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: hover
            ? '0 4px 16px rgba(192,57,43,.35)'
            : '0 2px 8px rgba(192,57,43,.25)',
          transform: hover ? 'scale(1.03)' : 'scale(1)',
          transition: 'transform 80ms, box-shadow 80ms',
        }}
      >
        <Icon name="pen-tool" size={14} />
        {label}
      </button>
    </div>
  );
}

/* FieldActionPill — the red pill that sits on the left margin of the
   page, aligned with the active field. */
function FieldMarginIndicator({ position }) {
  if (!position) return null;
  return (
    <div style={{
      position: 'absolute',
      left: -48,
      top: position.y + (position.h / 2) - 16,
      width: 36, height: 32,
      background: '#C0392B',
      borderRadius: '8px 0 0 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 6px rgba(192,57,43,.2)',
    }}>
      <Icon name="pen-tool" size={14} style={{ color: '#fff' }} />
    </div>
  );
}
