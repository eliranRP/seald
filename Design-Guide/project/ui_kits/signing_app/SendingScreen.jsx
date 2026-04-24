/* @jsx React.createElement */
/* Sealed — SendingScreen: animated loader after "Send to Sign"
   Walks the user through the 5-step pipeline:
   1. Finalize — flatten fields into the PDF
   2. Encrypt — hash + seal with envelope key
   3. Anchor — write to audit chain
   4. Prepare emails — per-signer unique links
   5. Deliver — hand off to mail servers
*/

const { useState, useEffect, useRef } = React;

const STEPS = [
  { key:'finalize', icon:'file-text',    label:'Finalizing document',        detail:'Flattening fields into the PDF',           dur:1100 },
  { key:'encrypt',  icon:'lock',          label:'Encrypting envelope',        detail:'Hashing pages and sealing with AES-256',   dur:1400 },
  { key:'anchor',   icon:'shield-check',  label:'Anchoring audit trail',      detail:'Writing cryptographic proof to the log',   dur:1200 },
  { key:'prepare',  icon:'mail',          label:'Preparing signer invites',   detail:'Generating unique signing links per signer', dur:1100 },
  { key:'deliver',  icon:'send',          label:'Delivering to signers',      detail:'Handing off to the mail pipeline',         dur:1400 },
];

// Deterministic-ish id for nice display
function randomHash(len=12){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i=0; i<len; i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function SendingScreen({ signers=[], fieldCount=1, onDone, onCancel }){
  const [stepIdx, setStepIdx] = useState(0);
  const [stepProgress, setStepProgress] = useState(0); // 0..1 within current step
  const [done, setDone] = useState(false);
  const [envelopeId] = useState(() => `DOC-${randomHash(4)}-${randomHash(4)}`);
  const [hash] = useState(() => randomHash(32).toLowerCase());
  const rafRef = useRef(null);

  // Signer list fallback (for standalone preview)
  const ss = signers.length ? signers : [
    { name:'Maya Raskin',  email:'maya@northwind.co', color:'var(--indigo-600)' },
    { name:'Jonah Park',   email:'jonah@quill.vc',   color:'var(--warn-500)' },
  ];

  // Drive the animated progress
  useEffect(()=>{
    let cancelled = false;
    let start = null;
    const run = (ts) => {
      if (cancelled) return;
      if (!start) start = ts;
      const step = STEPS[stepIdx];
      const t = Math.min(1, (ts - start) / step.dur);
      setStepProgress(t);
      if (t >= 1) {
        if (stepIdx < STEPS.length - 1) {
          setStepIdx(i => i + 1);
        } else {
          setDone(true);
          // brief hold then auto-advance
          setTimeout(()=> onDone && onDone(), 1200);
        }
      } else {
        rafRef.current = requestAnimationFrame(run);
      }
    };
    rafRef.current = requestAnimationFrame(run);
    return ()=> { cancelled = true; cancelAnimationFrame(rafRef.current); };
  }, [stepIdx]);

  // Overall progress across all steps
  const overall = done
    ? 1
    : (stepIdx + stepProgress) / STEPS.length;
  const pct = Math.round(overall * 100);

  return (
    <div data-screen-label="Send — Generating envelope" style={{
      minHeight:'calc(100vh - 56px)',
      background:'radial-gradient(1200px 600px at 50% -10%, #EEF2FF 0%, var(--ink-50) 55%)',
      padding:'60px 24px 120px',
      display:'flex',justifyContent:'center',
      fontFamily:'var(--font-sans)',
    }}>
      <div style={{width:'100%',maxWidth:960}}>

        {/* Kicker */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:600,letterSpacing:'0.1em',color:'var(--indigo-600)',textTransform:'uppercase',marginBottom:10}}>
            {done ? 'Delivered' : 'Sealing your envelope'}
          </div>
          <h1 style={{fontFamily:'var(--font-serif)',fontSize:42,fontWeight:500,letterSpacing:'-0.02em',color:'var(--fg-1)',margin:'0 0 10px',lineHeight:1.15}}>
            {done
              ? <>Sent. Your envelope is on its way.</>
              : <>Generating and sending your document…</>}
          </h1>
          <div style={{fontSize:14,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>
            {envelopeId} · {fieldCount} field{fieldCount===1?'':'s'} · {ss.length} signer{ss.length===1?'':'s'}
          </div>
        </div>

        <div style={{
          display:'grid',gridTemplateColumns:'1.1fr 1fr',gap:28,alignItems:'stretch',
        }}>
          {/* LEFT — Step list + overall bar */}
          <div style={{background:'#fff',border:'1px solid var(--border-1)',borderRadius:20,padding:'28px 30px',boxShadow:'0 1px 0 rgba(11,18,32,.02), 0 20px 40px -20px rgba(11,18,32,.10)'}}>

            {/* Overall progress bar */}
            <div style={{marginBottom:26}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:600,color:'var(--fg-3)',letterSpacing:'0.06em',textTransform:'uppercase'}}>Overall</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color: done?'var(--success-600)':'var(--indigo-600)'}}>{pct}%</div>
              </div>
              <div style={{height:6,borderRadius:999,background:'var(--ink-100)',overflow:'hidden',position:'relative'}}>
                <div style={{
                  position:'absolute',inset:0,width:`${pct}%`,
                  background: done
                    ? 'linear-gradient(90deg, var(--success-500), var(--success-600))'
                    : 'linear-gradient(90deg, var(--indigo-500), var(--indigo-600))',
                  borderRadius:999,transition:'width 120ms linear',
                }}/>
                {/* animated shine */}
                {!done && (
                  <div style={{
                    position:'absolute',top:0,bottom:0,width:40,
                    left:`calc(${pct}% - 40px)`,
                    background:'linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent)',
                    animation:'sealed-shine 1.6s linear infinite',
                  }}/>
                )}
              </div>
            </div>

            {/* Steps */}
            {STEPS.map((s, i) => {
              const state =
                i < stepIdx || done ? 'done' :
                i === stepIdx ? 'active' :
                'pending';
              const iconColor =
                state==='done' ? 'var(--success-500)' :
                state==='active' ? 'var(--indigo-600)' :
                'var(--fg-4)';
              return (
                <div key={s.key} style={{
                  display:'flex',gap:16,alignItems:'flex-start',
                  padding:'12px 0',
                  borderBottom: i < STEPS.length - 1 ? '1px dashed var(--border-1)' : 'none',
                  opacity: state==='pending' ? 0.55 : 1,
                  transition:'opacity 220ms ease',
                }}>
                  {/* Node */}
                  <div style={{
                    width:34,height:34,borderRadius:999,flexShrink:0,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    background: state==='done' ? '#ECFDF5' : state==='active' ? '#EEF2FF' : 'var(--ink-50)',
                    border: `1.5px solid ${state==='done'?'var(--success-500)':state==='active'?'var(--indigo-600)':'var(--border-1)'}`,
                    position:'relative',
                  }}>
                    {state==='active' && (
                      <span style={{
                        position:'absolute',inset:-4,borderRadius:999,
                        border:'2px solid var(--indigo-600)',opacity:.25,
                        animation:'sealed-pulse-ring 1.4s ease-out infinite',
                      }}/>
                    )}
                    <Icon name={state==='done' ? 'check' : s.icon} size={16} style={{color: iconColor}}/>
                  </div>

                  <div style={{flex:1,minWidth:0,paddingTop:4}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
                      <div style={{fontSize:14,fontWeight:600,color:'var(--fg-1)'}}>{s.label}</div>
                      {state==='active' && (
                        <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--indigo-600)',fontWeight:600}}>
                          {Math.round(stepProgress * 100)}%
                        </div>
                      )}
                      {state==='done' && (
                        <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--success-600)',fontWeight:600}}>
                          done
                        </div>
                      )}
                    </div>
                    <div style={{fontSize:12,color:'var(--fg-3)',marginTop:2}}>{s.detail}</div>

                    {/* Inline thin bar when active */}
                    {state==='active' && (
                      <div style={{marginTop:10,height:3,borderRadius:999,background:'var(--ink-100)',overflow:'hidden'}}>
                        <div style={{
                          height:'100%',width:`${Math.round(stepProgress*100)}%`,
                          background:'var(--indigo-600)',borderRadius:999,
                          transition:'width 80ms linear',
                        }}/>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Footer action */}
            <div style={{marginTop:18,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
              <div style={{fontSize:11,color:'var(--fg-4)',fontFamily:'var(--font-mono)'}}>
                sha256 · {hash.slice(0,10)}…
              </div>
              {!done ? (
                <button onClick={onCancel} style={{
                  background:'transparent',border:'1px solid var(--border-1)',borderRadius:10,
                  padding:'8px 14px',fontSize:13,fontWeight:600,color:'var(--fg-3)',cursor:'pointer',
                }}>Cancel</button>
              ) : (
                <button onClick={onDone} style={{
                  background:'var(--indigo-600)',border:'none',borderRadius:10,color:'#fff',
                  padding:'10px 16px',fontSize:13,fontWeight:700,cursor:'pointer',
                  display:'inline-flex',alignItems:'center',gap:8,
                }}>
                  View envelope <Icon name="arrow-right" size={14}/>
                </button>
              )}
            </div>
          </div>

          {/* RIGHT — Animated preview: document → envelope → signers */}
          <div style={{background:'#fff',border:'1px solid var(--border-1)',borderRadius:20,padding:'28px 30px',
                       display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                       boxShadow:'0 1px 0 rgba(11,18,32,.02), 0 20px 40px -20px rgba(11,18,32,.10)',
                       position:'relative', overflow:'hidden', minHeight:420}}>

            {/* background beams */}
            <div aria-hidden style={{
              position:'absolute',inset:-40,pointerEvents:'none',opacity:.5,
              background:'radial-gradient(400px 160px at 50% 50%, rgba(79,70,229,.08), transparent 70%)',
            }}/>

            {/* Stage: PDF page turning into sealed envelope, then flying out to signer avatars */}
            <div style={{position:'relative',width:240,height:280}}>
              {/* The PDF page */}
              <div style={{
                position:'absolute',left:'50%',top:0,transform:'translateX(-50%)',
                width:120,height:156,borderRadius:6,background:'#fff',
                border:'1px solid var(--border-1)',
                boxShadow:'0 8px 24px rgba(11,18,32,.08), 0 2px 0 rgba(11,18,32,.04)',
                padding:'14px 12px',boxSizing:'border-box',
                transition:'transform 600ms cubic-bezier(.2,.8,.2,1), opacity 400ms',
                transform: stepIdx >= 1
                  ? 'translate(-50%, 36px) scale(.8) rotate(-3deg)'
                  : 'translate(-50%, 0)',
                opacity: stepIdx >= 3 ? 0 : 1,
                zIndex:2,
              }}>
                <div style={{height:2,background:'var(--ink-200)',marginBottom:5,width:'70%'}}/>
                <div style={{height:2,background:'var(--ink-100)',marginBottom:5,width:'90%'}}/>
                <div style={{height:2,background:'var(--ink-100)',marginBottom:5,width:'82%'}}/>
                <div style={{height:2,background:'var(--ink-100)',marginBottom:5,width:'76%'}}/>
                <div style={{height:2,background:'var(--ink-100)',marginBottom:5,width:'60%'}}/>
                {/* signature field */}
                <div style={{marginTop:18,height:16,border:`1.5px dashed var(--indigo-500)`,borderRadius:3,background:'rgba(79,70,229,.06)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-script)',color:'var(--indigo-600)',fontSize:10}}>sign</div>
                <div style={{marginTop:10,height:2,background:'var(--ink-100)',width:'85%'}}/>
                <div style={{marginTop:5,height:2,background:'var(--ink-100)',width:'70%'}}/>

                {/* Scan line animated while finalizing */}
                {stepIdx === 0 && !done && (
                  <div style={{
                    position:'absolute',left:8,right:8,height:2,borderRadius:1,
                    background:'linear-gradient(90deg, transparent, var(--indigo-600), transparent)',
                    boxShadow:'0 0 10px rgba(79,70,229,.7)',
                    animation:'sealed-scan 1.1s ease-in-out infinite',
                  }}/>
                )}
              </div>

              {/* The sealed envelope (appears from step 2 onward) */}
              <div style={{
                position:'absolute',left:'50%',top:40,transform:'translateX(-50%)',
                width:160,height:110,
                transition:'all 700ms cubic-bezier(.2,.8,.2,1)',
                opacity: stepIdx >= 1 ? 1 : 0,
                transform: stepIdx >= 1
                  ? (stepIdx >= 4
                      ? 'translate(-50%, 160px) scale(.6)'
                      : 'translate(-50%, 28px) scale(1)')
                  : 'translate(-50%, 0) scale(.9)',
                zIndex:3,
              }}>
                <svg viewBox="0 0 160 110" width="160" height="110" style={{overflow:'visible'}}>
                  <defs>
                    <linearGradient id="envBody" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#F8FAFC"/>
                      <stop offset="1" stopColor="#EEF2FF"/>
                    </linearGradient>
                    <linearGradient id="envFlap" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#FFFFFF"/>
                      <stop offset="1" stopColor="#E0E7FF"/>
                    </linearGradient>
                  </defs>
                  {/* Body */}
                  <rect x="8" y="18" width="144" height="84" rx="8" fill="url(#envBody)" stroke="#C7D2FE"/>
                  {/* Flap */}
                  <path d="M8 26 L80 70 L152 26" fill="none" stroke="#A5B4FC" strokeWidth="1.2"/>
                  {/* Back flap (folded) */}
                  <path d="M8 26 L80 2 L152 26 L152 34 L80 12 L8 34 Z" fill="url(#envFlap)" stroke="#C7D2FE"/>

                  {/* Wax seal */}
                  <g style={{
                    transformOrigin:'80px 70px',
                    transform: stepIdx >= 2 ? 'scale(1)' : 'scale(0)',
                    transition:'transform 500ms cubic-bezier(.5,1.8,.5,1)',
                  }}>
                    <circle cx="80" cy="70" r="18" fill="var(--indigo-600)"/>
                    <circle cx="80" cy="70" r="18" fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="2 3" opacity=".6"/>
                    <path d="M72 68 C 74 67, 76 65, 78 64 L 84 58 L 86 60 L 80 66 C 79 69, 76 72, 73 73 Z" fill="#fff"/>
                  </g>

                  {/* Encrypt shimmer (step 1) */}
                  {stepIdx === 1 && !done && (
                    <rect x="8" y="18" width="144" height="84" rx="8" fill="url(#shimmerGrad)" opacity=".6">
                      <animate attributeName="opacity" values="0;.8;0" dur="1.4s" repeatCount="indefinite"/>
                    </rect>
                  )}
                  <defs>
                    <linearGradient id="shimmerGrad" x1="0" x2="1">
                      <stop offset="0" stopColor="#4F46E5" stopOpacity="0"/>
                      <stop offset=".5" stopColor="#4F46E5" stopOpacity=".2"/>
                      <stop offset="1" stopColor="#4F46E5" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                </svg>

                {/* Audit chip (step 2+) */}
                <div style={{
                  position:'absolute',bottom:-12,left:'50%',transform:'translateX(-50%)',
                  padding:'4px 10px',borderRadius:999,background:'var(--fg-1)',color:'#fff',
                  fontFamily:'var(--font-mono)',fontSize:10,fontWeight:600,
                  opacity: stepIdx >= 2 ? 1 : 0,
                  transition:'opacity 400ms',
                  whiteSpace:'nowrap',
                }}>
                  anchor · {hash.slice(0,6)}
                </div>
              </div>

              {/* Signer avatars (receive the envelope in step 4) */}
              <div style={{position:'absolute',left:0,right:0,bottom:0,display:'flex',justifyContent:'space-around',alignItems:'flex-end',height:80}}>
                {ss.slice(0,3).map((s,i)=>{
                  const delivered = done || (stepIdx >= 4 && stepProgress > (i / ss.length));
                  return (
                    <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                      transform: delivered ? 'translateY(0)' : 'translateY(8px)',
                      opacity: stepIdx >= 3 ? 1 : 0.4,
                      transition:'transform 360ms cubic-bezier(.2,.8,.2,1), opacity 360ms',
                    }}>
                      <div style={{
                        width:38,height:38,borderRadius:999,background:'var(--indigo-600)',color:'#fff',
                        display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,
                        border:`2px solid ${delivered ? 'var(--success-500)' : 'var(--border-1)'}`,
                        boxShadow: delivered ? '0 0 0 4px rgba(16,185,129,.18)' : 'none',
                        transition:'box-shadow 280ms ease, border-color 280ms ease',
                        position:'relative',
                      }}>
                        {s.name.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}
                        {delivered && (
                          <span style={{
                            position:'absolute',right:-4,bottom:-4,width:16,height:16,borderRadius:999,
                            background:'var(--success-500)',border:'2px solid #fff',
                            display:'flex',alignItems:'center',justifyContent:'center',
                          }}>
                            <Icon name="check" size={9} style={{color:'#fff'}}/>
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:10,fontWeight:600,color:'var(--fg-2)'}}>{s.name.split(' ')[0]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status message */}
            <div style={{marginTop:'auto',textAlign:'center',paddingTop:20}}>
              <div style={{fontSize:13,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>
                {done ? 'All signer invites delivered' : STEPS[stepIdx].detail + '…'}
              </div>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes sealed-shine {
          0%   { transform: translateX(-40px); }
          100% { transform: translateX(40px); }
        }
        @keyframes sealed-pulse-ring {
          0%   { transform: scale(.9); opacity: .5; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes sealed-scan {
          0%   { top: 10px; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 140px; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

Object.assign(window, { SendingScreen });
