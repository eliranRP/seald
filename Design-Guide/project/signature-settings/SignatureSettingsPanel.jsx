/* @jsx React.createElement */
/* Signature Settings — section for the signing page review sidebar.
   Uses the Seald design system tokens from colors_and_type.css. */

/* ---------- Signature preview card ---------- */
function SignaturePreviewCard({ kind, text, imageUrl, onEdit }) {
  const label = kind === 'initials' ? 'Initials' : 'Signature';
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        background: hover ? 'var(--ink-150)' : 'var(--ink-50)',
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
        border: '1px solid var(--border-1)',
        transition: 'background 140ms var(--ease-standard)',
        marginBottom: 6,
      }}
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button" tabIndex={0}
      aria-label={`Change ${label.toLowerCase()}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <Icon name="pen-tool" size={14} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
        {imageUrl ? (
          <img src={imageUrl} alt={label} style={{ height: 28, maxWidth: '75%', objectFit: 'contain' }} />
        ) : (
          <span style={{
            fontFamily: "var(--font-script, 'Caveat', cursive)",
            fontSize: kind === 'initials' ? 24 : 18,
            color: 'var(--fg-1)',
            fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {text}
          </span>
        )}
      </div>
      <button
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 6, color: 'var(--fg-3)',
          flexShrink: 0, display: 'inline-flex', alignItems: 'center',
        }}
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        <Icon name="settings" size={14} />
      </button>
    </div>
  );
}

/* ---------- Settings section ---------- */
function SignatureSettingsSection({ hasSignatureFields, hasInitialsFields, signerName, signatureImage, initialsImage, onEditSignature, onEditInitials }) {
  if (!hasSignatureFields && !hasInitialsFields) return null;
  const initials = signerName.replace(/[,.\-]/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('');
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--fg-2)',
        marginBottom: 8, fontFamily: 'var(--font-sans)',
      }}>Settings</div>
      {hasSignatureFields && (
        <SignaturePreviewCard kind="signature" text={signerName} imageUrl={signatureImage} onEdit={onEditSignature} />
      )}
      {hasInitialsFields && (
        <SignaturePreviewCard kind="initials" text={initials} imageUrl={initialsImage} onEdit={onEditInitials} />
      )}
    </div>
  );
}
