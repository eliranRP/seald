/**
 * Signature Settings — sidebar panel on the signing page.
 *
 * Shows preview cards for the signer's signature and initials (if the
 * document contains those field types). Tapping the gear icon opens
 * the SignatureCapture drawer to change the mark.
 */

/* ---------- Signature preview card ---------- */
function SignaturePreviewCard({ kind, text, imageUrl, onEdit }) {
  const label = kind === 'initials' ? 'Initials' : 'Signature';
  return (
    <div style={{
      background: '#f8f8f8',
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      cursor: 'pointer',
      border: '1px solid #e8e8e8',
      transition: 'background 120ms',
      marginBottom: 8,
    }}
    onClick={onEdit}
    onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
    onMouseLeave={e => e.currentTarget.style.background = '#f8f8f8'}
    role="button"
    tabIndex={0}
    aria-label={`Change ${label.toLowerCase()}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {imageUrl ? (
          <img src={imageUrl} alt={label} style={{ height: 36, maxWidth: '80%', objectFit: 'contain' }} />
        ) : (
          <span style={{
            fontFamily: "'Caveat', cursive",
            fontSize: kind === 'initials' ? 28 : 22,
            color: '#1a1a1a',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {text}
          </span>
        )}
      </div>
      <button
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 6, color: '#888', flexShrink: 0,
        }}
        onClick={e => { e.stopPropagation(); onEdit(); }}
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  );
}

/* ---------- Settings section in the sidebar ---------- */
function SignatureSettingsSection({ hasSignatureFields, hasInitialsFields, signerName, signatureImage, initialsImage, onEditSignature, onEditInitials }) {
  if (!hasSignatureFields && !hasInitialsFields) return null;

  // Derive initials from name: "Eliran Azulay, Managing Member" → "EAMM"
  const initials = signerName
    .replace(/[,.\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .join('');

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{
        fontSize: 14, fontWeight: 600, color: '#1a1a1a',
        margin: '0 0 10px', fontFamily: 'var(--font-sans)',
      }}>
        Settings
      </h3>
      {hasSignatureFields && (
        <SignaturePreviewCard
          kind="signature"
          text={signerName}
          imageUrl={signatureImage}
          onEdit={onEditSignature}
        />
      )}
      {hasInitialsFields && (
        <SignaturePreviewCard
          kind="initials"
          text={initials}
          imageUrl={initialsImage}
          onEdit={onEditInitials}
        />
      )}
    </div>
  );
}

/* ---------- Full sidebar panel (signing page context) ---------- */
function SignOptionsPanel({ state, onEditSignature, onEditInitials, onDecline, onSign }) {
  const {
    signerName,
    signatureImage,
    initialsImage,
    hasSignatureFields,
    hasInitialsFields,
    remainingFields,
  } = state;

  return (
    <div style={{
      width: 340, background: '#fff', borderRadius: 16,
      border: '1px solid #e8e8e8', padding: '24px 20px',
      fontFamily: 'var(--font-sans)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px', textAlign: 'center', color: '#1a1a1a' }}>
        Sign options
      </h2>

      <div style={{ width: '100%', height: 1, background: '#eee', marginBottom: 16 }} />

      {/* Signature Settings Section */}
      <SignatureSettingsSection
        hasSignatureFields={hasSignatureFields}
        hasInitialsFields={hasInitialsFields}
        signerName={signerName}
        signatureImage={signatureImage}
        initialsImage={initialsImage}
        onEditSignature={onEditSignature}
        onEditInitials={onEditInitials}
      />

      {/* Validation options */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{
          fontSize: 14, fontWeight: 600, color: '#1a1a1a',
          margin: '0 0 10px', fontFamily: 'var(--font-sans)',
        }}>
          Validation options
        </h3>
        <button
          onClick={onDecline}
          style={{
            width: '100%', padding: '12px 16px',
            border: '1px solid #d0d0d0', borderRadius: 10,
            background: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, fontSize: 14, fontWeight: 500, color: '#333',
            transition: 'background 120ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f8f8f8'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14 4 9l5-5"/>
            <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
          </svg>
          Decline document
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
          {remainingFields} field{remainingFields !== 1 ? 's' : ''} to fill in
        </div>
        <button
          onClick={onSign}
          style={{
            width: '100%', padding: '18px 24px',
            border: 'none', borderRadius: 14,
            background: 'linear-gradient(135deg, #e8a09a, #d4817a)',
            cursor: 'pointer', fontSize: 18, fontWeight: 600,
            color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10,
            boxShadow: '0 2px 8px rgba(212,129,122,.3)',
            transition: 'transform 80ms, box-shadow 80ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.01)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(212,129,122,.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(212,129,122,.3)'; }}
        >
          Sign
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16l4-4-4-4"/>
            <path d="M8 12h8"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
