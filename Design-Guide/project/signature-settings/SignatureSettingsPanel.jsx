/* @jsx React.createElement */
/* Signature Settings — preview card in the Sign Options sidebar.
   Shows the signer's signature in cursive with a gear icon to edit. */

function SignaturePreviewCard({ text, imageUrl, onEdit }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        background: hover ? 'var(--ink-100)' : 'var(--ink-50)',
        borderRadius: 10, padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', border: '1px solid var(--border-1)',
        transition: 'background 140ms',
      }}
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button" tabIndex={0}
    >
      <span style={{
        fontFamily: "'Caveat', cursive", fontSize: 22, fontWeight: 500,
        color: 'var(--fg-1)', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
      }}>{text}</span>
      <button style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: 4, borderRadius: 6, color: 'var(--fg-3)',
        flexShrink: 0, display: 'inline-flex',
      }} onClick={e => { e.stopPropagation(); onEdit(); }}>
        <Icon name="settings" size={16} />
      </button>
    </div>
  );
}

/* Sign Options — right sidebar panel */
function SignOptionsPanel({ signerName, filled, total, onEditSignature, onDecline, onRefuse, onSign }) {
  const [declineHover, setDeclineHover] = useState(false);
  const [refuseHover, setRefuseHover] = useState(false);
  const [signHover, setSignHover] = useState(false);
  const allDone = filled >= total;

  return (
    <div style={{
      width: '100%', fontFamily: 'var(--font-sans)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Title */}
      <h2 style={{
        fontSize: 20, fontWeight: 600, margin: '0 0 20px',
        fontFamily: 'var(--font-serif)', color: 'var(--fg-1)',
      }}>Sign options</h2>

      {/* Settings section */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 8 }}>Settings</div>
        <SignaturePreviewCard text={signerName} onEdit={onEditSignature} />
      </div>

      {/* Validation options */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 8 }}>Validation options</div>
        <button onClick={onDecline}
          onMouseEnter={() => setDeclineHover(true)} onMouseLeave={() => setDeclineHover(false)}
          style={{
            width: '100%', padding: '10px 14px', marginBottom: 6,
            border: '1px solid var(--border-2)', borderRadius: 8,
            background: declineHover ? 'var(--ink-50)' : '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            fontSize: 13, fontWeight: 600, color: 'var(--fg-1)',
            transition: 'background 120ms',
          }}>
          <Icon name="reply" size={14} /> Decline document
        </button>
        <button onClick={onRefuse}
          onMouseEnter={() => setRefuseHover(true)} onMouseLeave={() => setRefuseHover(false)}
          style={{
            width: '100%', padding: '10px 14px',
            border: '1px solid var(--border-1)', borderRadius: 8,
            background: refuseHover ? 'var(--ink-50)' : '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            fontSize: 13, fontWeight: 500, color: 'var(--fg-2)',
            textDecoration: 'underline', transition: 'background 120ms',
          }}>
          Refuse to sign this document
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div>
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
          {total - filled} field{(total - filled) !== 1 ? 's' : ''} to fill in
        </div>
        <button onClick={onSign}
          onMouseEnter={() => setSignHover(true)} onMouseLeave={() => setSignHover(false)}
          style={{
            width: '100%', padding: '16px 24px', border: 'none', borderRadius: 14,
            background: allDone ? 'var(--success-500)' : 'linear-gradient(135deg, #e8a09a, #d4817a)',
            cursor: 'pointer', fontSize: 17, fontWeight: 600, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: signHover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
            transform: signHover ? 'scale(1.01)' : 'scale(1)',
            transition: 'transform 80ms, box-shadow 80ms',
          }}>
          {allDone ? (<><Icon name="check" size={18} /> Finish signing</>) : (<>Sign <Icon name="arrow-right-circle" size={18} /></>)}
        </button>
      </div>
    </div>
  );
}
