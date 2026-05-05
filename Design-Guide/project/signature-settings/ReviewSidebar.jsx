/* @jsx React.createElement */
/* ReviewSidebar — the signing page's review panel that contains
   Settings, Validation options, and the Sign CTA.
   Matches the actual SigningReviewPage layout. */

function ReviewSidebar({ state, onEditSignature, onEditInitials, onDecline, onSign }) {
  const {
    signerName, signatureImage, initialsImage,
    hasSignatureFields, hasInitialsFields, remainingFields,
  } = state;
  const [declineHover, setDeclineHover] = useState(false);
  const [signHover, setSignHover] = useState(false);

  return (
    <div style={{
      width: 320, background: '#fff', borderRadius: 16,
      border: '1px solid var(--border-1)',
      padding: '20px 18px 18px',
      fontFamily: 'var(--font-sans)',
      display: 'flex', flexDirection: 'column',
      boxShadow: 'var(--shadow-paper)',
    }}>
      {/* Title */}
      <h2 style={{
        fontSize: 18, fontWeight: 500, margin: '0 0 14px', textAlign: 'center',
        fontFamily: 'var(--font-serif)', color: 'var(--fg-1)',
      }}>
        Sign options
      </h2>
      <div style={{ width: '100%', height: 1, background: 'var(--border-1)', marginBottom: 14 }} />

      {/* Settings section */}
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
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 8,
        }}>Validation options</div>
        <button
          onClick={onDecline}
          onMouseEnter={() => setDeclineHover(true)}
          onMouseLeave={() => setDeclineHover(false)}
          style={{
            width: '100%', padding: '10px 14px',
            border: '1px solid var(--border-1)', borderRadius: 8,
            background: declineHover ? 'var(--ink-50)' : '#fff',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--fg-2)',
            transition: 'background 120ms var(--ease-standard)',
          }}
        >
          <Icon name="reply" size={14} />
          Decline document
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div>
        <div style={{
          fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--fg-3)', marginBottom: 8,
        }}>
          {remainingFields} field{remainingFields !== 1 ? 's' : ''} to fill in
        </div>
        <button
          onClick={onSign}
          onMouseEnter={() => setSignHover(true)}
          onMouseLeave={() => setSignHover(false)}
          style={{
            width: '100%', padding: '14px 20px',
            border: 'none', borderRadius: 12,
            background: remainingFields === 0 ? 'var(--success-500)' : 'var(--indigo-600)',
            cursor: 'pointer', fontSize: 15, fontWeight: 600,
            color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10,
            boxShadow: signHover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
            transform: signHover ? 'scale(1.01)' : 'scale(1)',
            transition: 'transform 80ms, box-shadow 80ms, background 120ms',
          }}
        >
          {remainingFields === 0 ? (
            <><Icon name="check" size={18} /> Finish signing</>
          ) : (
            <><Icon name="arrow-right-circle" size={18} /> Sign</>
          )}
        </button>
      </div>
    </div>
  );
}
