/* @jsx React.createElement */
/*
 * mobile-web-frame.jsx — Phone-shaped frame for mobile *web* designs.
 * Distinct from ui_kits/mobile_app/ios-frame.jsx, which renders native iOS
 * chrome (Dynamic Island, large titles, glass nav pills). This frame is
 * **mobile Safari**: status bar + URL bar + scrollable web content +
 * sticky bottom-bar slot + home indicator.
 *
 * Exports (window.*):
 *   MobileWebDevice  — the phone shell
 *   MWStep           — top stepper bar inside content
 *   MWStickyBar      — sticky bottom action wrapper
 *   MWBottomSheet    — modal sheet rising from bottom
 */

const MW_DEVICE_W = 402;
const MW_DEVICE_H = 874;
const MW_RADIUS   = 48;

function MWStatusBar({ time = '9:41' }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'14px 28px 8px', height:24, position:'relative', zIndex:20,
      fontFamily:'-apple-system, "SF Pro", system-ui',
    }}>
      <span style={{ fontWeight:590, fontSize:15, color:'#000' }}>{time}</span>
      <div style={{ width:126 }}/>{/* dynamic-island spacer */}
      <div style={{ display:'flex', gap:6, alignItems:'center', color:'#000' }}>
        {/* signal */}
        <svg width="17" height="11" viewBox="0 0 17 11">
          <rect x="0" y="7" width="3" height="4" rx="0.6" fill="#000"/>
          <rect x="4.5" y="5" width="3" height="6" rx="0.6" fill="#000"/>
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.6" fill="#000"/>
          <rect x="13.5" y="0" width="3" height="11" rx="0.6" fill="#000"/>
        </svg>
        {/* wifi */}
        <svg width="15" height="11" viewBox="0 0 15 11">
          <path d="M7.5 3a8 8 0 016 2.5l1-1a9.5 9.5 0 00-14 0l1 1a8 8 0 016-2.5z" fill="#000"/>
          <path d="M7.5 6a5 5 0 013.6 1.5l1-1a6.5 6.5 0 00-9.2 0l1 1A5 5 0 017.5 6z" fill="#000"/>
          <circle cx="7.5" cy="9.5" r="1.4" fill="#000"/>
        </svg>
        {/* battery */}
        <svg width="25" height="11" viewBox="0 0 25 11">
          <rect x="0.5" y="0.5" width="22" height="10" rx="3" stroke="#000" strokeOpacity="0.4" fill="none"/>
          <rect x="2" y="2" width="19" height="7" rx="1.5" fill="#000"/>
          <path d="M23.5 4v3c.6-.2 1-.7 1-1.5s-.4-1.3-1-1.5z" fill="#000" fillOpacity="0.4"/>
        </svg>
      </div>
    </div>
  );
}

function MWUrlBar({ url = 'seald.nromomentum.com/document/new' }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8,
      padding:'8px 14px 10px', borderBottom:'0.5px solid rgba(0,0,0,0.10)',
      background:'rgba(247,247,247,0.92)',
      backdropFilter:'blur(20px) saturate(180%)',
      WebkitBackdropFilter:'blur(20px) saturate(180%)',
      position:'relative', zIndex:18,
    }}>
      <button aria-label="Tabs" style={mwBtnIcon()}>
        <Icon name="square-stack" size={18} style={{color:'#1F2937'}}/>
      </button>
      <div style={{
        flex:1, height:36, borderRadius:12, background:'rgba(0,0,0,0.06)',
        display:'flex', alignItems:'center', gap:6, padding:'0 12px',
        fontFamily:'-apple-system, system-ui',
        fontSize:14, color:'#1F2937', minWidth:0,
      }}>
        <Icon name="lock" size={12} style={{color:'#10B981', flexShrink:0}}/>
        <span style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{url}</span>
      </div>
      <button aria-label="Reload" style={mwBtnIcon()}>
        <Icon name="rotate-cw" size={16} style={{color:'#1F2937'}}/>
      </button>
    </div>
  );
}

function mwBtnIcon(){
  return {
    width:36, height:36, border:'none', background:'transparent',
    borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center',
    cursor:'pointer',
  };
}

function MobileWebDevice({ children, url, stickyBottom }) {
  return (
    <div style={{
      width: MW_DEVICE_W, height: MW_DEVICE_H,
      borderRadius: MW_RADIUS, overflow:'hidden', position:'relative',
      background:'#fff',
      boxShadow:'0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily:'-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing:'antialiased',
    }}>
      {/* dynamic island */}
      <div style={{
        position:'absolute', top:11, left:'50%', transform:'translateX(-50%)',
        width:126, height:37, borderRadius:24, background:'#000', zIndex:50,
      }}/>
      {/* status bar (above URL bar) */}
      <div style={{ position:'relative', zIndex:25, paddingTop:34 }}>
        <MWStatusBar/>
        <MWUrlBar url={url}/>
      </div>
      {/* page content */}
      <div style={{
        position:'absolute', top:34+24+8+10+44, left:0, right:0, bottom:0,
        overflow:'auto', background:'#fff',
      }}>
        <div style={{ minHeight:'100%', paddingBottom: stickyBottom ? 120 : 40 }}>
          {children}
        </div>
      </div>
      {/* sticky bottom bar */}
      {stickyBottom && (
        <div style={{
          position:'absolute', left:0, right:0, bottom:0, zIndex:40,
          padding:'10px 16px 28px',
          background:'rgba(255,255,255,0.96)',
          backdropFilter:'blur(20px) saturate(180%)',
          WebkitBackdropFilter:'blur(20px) saturate(180%)',
          borderTop:'0.5px solid rgba(0,0,0,0.08)',
        }}>
          {stickyBottom}
        </div>
      )}
      {/* home indicator */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0, zIndex:60,
        height:34, display:'flex', justifyContent:'center', alignItems:'flex-end',
        paddingBottom:8, pointerEvents:'none',
      }}>
        <div style={{ width:139, height:5, borderRadius:100, background:'rgba(0,0,0,0.32)' }}/>
      </div>
    </div>
  );
}

/* ---------- MWStep — slim stepper inside page content ---------- */
function MWStep({ step, total = 6, onBack, label }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12,
      padding:'14px 16px 8px',
    }}>
      {onBack && (
        <button onClick={onBack} aria-label="Back" style={{
          width:36, height:36, borderRadius:10, border:'none',
          background:'var(--ink-100)', display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer',
        }}>
          <Icon name="chevron-left" size={20} style={{color:'var(--fg-1)'}}/>
        </button>
      )}
      <div style={{ flex:1 }}>
        <div style={{
          fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-3)',
          textTransform:'uppercase', letterSpacing:'0.08em',
        }}>
          Step {step} of {total}
        </div>
        <div style={{
          fontFamily:'var(--font-sans)', fontSize:14, fontWeight:600, color:'var(--fg-1)',
          marginTop:2,
        }}>
          {label}
        </div>
      </div>
      {/* progress dots */}
      <div style={{ display:'flex', gap:4 }}>
        {Array.from({length: total}).map((_,i)=>(
          <div key={i} style={{
            width: i+1===step ? 16 : 6, height:6, borderRadius:3,
            background: i+1<=step ? 'var(--indigo-600)' : 'var(--ink-200)',
            transition:'width .2s ease',
          }}/>
        ))}
      </div>
    </div>
  );
}

/* ---------- MWStickyBar — wrapper for the bottom CTA slot ---------- */
function MWStickyBar({ children }) {
  return <div style={{ display:'flex', gap:8 }}>{children}</div>;
}

/* ---------- MWBottomSheet ---------- */
function MWBottomSheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:55,
      background:'rgba(11,18,32,0.45)',
      display:'flex', alignItems:'flex-end',
    }} onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        background:'#fff', width:'100%',
        borderTopLeftRadius:24, borderTopRightRadius:24,
        padding:'10px 16px 28px',
        boxShadow:'0 -10px 40px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          width:36, height:5, borderRadius:3, background:'var(--ink-200)',
          margin:'4px auto 12px',
        }}/>
        {title && (
          <div style={{
            fontFamily:'var(--font-serif)', fontSize:20, fontWeight:500,
            color:'var(--fg-1)', letterSpacing:'-0.01em', marginBottom:14,
          }}>{title}</div>
        )}
        {children}
      </div>
    </div>
  );
}

Object.assign(window, { MobileWebDevice, MWStep, MWStickyBar, MWBottomSheet });
