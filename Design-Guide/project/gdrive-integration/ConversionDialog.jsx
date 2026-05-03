/* @jsx React.createElement */
/* Sealed — surface 5: conversion progress + conversion-failed dialog. */

function ConversionProgressDialog({ open, fileName, percent = 45, onCancel }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conv-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        animation: 'fadeIn 160ms var(--ease-standard)',
      }}>
      <div style={{
        width: 480, maxWidth: '100%', background: '#fff',
        borderRadius: 18, boxShadow: 'var(--shadow-xl)', padding: '28px 28px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--indigo-50)', color: 'var(--indigo-700)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name="loader-2" size={20}/>
          </div>
          <div style={{ flex: 1 }}>
            <div
              id="conv-title"
              style={{
                fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, color: 'var(--fg-1)',
                letterSpacing: '-0.01em', lineHeight: 1.2,
              }}>
              Preparing your document
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 4, lineHeight: 1.5 }}>
              Converting <span style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{fileName}</span> to PDF.
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Converting ${fileName}`}
          style={{
            marginTop: 18, height: 8, borderRadius: 999,
            background: 'var(--ink-100)', overflow: 'hidden',
          }}>
          {/* Animate transform (scaleX) instead of width — keeps work on the compositor (rule: transform-performance). */}
          <div style={{
            width: '100%', height: '100%', borderRadius: 999,
            background: 'linear-gradient(90deg, var(--indigo-500), var(--indigo-700))',
            transformOrigin: 'left center',
            transform: `scaleX(${Math.max(0, Math.min(100, percent)) / 100})`,
            transition: 'transform 240ms var(--ease-standard)',
            willChange: 'transform',
          }}/>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 8,
          fontSize: 12, color: 'var(--fg-3)',
        }}>
          <span>This usually takes a few seconds.</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>{percent}%</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function ConversionFailedDialog({ open, fileName, onPickDifferent, onUploadInstead, onClose }) {
  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conv-fail-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        animation: 'fadeIn 160ms var(--ease-standard)',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540, maxWidth: '100%', background: '#fff',
          borderRadius: 18, boxShadow: 'var(--shadow-xl)', padding: '28px 28px 22px',
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--danger-50)', color: 'var(--danger-700)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name="alert-triangle" size={20}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id="conv-fail-title"
              style={{
                fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, color: 'var(--fg-1)',
                letterSpacing: '-0.01em', lineHeight: 1.2,
              }}>
              Couldn't convert this document
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 4, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{fileName}</span> couldn't be converted to PDF.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', padding: 6, borderRadius: 8,
              color: 'var(--fg-3)', cursor: 'pointer', flexShrink: 0,
            }}>
            <Icon name="x" size={18}/>
          </button>
        </div>

        <div style={{
          marginTop: 4, padding: '12px 14px',
          background: 'var(--warn-50)', border: '1px solid #FDE68A',
          borderRadius: 12, fontSize: 13, color: 'var(--warn-700)', lineHeight: 1.5,
        }}>
          This usually means the file uses an unsupported feature (macros, embedded objects, or password protection).
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{
            fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-micro)', fontWeight: 600,
            letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase',
            color: 'var(--fg-3)', marginBottom: 10,
          }}>
            Try one of
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
              <Icon name="arrow-right" size={14} style={{ color: 'var(--fg-4)', marginTop: 3 }}/>
              <span>Open the file in Word or Google Docs and "Download as PDF" yourself, then upload that PDF.</span>
            </li>
            <li style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
              <Icon name="arrow-right" size={14} style={{ color: 'var(--fg-4)', marginTop: 3 }}/>
              <span>Pick a different file from Drive.</span>
            </li>
          </ul>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
          <Button variant="secondary" icon="upload-cloud" onClick={onUploadInstead}>Upload a PDF</Button>
          <Button variant="primary" onClick={onPickDifferent}>Pick a different file</Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ConversionProgressDialog, ConversionFailedDialog });
