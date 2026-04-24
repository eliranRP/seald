/* @jsx React.createElement */
const { useState, useEffect, useRef } = React;

/* Builds a linear event timeline from an envelope's signer states + metadata.
   Events: created -> sent -> (per-signer viewed -> signed / declined) -> completed */
function buildEvents(doc){
  const events = [];
  events.push({ kind:'created', at:'Apr 17 · 09:14 AM', by:'You', text:'Envelope created from PDF upload', icon:'file-plus', tone:'indigo' });
  events.push({ kind:'prepared', at:'Apr 17 · 09:22 AM', by:'You', text:`Placed ${doc.signers.length} signer${doc.signers.length>1?'s':''} and ${3+doc.signers.length} fields`, icon:'pencil-ruler', tone:'indigo' });
  events.push({ kind:'sent', at:doc.signers[0].at ? doc.signers[0].at.replace(/ · .+/,' · 10:42 AM') : 'Apr 18 · 10:42 AM', by:'You', text:`Sent to ${doc.signers.length} signer${doc.signers.length>1?'s':''}`, icon:'send', tone:'indigo' });

  doc.signers.forEach(s=>{
    if (s.status==='signed') {
      events.push({ kind:'viewed', at:s.at?.replace(/\d{2}:\d{2}/, (m)=>{
        const [h,min] = m.split(':').map(Number); const nh=Math.max(0,h-1); return `${String(nh).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
      }) || 'Apr 18 · 11:00 AM', by:s.name, text:'Opened the envelope', icon:'eye', tone:'slate' });
      events.push({ kind:'signed', at:s.at, by:s.name, text:'Signed the document', icon:'pen-tool', tone:'success' });
    } else if (s.status==='declined') {
      events.push({ kind:'declined', at:s.at, by:s.name, text:'Declined to sign — "Terms on page 3 need renegotiation"', icon:'x-circle', tone:'danger' });
    } else if (s.status==='pending') {
      events.push({ kind:'pending', at:null, by:s.name, text:'Waiting on signature', icon:'clock', tone:'amber' });
    } else if (s.status==='awaiting-you') {
      events.push({ kind:'pending', at:null, by:s.name, text:'Waiting on your signature', icon:'clock', tone:'indigo' });
    }
  });

  if (doc.status==='emerald') {
    const last = doc.signers.filter(s=>s.at).pop();
    events.push({ kind:'completed', at:last?.at||'Apr 14 · 02:44 PM', by:'System', text:'Envelope sealed — audit trail locked', icon:'shield-check', tone:'success' });
  }
  return events;
}

const TONE = {
  indigo:  { dot:'var(--indigo-600)', ring:'rgba(79,70,229,.18)', bg:'#EEF2FF', fg:'#3730A3' },
  success: { dot:'var(--success-500)', ring:'rgba(16,185,129,.2)', bg:'#ECFDF5', fg:'#047857' },
  amber:   { dot:'var(--warn-500)', ring:'rgba(245,158,11,.22)', bg:'#FFFBEB', fg:'#B45309' },
  danger:  { dot:'var(--danger-500)', ring:'rgba(239,68,68,.22)', bg:'#FEF2F2', fg:'#B91C1C' },
  slate:   { dot:'var(--fg-4)', ring:'rgba(100,116,139,.18)', bg:'var(--ink-100)', fg:'var(--fg-3)' },
};

function EnvelopeDetail({ doc, onBack }){
  const events = buildEvents(doc);
  const [visible, setVisible] = useState(0);
  const timer = useRef(null);

  // Staggered entry animation
  useEffect(()=>{
    setVisible(0);
    let i = 0;
    const tick = () => {
      i++;
      setVisible(i);
      if (i < events.length) timer.current = setTimeout(tick, 180);
    };
    timer.current = setTimeout(tick, 250);
    return ()=> clearTimeout(timer.current);
  }, [doc.id]);

  const signed = doc.signers.filter(s=>s.status==='signed').length;
  const pct = Math.round((signed / doc.signers.length) * 100);

  return (
    <div data-screen-label={`Envelope — ${doc.id}`} style={{fontFamily:'var(--font-sans)'}}>
      <TopNav/>
      <div style={{maxWidth:1240, margin:'0 auto', padding:'32px 48px 80px'}}>
        {/* Breadcrumb */}
        <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--fg-3)',marginBottom:18}}>
          <span onClick={onBack} style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6,color:'var(--fg-2)'}}>
            <Icon name="arrow-left" size={14}/> Documents
          </span>
          <span>/</span>
          <span style={{fontFamily:'var(--font-mono)',color:'var(--fg-2)'}}>{doc.id}</span>
        </div>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:24,marginBottom:30}}>
          <div style={{minWidth:0, flex:1}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase',marginBottom:6}}>Envelope</div>
            <h1 style={{fontFamily:'var(--font-serif)',fontSize:42,fontWeight:500,letterSpacing:'-0.02em',color:'var(--fg-1)',margin:'0 0 10px',lineHeight:1.15}}>{doc.t}</h1>
            <div style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap',fontSize:13,color:'var(--fg-3)'}}>
              <Badge tone={doc.status}>{doc.statusLabel}</Badge>
              <span><span style={{fontFamily:'var(--font-mono)'}}>{doc.id}</span> · 4 pages</span>
              <span>Sent {doc.date}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:10, flexShrink:0}}>
            <Button variant="secondary" icon="download">Download PDF</Button>
            <Button variant="secondary" icon="bell">Send reminder</Button>
            {doc.status!=='emerald' && <Button variant="secondary" icon="x">Withdraw</Button>}
          </div>
        </div>

        {/* Progress banner */}
        <div style={{background:'#fff',border:'1px solid var(--border-1)',borderRadius:16,padding:'22px 26px',marginBottom:28,display:'flex',gap:28,alignItems:'center'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,color:'var(--fg-3)',fontWeight:600,marginBottom:6}}>
              {signed} of {doc.signers.length} signed — {pct}% complete
            </div>
            <div style={{height:8,borderRadius:999,background:'var(--ink-100)',overflow:'hidden',position:'relative'}}>
              <div style={{
                height:'100%',
                width: `${pct}%`,
                background: doc.status==='emerald' ? 'var(--success-500)' : doc.status==='red' ? 'var(--danger-500)' : 'var(--indigo-600)',
                borderRadius:999,
                transition:'width 900ms cubic-bezier(.2,.8,.2,1)',
              }}/>
            </div>
          </div>
          <div style={{display:'flex',gap:24,fontSize:12,color:'var(--fg-3)'}}>
            <div><div style={{fontFamily:'var(--font-serif)',fontSize:24,fontWeight:500,color:'var(--fg-1)'}}>{signed}</div>Signed</div>
            <div><div style={{fontFamily:'var(--font-serif)',fontSize:24,fontWeight:500,color:'var(--warn-500)'}}>{doc.signers.filter(s=>s.status==='pending'||s.status==='awaiting-you').length}</div>Waiting</div>
            <div><div style={{fontFamily:'var(--font-serif)',fontSize:24,fontWeight:500,color:'var(--fg-2)'}}>{events.length}</div>Events</div>
          </div>
        </div>

        {/* Two-column: timeline + sidebar */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:28,alignItems:'flex-start'}}>
          {/* Timeline */}
          <div style={{background:'#fff',border:'1px solid var(--border-1)',borderRadius:16,padding:'28px 30px 16px'}}>
            <div style={{fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,color:'var(--fg-1)',marginBottom:4}}>Activity timeline</div>
            <div style={{fontSize:13,color:'var(--fg-3)',marginBottom:24}}>Every event on this envelope — cryptographically sealed in the audit trail.</div>

            <div style={{position:'relative',paddingLeft:8}}>
              {/* Vertical rail */}
              <div style={{
                position:'absolute',left:15,top:10,bottom:10,width:2,
                background:'linear-gradient(to bottom, var(--ink-200), var(--ink-200) 40%, var(--border-1) 100%)',
              }}/>
              {/* Animated progress trace */}
              <div style={{
                position:'absolute',left:15,top:10,width:2,
                background:'var(--indigo-600)',
                height: `calc(${Math.min(visible, events.length)} / ${events.length} * (100% - 20px))`,
                transition:'height 700ms cubic-bezier(.2,.8,.2,1)',
                boxShadow:'0 0 12px rgba(79,70,229,.35)',
              }}/>

              {events.map((e,i)=>{
                const t = TONE[e.tone];
                const shown = i < visible;
                const isPending = e.kind==='pending';
                return (
                  <div key={i} style={{
                    display:'flex',gap:18,padding:'10px 0 18px',position:'relative',
                    opacity: shown ? 1 : 0,
                    transform: shown ? 'translateY(0)' : 'translateY(8px)',
                    transition:'opacity 350ms ease, transform 350ms cubic-bezier(.2,.8,.2,1)',
                  }}>
                    <div style={{flexShrink:0,position:'relative',zIndex:2}}>
                      <div style={{
                        width:32,height:32,borderRadius:999,background:'#fff',
                        border:`2px solid ${t.dot}`,
                        display:'flex',alignItems:'center',justifyContent:'center',
                        boxShadow: shown ? `0 0 0 4px ${t.ring}` : 'none',
                        transition:'box-shadow 500ms ease',
                        animation: isPending ? 'sealed-pulse 2s ease-in-out infinite' : 'none',
                      }}>
                        <Icon name={e.icon} size={14} style={{color:t.dot}}/>
                      </div>
                    </div>
                    <div style={{flex:1,minWidth:0,paddingTop:4}}>
                      <div style={{display:'flex',gap:10,alignItems:'baseline',flexWrap:'wrap'}}>
                        <div style={{fontSize:14,fontWeight:600,color:'var(--fg-1)'}}>{e.text}</div>
                        <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:999,background:t.bg,color:t.fg}}>
                          {e.kind}
                        </span>
                      </div>
                      <div style={{fontSize:12,color:'var(--fg-3)',marginTop:4,display:'flex',gap:10,alignItems:'center'}}>
                        <span style={{fontWeight:500,color:'var(--fg-2)'}}>{e.by}</span>
                        {e.at && <><span>·</span><span style={{fontFamily:'var(--font-mono)'}}>{e.at}</span></>}
                        {!e.at && <><span>·</span><span style={{fontStyle:'italic'}}>in progress</span></>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar: signers */}
          <div style={{display:'flex',flexDirection:'column',gap:18,position:'sticky',top:80}}>
            <div style={{background:'#fff',border:'1px solid var(--border-1)',borderRadius:16,padding:'20px 22px'}}>
              <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase',marginBottom:14}}>Signers</div>
              {doc.signers.map((s,i)=>{
                const statusKey = s.status;
                const theme = {
                  signed:       { dot:'var(--success-500)', label:'Signed', fg:'#047857' },
                  pending:      { dot:'var(--warn-500)',    label:'Waiting', fg:'#B45309' },
                  'awaiting-you':{dot:'var(--indigo-600)',  label:'Your turn', fg:'#3730A3' },
                  declined:     { dot:'var(--danger-500)',  label:'Declined', fg:'#B91C1C' },
                  draft:        { dot:'var(--fg-4)',        label:'Not sent', fg:'var(--fg-3)' },
                }[statusKey];
                return (
                  <div key={s.email} style={{display:'flex',gap:12,alignItems:'center',padding:'10px 0',borderBottom: i<doc.signers.length-1?'1px solid var(--border-1)':'none'}}>
                    <div style={{width:36,height:36,borderRadius:999,background:'var(--indigo-600)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,opacity: s.status==='pending'?0.5:1,position:'relative'}}>
                      {s.name.split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase()}
                      <span style={{position:'absolute',bottom:-2,right:-2,width:12,height:12,borderRadius:999,background:theme.dot,border:'2px solid #fff'}}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--fg-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.name}</div>
                      <div style={{fontSize:11,color:'var(--fg-3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.email}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:theme.fg}}>{theme.label}</div>
                      {s.at && <div style={{fontSize:10,color:'var(--fg-4)',fontFamily:'var(--font-mono)',marginTop:2}}>{s.at.split(' · ')[0]}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{background:'var(--ink-50)',border:'1px solid var(--border-1)',borderRadius:16,padding:'18px 20px'}}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                <Icon name="shield-check" size={18} style={{color:'var(--indigo-600)',marginTop:2,flexShrink:0}}/>
                <div style={{fontSize:12,color:'var(--fg-2)',lineHeight:1.55}}>
                  <b style={{color:'var(--fg-1)'}}>Audit trail</b> — this envelope uses eIDAS-qualified signatures. Every event is timestamped and cryptographically sealed.
                  <a href="#" style={{display:'inline-flex',alignItems:'center',gap:4,color:'var(--indigo-600)',fontWeight:600,marginTop:8,textDecoration:'none',fontSize:12}}>View full audit trail <Icon name="arrow-right" size={12}/></a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sealed-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(245,158,11,.18); }
          50%      { box-shadow: 0 0 0 10px rgba(245,158,11,0); }
        }
      `}</style>
    </div>
  );
}

Object.assign(window, { EnvelopeDetail });
