/* @jsx React.createElement */
/* FieldActionButton — sticky left-margin button that guides the signer.

   Lifecycle:
   1. "Start"      → sticky on left margin, always visible on scroll.
                      Clicking scrolls to the first field and disappears.
   2. (hidden)     → while a field is active and in viewport.
   3. "Next"       → after signing a field, appears at next unfilled field.
                      If user scrolls away, reverts to sticky "Start" on left.
   4. (hidden)     → all fields filled.
*/

function StickyStartButton({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{
      position: 'fixed',
      left: 0,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 40,
      animation: 'slideInLeft 240ms var(--ease-standard)',
    }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          border: 'none', cursor: 'pointer',
          padding: '12px 20px 12px 16px',
          borderRadius: '0 14px 14px 0',
          background: '#C0392B',
          color: '#fff', fontSize: 15, fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: hover
            ? '0 4px 20px rgba(192,57,43,.4)'
            : '0 2px 12px rgba(192,57,43,.3)',
          transform: hover ? 'translateX(2px)' : 'translateX(0)',
          transition: 'transform 100ms, box-shadow 100ms',
        }}
      >
        <Icon name="pen-tool" size={16} />
        Start
      </button>
    </div>
  );
}

function NextFieldButton({ position, onClick }) {
  const [hover, setHover] = useState(false);
  if (!position) return null;
  return (
    <div style={{
      position: 'absolute',
      left: position.x - 70,
      top: position.y + (position.h / 2) - 18,
      zIndex: 10,
      animation: 'fadeIn 200ms var(--ease-standard)',
    }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          border: 'none', cursor: 'pointer',
          padding: '10px 20px',
          borderRadius: 999,
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
        <Icon name="arrow-right" size={14} />
        Next
      </button>
    </div>
  );
}

/* Red margin indicator — sits on the left edge of the page */
function FieldMarginIndicator({ position }) {
  if (!position) return null;
  return (
    <div style={{
      position: 'absolute',
      left: -46,
      top: position.y + (position.h / 2) - 16,
      width: 34, height: 32,
      background: '#C0392B',
      borderRadius: '8px 0 0 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 6px rgba(192,57,43,.2)',
      animation: 'fadeIn 200ms var(--ease-standard)',
    }}>
      <Icon name="pen-tool" size={14} style={{ color: '#fff' }} />
    </div>
  );
}
