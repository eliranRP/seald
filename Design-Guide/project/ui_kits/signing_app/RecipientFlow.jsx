/* @jsx React.createElement */
/* Sealed — Recipient signing flow.
   Screens (state machine):
     'email'    — inbox preview of the request email (entry point)
     'prep'     — landing page after click: identity confirm + agreement
     'fill'     — multi-page doc with field-by-field guided filling
     'review'   — confirm everything is filled
     'done'     — thank-you / download
   The recipient does NOT need a Sealed account — supports unsigned users
   with a "Save a copy to Sealed" upsell after signing. */

function RecipientFlow({ stage = 'email', onStage, onExit }) {
  // Recipient identity (prefilled from the email link in real life)
  const [recipient] = useState({
    name: 'Maya Raskin',
    email: 'maya@northwind.co',
    sender: 'Eliran Azulay',
    senderEmail: 'eliran@azulay.co',
    company: 'Northwind Logistics',
    docTitle: 'Master Services Agreement',
    docId: 'DOC-8F3A-4291',
    pages: 4,
    expiresIn: '7 days',
  });

  // Field model — one of each type so the recipient sees the full vocabulary
  const FIELD_DEFS = [
    { id:'sig1',  page:1, type:'signature', x:60,  y:560, w:200, h:54, label:'Sign as Counterparty', required:true },
    { id:'init1', page:1, type:'initial',   x:280, y:560, w:80,  h:54, label:'Your initials', required:true },
    { id:'name1', page:1, type:'name',      x:60,  y:640, w:200, h:36, label:'Print name', required:true },
    { id:'date1', page:1, type:'date',      x:280, y:640, w:140, h:36, label:'Date', required:true },
    { id:'txt1',  page:2, type:'text',      x:60,  y:300, w:300, h:36, label:'Job title', required:true },
    { id:'chk1',  page:2, type:'checkbox',  x:60,  y:380, w:24,  h:24, label:'I have read the terms', required:true },
    { id:'chk2',  page:2, type:'checkbox',  x:60,  y:420, w:24,  h:24, label:'Subscribe to product updates', required:false },
    { id:'sig2',  page:4, type:'signature', x:60,  y:560, w:200, h:54, label:'Final signature', required:true },
  ];

  const [values, setValues] = useState({});
  const [activeField, setActiveField] = useState(null); // id
  const [agreed, setAgreed] = useState(false);

  const goto = (s) => onStage && onStage(s);

  const completedCount = FIELD_DEFS.filter(f => f.required && values[f.id]).length;
  const requiredCount  = FIELD_DEFS.filter(f => f.required).length;
  const allDone = completedCount === requiredCount;

  return (
    <div style={{minHeight:'100vh', background:'var(--ink-100)', fontFamily:'var(--font-sans)', color:'var(--fg-2)'}}>
      {stage === 'email'   && <EmailInboxView recipient={recipient} onOpen={()=>goto('prep')} onExit={onExit}/>}
      {stage === 'prep'    && <RecipientPrep recipient={recipient} agreed={agreed} setAgreed={setAgreed} onStart={()=>goto('fill')} onExit={onExit}/>}
      {stage === 'fill'    && <RecipientFiller recipient={recipient} fields={FIELD_DEFS} values={values} setValues={setValues} activeField={activeField} setActiveField={setActiveField} completedCount={completedCount} requiredCount={requiredCount} allDone={allDone} onReview={()=>goto('review')} onExit={onExit}/>}
      {stage === 'review'  && <RecipientReview recipient={recipient} fields={FIELD_DEFS} values={values} onBack={()=>goto('fill')} onSubmit={()=>goto('done')}/>}
      {stage === 'done'    && <RecipientDone recipient={recipient} onExit={onExit}/>}
    </div>
  );
}

/* ============================================================
   1. Email inbox view — what the request looks like
   ============================================================ */
function EmailInboxView({ recipient, onOpen, onExit }) {
  return (
    <div style={{maxWidth:780, margin:'0 auto', padding:'40px 24px 80px'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18}}>
        <div style={{display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--fg-3)'}}>
          <Icon name="inbox" size={14}/> Inbox · 3 unread
        </div>
        <button onClick={onExit} style={{background:'transparent', border:'1px solid var(--border-1)', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:600, color:'var(--fg-3)', cursor:'pointer'}}>Exit demo</button>
      </div>

      {/* Email card */}
      <div style={{background:'#fff', border:'1px solid var(--border-1)', borderRadius:18, overflow:'hidden', boxShadow:'var(--shadow-sm)'}}>
        <div style={{padding:'20px 24px', borderBottom:'1px solid var(--border-1)', display:'flex', alignItems:'center', gap:12}}>
          <div style={{width:36, height:36, borderRadius:999, background:'var(--ink-900)', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, fontFamily:'var(--font-serif)'}}>S</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, color:'var(--fg-2)'}}>
              <b style={{color:'var(--fg-1)'}}>Sealed</b> <span style={{color:'var(--fg-4)'}}>via sealed.app</span>
            </div>
            <div style={{fontSize:12, color:'var(--fg-3)', marginTop:2}}>to {recipient.email}</div>
          </div>
          <div style={{fontSize:12, color:'var(--fg-3)', fontFamily:'var(--font-mono)'}}>10:42 AM</div>
        </div>

        <div style={{padding:'28px 32px'}}>
          <div style={{fontFamily:'var(--font-serif)', fontSize:24, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.01em', lineHeight:1.25}}>
            {recipient.sender} requested your signature on <em style={{fontStyle:'italic'}}>{recipient.docTitle}</em>
          </div>

          <div style={{marginTop:18, padding:'16px 18px', background:'var(--ink-50)', border:'1px solid var(--border-1)', borderRadius:12, display:'flex', alignItems:'center', gap:14}}>
            <div style={{width:44, height:56, background:'#fff', border:'1px solid var(--border-1)', borderRadius:6, padding:6, flexShrink:0}}>
              {[...Array(5)].map((_,i)=>(<div key={i} style={{height:2, background:'var(--ink-200)', borderRadius:1, margin:'3px 0', width:`${85-i*8}%`}}/>))}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14, fontWeight:600, color:'var(--fg-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{recipient.docTitle}.pdf</div>
              <div style={{fontSize:12, color:'var(--fg-3)', fontFamily:'var(--font-mono)', marginTop:3}}>{recipient.docId} · {recipient.pages} pages · 482 KB</div>
            </div>
          </div>

          <div style={{marginTop:20, fontSize:14, color:'var(--fg-2)', lineHeight:1.65}}>
            Hi {recipient.name.split(' ')[0]},<br/><br/>
            Please review and sign the attached agreement. It should take about 2 minutes — there are 4 fields to fill on pages 1, 2, and 4.<br/><br/>
            Let me know if you have any questions.<br/><br/>
            Thanks,<br/>
            {recipient.sender}
          </div>

          <div style={{marginTop:28, display:'flex', alignItems:'center', gap:14}}>
            <button onClick={onOpen} style={{height:48, padding:'0 22px', border:'none', borderRadius:10, background:'var(--ink-900)', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8}}>
              <Icon name="pen-tool" size={16}/>
              Review & sign
            </button>
            <div style={{fontSize:12, color:'var(--fg-3)'}}>Expires in {recipient.expiresIn}</div>
          </div>

          <div style={{marginTop:28, paddingTop:18, borderTop:'1px solid var(--border-1)', fontSize:11, color:'var(--fg-4)', lineHeight:1.6, display:'flex', alignItems:'center', gap:8}}>
            <Icon name="shield-check" size={12}/>
            Sent securely through Sealed. Powered by eIDAS-qualified signatures with full audit trail.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   2. Recipient prep — landing after click
   ============================================================ */
function RecipientPrep({ recipient, agreed, setAgreed, onStart, onExit }) {
  return (
    <div>
      <RecipientHeader recipient={recipient} onExit={onExit} step="Identity"/>
      <div style={{maxWidth:560, margin:'0 auto', padding:'48px 24px 80px'}}>
        <div style={{display:'inline-flex', alignItems:'center', gap:8, padding:'4px 12px', borderRadius:999, background:'var(--indigo-50)', color:'var(--indigo-700)', fontSize:12, fontWeight:600, marginBottom:20}}>
          <Icon name="mail" size={12}/> Signature request from {recipient.sender}
        </div>
        <div style={{fontFamily:'var(--font-serif)', fontSize:40, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.1}}>
          You've been asked to sign <em style={{fontStyle:'italic'}}>{recipient.docTitle}</em>.
        </div>
        <div style={{fontSize:15, color:'var(--fg-3)', marginTop:14, lineHeight:1.6}}>
          Confirm your details below and we'll walk you through each field. No Sealed account needed.
        </div>

        <div style={{marginTop:32, background:'#fff', border:'1px solid var(--border-1)', borderRadius:16, padding:'24px 24px'}}>
          <div style={{fontSize:11, fontWeight:700, letterSpacing:'0.08em', color:'var(--fg-3)', textTransform:'uppercase', marginBottom:14}}>Signing as</div>
          <div style={{display:'flex', alignItems:'center', gap:14}}>
            <div style={{width:48, height:48, borderRadius:999, background:'#10B981', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700}}>
              {recipient.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:15, fontWeight:600, color:'var(--fg-1)'}}>{recipient.name}</div>
              <div style={{fontSize:13, color:'var(--fg-3)', marginTop:2}}>{recipient.email}</div>
            </div>
            <button style={{background:'transparent', border:'1px solid var(--border-1)', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:600, color:'var(--fg-2)', cursor:'pointer'}}>Not me?</button>
          </div>

          <div style={{marginTop:22, paddingTop:20, borderTop:'1px solid var(--border-1)'}}>
            <label style={{display:'flex', alignItems:'flex-start', gap:10, fontSize:13, color:'var(--fg-2)', cursor:'pointer', lineHeight:1.55}}>
              <span onClick={()=>setAgreed(!agreed)} style={{
                width:18, height:18, borderRadius:4, flexShrink:0,
                border:`1.5px solid ${agreed?'var(--ink-900)':'var(--border-2)'}`,
                background: agreed ? 'var(--ink-900)' : '#fff',
                display:'inline-flex', alignItems:'center', justifyContent:'center', marginTop:1,
              }}>
                {agreed && <Icon name="check" size={12} style={{color:'#fff'}}/>}
              </span>
              <span>
                I agree to use electronic signatures and to be bound by Sealed's{' '}
                <a href="#" onClick={e=>e.preventDefault()} style={{color:'var(--indigo-600)', fontWeight:600, textDecoration:'none'}}>Consumer Disclosure</a>.
              </span>
            </label>
          </div>
        </div>

        <button
          disabled={!agreed} onClick={onStart}
          style={{
            marginTop:24, width:'100%', height:52, border:'none', borderRadius:12,
            background: agreed ? 'var(--ink-900)' : 'var(--ink-300)',
            color:'#fff', fontSize:15, fontWeight:600, cursor: agreed?'pointer':'not-allowed',
            display:'inline-flex', alignItems:'center', justifyContent:'center', gap:10,
          }}
        >
          Start signing
          <Icon name="arrow-right" size={16}/>
        </button>

        <div style={{marginTop:18, textAlign:'center', fontSize:12, color:'var(--fg-3)'}}>
          Need to decline? <a href="#" onClick={e=>{e.preventDefault(); onExit && onExit();}} style={{color:'var(--fg-2)', fontWeight:600, textDecoration:'underline'}}>Decline this request</a>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   3. Filler — multi-page doc + guided field stepping
   ============================================================ */
function RecipientFiller({ recipient, fields, values, setValues, activeField, setActiveField, completedCount, requiredCount, allDone, onReview, onExit }) {
  const scrollRef = useRef(null);
  const [drawerField, setDrawerField] = useState(null); // open input drawer for a field

  const setVal = (id, v) => setValues(prev => ({...prev, [id]: v}));

  // Find next unfilled required field
  const nextField = fields.find(f => f.required && !values[f.id]);

  // Scroll & focus next field
  const goToField = (f) => {
    if (!f) return;
    setActiveField(f.id);
    const pageEl = scrollRef.current && scrollRef.current.querySelector(`[data-r-page="${f.page}"]`);
    if (pageEl) pageEl.scrollIntoView({behavior:'smooth', block:'start'});
    // Open drawer for input-style fields (not pure signature/checkbox)
    if (['text','name','date','signature','initial'].includes(f.type)) {
      setDrawerField(f);
    } else if (f.type === 'checkbox') {
      setVal(f.id, !values[f.id]);
    }
  };

  return (
    <div style={{display:'flex', flexDirection:'column', minHeight:'100vh'}}>
      <RecipientHeader recipient={recipient} onExit={onExit} step={`${completedCount} of ${requiredCount} fields`}/>

      {/* Action bar */}
      <div style={{background:'#fff', borderBottom:'1px solid var(--border-1)', padding:'12px 24px', display:'flex', alignItems:'center', gap:14, position:'sticky', top:60, zIndex:14}}>
        <div style={{flex:1, display:'flex', alignItems:'center', gap:12, maxWidth:560}}>
          <div style={{flex:1, height:6, borderRadius:999, background:'var(--ink-100)', overflow:'hidden'}}>
            <div style={{height:'100%', width:`${(completedCount/requiredCount)*100}%`, background: allDone?'var(--success-500)':'var(--indigo-600)', borderRadius:999, transition:'width 240ms var(--ease-standard), background 240ms'}}/>
          </div>
          <div style={{fontSize:12, color:'var(--fg-3)', fontFamily:'var(--font-mono)', whiteSpace:'nowrap'}}>{completedCount}/{requiredCount}</div>
        </div>
        <div style={{flex:1}}/>
        {!allDone && nextField && (
          <button onClick={()=>goToField(nextField)} style={{height:36, padding:'0 14px', border:'none', borderRadius:8, background:'var(--indigo-600)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8}}>
            <Icon name="arrow-down" size={14}/>
            Next: {fieldLabel(nextField)}
          </button>
        )}
        {allDone && (
          <button onClick={onReview} style={{height:36, padding:'0 16px', border:'none', borderRadius:8, background:'var(--success-500)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8}}>
            <Icon name="check" size={14}/>
            Review & finish
          </button>
        )}
      </div>

      {/* Pages stack */}
      <div ref={scrollRef} style={{flex:1, overflow:'auto', padding:'24px 0 80px', display:'flex', flexDirection:'column', alignItems:'center', gap:20}}>
        {Array.from({length: recipient.pages}, (_,i)=>i+1).map(p => (
          <RecipientPage
            key={p} pageNum={p} totalPages={recipient.pages}
            isLast={p === recipient.pages}
            fields={fields.filter(f=>f.page===p)}
            values={values}
            activeField={activeField}
            onFieldClick={(f)=>goToField(f)}
            onCheckboxToggle={(f)=>setVal(f.id, !values[f.id])}
          />
        ))}
      </div>

      {/* Field input drawer */}
      {drawerField && (
        <FieldInputDrawer
          field={drawerField}
          recipient={recipient}
          value={values[drawerField.id]}
          onChange={(v)=>setVal(drawerField.id, v)}
          onClose={()=>setDrawerField(null)}
          onConfirm={(v)=>{ setVal(drawerField.id, v); setDrawerField(null); }}
        />
      )}
    </div>
  );
}

function RecipientPage({ pageNum, totalPages, isLast, fields, values, activeField, onFieldClick, onCheckboxToggle }) {
  return (
    <div data-r-page={pageNum} style={{
      width:560, minHeight:740, background:'#fff', borderRadius:6,
      boxShadow:'var(--shadow-paper)', padding:'56px 64px', position:'relative',
    }}>
      <div style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:500, color:'var(--fg-1)'}}>Master Services Agreement</div>
      <div style={{fontSize:11, color:'var(--fg-3)', fontFamily:'var(--font-mono)', marginTop:4}}>Page {pageNum} of {totalPages}</div>
      <div style={{height:18}}/>
      {[...Array(isLast ? 8 : 14)].map((_,i)=>(<div key={i} style={{height:6, borderRadius:2, background:'var(--ink-150)', margin:'8px 0', width:`${70+((i+pageNum)*7)%30}%`}}/>))}

      {isLast && (
        <div style={{position:'absolute', left:64, right:64, top:540, display:'flex', flexDirection:'column', gap:28}}>
          <div style={{display:'flex', gap:12}}>
            <div style={{flex:1}}>
              <div style={{borderBottom:'1.5px solid var(--ink-300)', height:54}}/>
              <div style={{fontSize:10, fontFamily:'var(--font-mono)', color:'var(--fg-3)', marginTop:6, letterSpacing:'0.04em'}}>COUNTERPARTY SIGNATURE</div>
            </div>
            <div style={{flex:1}}>
              <div style={{borderBottom:'1.5px solid var(--ink-300)', height:54}}/>
              <div style={{fontSize:10, fontFamily:'var(--font-mono)', color:'var(--fg-3)', marginTop:6, letterSpacing:'0.04em'}}>DATE</div>
            </div>
          </div>
        </div>
      )}

      {/* Fields */}
      {fields.map(f => (
        <RecipientField
          key={f.id} field={f} value={values[f.id]} active={activeField===f.id}
          onClick={()=>{ if (f.type==='checkbox') onCheckboxToggle(f); else onFieldClick(f); }}
        />
      ))}
    </div>
  );
}

function RecipientField({ field: f, value, active, onClick }) {
  const filled = !!value;
  const isReq = f.required;

  // Color: filled=green, active=indigo, required-empty=amber, optional=gray
  const tone = filled ? 'success' : active ? 'indigo' : isReq ? 'amber' : 'neutral';
  const colors = {
    success: { bg:'rgba(16,185,129,0.10)', border:'var(--success-500)', text:'var(--success-700)' },
    indigo:  { bg:'rgba(99,102,241,0.12)', border:'var(--indigo-500)',  text:'var(--indigo-700)' },
    amber:   { bg:'rgba(245,158,11,0.10)', border:'#F59E0B',            text:'#92400E' },
    neutral: { bg:'rgba(148,163,184,0.10)',border:'var(--ink-400)',     text:'var(--fg-2)' },
  }[tone];

  // Render content based on type + filled state
  let inner = null;
  if (f.type === 'signature' && filled) {
    inner = <SignatureMark name={value} size={f.h - 18}/>;
  } else if (f.type === 'initial' && filled) {
    inner = <span style={{fontFamily:'var(--font-script, "Caveat", cursive)', fontSize:f.h - 18, color:'var(--fg-1)', fontWeight:500, lineHeight:1}}>{value}</span>;
  } else if (f.type === 'checkbox') {
    inner = (
      <span style={{
        width:18, height:18, borderRadius:4, border:`1.5px solid ${filled?'var(--success-500)':'var(--ink-400)'}`,
        background: filled ? 'var(--success-500)' : '#fff',
        display:'inline-flex', alignItems:'center', justifyContent:'center',
      }}>
        {filled && <Icon name="check" size={12} style={{color:'#fff'}}/>}
      </span>
    );
  } else if (filled) {
    inner = <span style={{fontSize:13, color:'var(--fg-1)', fontWeight:500, fontFamily:f.type==='date'?'var(--font-mono)':'var(--font-sans)'}}>{value}</span>;
  } else {
    inner = (
      <span style={{display:'inline-flex', alignItems:'center', gap:6, fontSize:11, fontWeight:600, color: colors.text, letterSpacing:'0.02em'}}>
        <Icon name={fieldIcon(f.type)} size={12}/>
        {f.label}
        {isReq && <span style={{color:'var(--danger-500)'}}>*</span>}
      </span>
    );
  }

  return (
    <div onClick={onClick} style={{
      position:'absolute', left:f.x, top:f.y, width:f.w, height:f.h,
      border:`1.5px ${filled?'solid':'dashed'} ${colors.border}`,
      background: colors.bg, borderRadius: f.type==='checkbox' ? 4 : 8,
      display:'inline-flex', alignItems:'center',
      justifyContent: f.type==='checkbox' ? 'center' : 'flex-start',
      padding: f.type==='checkbox' ? 0 : '0 10px',
      cursor:'pointer', transition:'background 140ms, border-color 140ms, box-shadow 140ms',
      boxShadow: active ? `0 0 0 4px rgba(99,102,241,0.15)` : 'none',
    }}>
      {f.type === 'checkbox' ? inner : (
        <div style={{display:'flex', alignItems:'center', gap:8, width:'100%', minWidth:0}}>
          {inner}
        </div>
      )}
    </div>
  );
}

function fieldIcon(t) {
  return ({signature:'pen-tool', initial:'type', name:'user', date:'calendar', text:'text-cursor-input', checkbox:'check-square'})[t] || 'square';
}
function fieldLabel(f) {
  return f.label || ({signature:'Signature', initial:'Initials', name:'Name', date:'Date', text:'Text', checkbox:'Checkbox'})[f.type];
}

/* ============================================================
   4. Field input drawer (bottom sheet for typing)
   ============================================================ */
function FieldInputDrawer({ field: f, recipient, value, onChange, onClose, onConfirm }) {
  // Tab state for signature: type | draw | upload
  const [tab, setTab] = useState('type');
  const [draft, setDraft] = useState(() => {
    if (value) return value;
    if (f.type === 'signature') return recipient.name;
    if (f.type === 'initial')   return recipient.name.split(' ').map(p=>p[0]).join('').slice(0,3).toUpperCase();
    if (f.type === 'name')      return recipient.name;
    if (f.type === 'date')      return new Date().toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'});
    return '';
  });

  const isSig = f.type === 'signature' || f.type === 'initial';

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(11,18,32,0.5)', zIndex:60,
      display:'flex', alignItems:'flex-end', justifyContent:'center',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%', maxWidth:680, background:'#fff', borderRadius:'20px 20px 0 0',
        padding:'24px 28px 28px', boxShadow:'0 -10px 40px rgba(11,18,32,0.2)',
      }}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
          <div>
            <div style={{fontSize:11, fontWeight:700, letterSpacing:'0.08em', color:'var(--fg-3)', textTransform:'uppercase'}}>
              {f.type === 'signature' ? 'Add your signature' : f.type === 'initial' ? 'Add your initials' : `Fill ${fieldLabel(f)}`}
            </div>
            <div style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:500, color:'var(--fg-1)', marginTop:4}}>
              {f.label}
            </div>
          </div>
          <button onClick={onClose} style={{width:32, height:32, borderRadius:8, background:'transparent', border:'1px solid var(--border-1)', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center'}}>
            <Icon name="x" size={16}/>
          </button>
        </div>

        {isSig && (
          <>
            <div style={{display:'flex', gap:4, padding:4, background:'var(--ink-100)', borderRadius:10, marginBottom:16, width:'fit-content'}}>
              {['type','draw','upload'].map(t => (
                <button key={t} onClick={()=>setTab(t)} style={{
                  padding:'6px 14px', border:'none', borderRadius:8, fontSize:12, fontWeight:600,
                  background: tab===t ? '#fff' : 'transparent',
                  color: tab===t ? 'var(--fg-1)' : 'var(--fg-3)',
                  cursor:'pointer', boxShadow: tab===t ? 'var(--shadow-sm)' : 'none', textTransform:'capitalize',
                }}>{t}</button>
              ))}
            </div>

            {tab === 'type' && (
              <div>
                <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={f.type==='signature'?'Your full name':'Initials'} style={{
                  width:'100%', padding:'12px 16px', border:'1px solid var(--border-2)', borderRadius:10,
                  fontSize:14, fontFamily:'var(--font-sans)', boxSizing:'border-box',
                }}/>
                <div style={{marginTop:18, padding:'24px', background:'var(--ink-50)', border:'1px solid var(--border-1)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', minHeight:100}}>
                  {f.type==='signature' ? (
                    <SignatureMark name={draft} size={48}/>
                  ) : (
                    <span style={{fontFamily:'var(--font-script, "Caveat", cursive)', fontSize:54, color:'var(--fg-1)', fontWeight:500}}>{draft || '—'}</span>
                  )}
                </div>
              </div>
            )}
            {tab === 'draw' && (
              <div style={{padding:'24px', background:'var(--ink-50)', border:'1.5px dashed var(--border-2)', borderRadius:12, minHeight:140, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8}}>
                <Icon name="pen-tool" size={28} style={{color:'var(--fg-4)'}}/>
                <div style={{fontSize:13, color:'var(--fg-3)'}}>Draw your signature here</div>
                <div style={{fontSize:11, color:'var(--fg-4)', fontFamily:'var(--font-mono)'}}>Click and drag with your mouse or finger</div>
              </div>
            )}
            {tab === 'upload' && (
              <div style={{padding:'24px', background:'var(--ink-50)', border:'1.5px dashed var(--border-2)', borderRadius:12, minHeight:140, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10}}>
                <Icon name="upload" size={24} style={{color:'var(--fg-4)'}}/>
                <div style={{fontSize:13, color:'var(--fg-3)'}}>Upload an image of your signature</div>
                <button style={{padding:'6px 14px', border:'1px solid var(--border-2)', borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer'}}>Choose file</button>
              </div>
            )}
          </>
        )}

        {!isSig && f.type === 'date' && (
          <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Apr 24, 2026" style={{
            width:'100%', padding:'12px 16px', border:'1px solid var(--border-2)', borderRadius:10,
            fontSize:14, fontFamily:'var(--font-mono)', boxSizing:'border-box',
          }}/>
        )}

        {!isSig && (f.type === 'text' || f.type === 'name') && (
          <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={f.label} style={{
            width:'100%', padding:'12px 16px', border:'1px solid var(--border-2)', borderRadius:10,
            fontSize:14, fontFamily:'var(--font-sans)', boxSizing:'border-box',
          }}/>
        )}

        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:22}}>
          <div style={{fontSize:12, color:'var(--fg-3)', display:'flex', alignItems:'center', gap:6}}>
            <Icon name="shield-check" size={12}/>
            Encrypted and audit-logged
          </div>
          <div style={{display:'flex', gap:10}}>
            <button onClick={onClose} style={{padding:'10px 16px', border:'1px solid var(--border-2)', borderRadius:10, background:'#fff', fontSize:13, fontWeight:600, color:'var(--fg-2)', cursor:'pointer'}}>Cancel</button>
            <button onClick={()=>onConfirm(draft)} disabled={!draft.trim()} style={{
              padding:'10px 18px', border:'none', borderRadius:10,
              background: draft.trim() ? 'var(--ink-900)' : 'var(--ink-300)',
              color:'#fff', fontSize:13, fontWeight:600, cursor: draft.trim()?'pointer':'not-allowed',
              display:'inline-flex', alignItems:'center', gap:6,
            }}>
              <Icon name="check" size={14}/>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   5. Review screen
   ============================================================ */
function RecipientReview({ recipient, fields, values, onBack, onSubmit }) {
  const filled = fields.filter(f => values[f.id]);
  return (
    <div>
      <RecipientHeader recipient={recipient} step="Review"/>
      <div style={{maxWidth:560, margin:'0 auto', padding:'48px 24px 80px'}}>
        <div style={{fontFamily:'var(--font-serif)', fontSize:36, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.1}}>
          Everything look right?
        </div>
        <div style={{fontSize:14, color:'var(--fg-3)', marginTop:10, lineHeight:1.6}}>
          Once you submit, we'll lock the document and send a signed copy to everyone.
        </div>

        <div style={{marginTop:28, background:'#fff', border:'1px solid var(--border-1)', borderRadius:14, overflow:'hidden'}}>
          {filled.map((f,i) => (
            <div key={f.id} style={{display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderBottom: i<filled.length-1 ? '1px solid var(--border-1)' : 'none'}}>
              <div style={{width:32, height:32, borderRadius:999, background:'var(--success-50)', color:'var(--success-700)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                <Icon name={fieldIcon(f.type)} size={14}/>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:13, fontWeight:600, color:'var(--fg-1)'}}>{fieldLabel(f)}</div>
                <div style={{fontSize:12, color:'var(--fg-3)', marginTop:2}}>Page {f.page}</div>
              </div>
              <div style={{fontSize:13, color:'var(--fg-2)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'right', fontFamily: f.type==='date'?'var(--font-mono)':'var(--font-sans)'}}>
                {f.type==='checkbox' ? '✓ Checked' : f.type==='signature' ? <SignatureMark name={values[f.id]} size={22}/> : values[f.id]}
              </div>
            </div>
          ))}
        </div>

        <div style={{marginTop:24, padding:'14px 16px', background:'var(--indigo-50)', borderRadius:10, fontSize:12, color:'var(--indigo-800)', lineHeight:1.55, display:'flex', gap:10}}>
          <Icon name="info" size={14}/>
          By clicking <b>Sign and submit</b> you agree your electronic signature is the legal equivalent of your handwritten signature.
        </div>

        <div style={{marginTop:24, display:'flex', gap:10}}>
          <button onClick={onBack} style={{flex:1, height:48, border:'1px solid var(--border-2)', borderRadius:10, background:'#fff', fontSize:14, fontWeight:600, color:'var(--fg-1)', cursor:'pointer'}}>Back to fields</button>
          <button onClick={onSubmit} style={{flex:2, height:48, border:'none', borderRadius:10, background:'var(--ink-900)', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8}}>
            <Icon name="pen-tool" size={16}/>
            Sign and submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   6. Done screen — incl. account upsell for unsigned users
   ============================================================ */
function RecipientDone({ recipient, onExit }) {
  const [email, setEmail] = useState(recipient.email);
  return (
    <div>
      <RecipientHeader recipient={recipient} step="Complete"/>
      <div style={{maxWidth:560, margin:'0 auto', padding:'56px 24px 80px', textAlign:'center'}}>
        <div style={{width:88, height:88, borderRadius:999, background:'var(--success-50)', color:'var(--success-700)', display:'inline-flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px'}}>
          <Icon name="check-circle-2" size={42}/>
        </div>
        <div style={{fontFamily:'var(--font-serif)', fontSize:42, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.1}}>Sealed.</div>
        <div style={{fontSize:15, color:'var(--fg-3)', marginTop:14, lineHeight:1.6}}>
          Your signature has been recorded. We've sent a signed copy to <b style={{color:'var(--fg-1)'}}>{recipient.email}</b> and notified {recipient.sender}.
        </div>

        <div style={{marginTop:28, display:'inline-flex', gap:10}}>
          <button style={{padding:'12px 18px', border:'1px solid var(--border-2)', borderRadius:10, background:'#fff', fontSize:13, fontWeight:600, color:'var(--fg-1)', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8}}>
            <Icon name="download" size={14}/> Download signed PDF
          </button>
          <button style={{padding:'12px 18px', border:'1px solid var(--border-2)', borderRadius:10, background:'#fff', fontSize:13, fontWeight:600, color:'var(--fg-1)', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8}}>
            <Icon name="file-text" size={14}/> View audit trail
          </button>
        </div>

        {/* Upsell card for unsigned users */}
        <div style={{marginTop:40, padding:'28px 24px', background:'var(--ink-900)', color:'#fff', borderRadius:18, textAlign:'left', position:'relative', overflow:'hidden'}}>
          <div style={{position:'absolute', top:'-30%', right:'-10%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(99,102,241,0.32), rgba(99,102,241,0) 60%)', pointerEvents:'none'}}/>
          <div style={{display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:999, background:'rgba(255,255,255,0.10)', fontSize:11, fontWeight:600, letterSpacing:'0.02em', marginBottom:14}}>
            <Icon name="sparkles" size={11}/>
            Free forever
          </div>
          <div style={{fontFamily:'var(--font-serif)', fontSize:24, fontWeight:500, lineHeight:1.2, color:'#fff'}}>
            Keep this signed copy in your Sealed library.
          </div>
          <div style={{fontSize:13, color:'rgba(255,255,255,0.72)', marginTop:8, lineHeight:1.55}}>
            Create a free account to save this document, request signatures from others, and access your full signing history.
          </div>
          <div style={{marginTop:18, display:'flex', gap:8}}>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" style={{
              flex:1, padding:'12px 14px', border:'1px solid rgba(255,255,255,0.14)', borderRadius:10,
              background:'rgba(255,255,255,0.06)', color:'#fff', fontSize:14, fontFamily:'var(--font-sans)',
              outline:'none',
            }}/>
            <button style={{padding:'0 18px', border:'none', borderRadius:10, background:'#fff', color:'var(--ink-900)', fontSize:13, fontWeight:700, cursor:'pointer'}}>
              Save my copy
            </button>
          </div>
        </div>

        <div style={{marginTop:28}}>
          <button onClick={onExit} style={{background:'transparent', border:'none', fontSize:13, fontWeight:600, color:'var(--fg-3)', cursor:'pointer'}}>
            No thanks, take me out
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Shared header for the recipient flow
   ============================================================ */
function RecipientHeader({ recipient, onExit, step }) {
  return (
    <div style={{position:'sticky', top:0, zIndex:18, height:60, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', borderBottom:'1px solid var(--border-1)', display:'flex', alignItems:'center', padding:'0 24px', gap:18}}>
      <img src="../../assets/logo.svg" height={24} alt="Sealed"/>
      <div style={{height:18, width:1, background:'var(--border-1)'}}/>
      <div style={{display:'flex', flexDirection:'column', gap:1, minWidth:0, flex:1}}>
        <div style={{fontSize:13, fontWeight:600, color:'var(--fg-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
          {recipient.docTitle}
        </div>
        <div style={{fontSize:11, color:'var(--fg-3)', fontFamily:'var(--font-mono)'}}>
          From {recipient.sender} · {recipient.docId}
        </div>
      </div>
      {step && (
        <div style={{padding:'4px 12px', borderRadius:999, background:'var(--ink-100)', fontSize:11, fontWeight:600, color:'var(--fg-2)', letterSpacing:'0.02em'}}>
          {step}
        </div>
      )}
      {onExit && (
        <button onClick={onExit} title="Exit" style={{width:32, height:32, borderRadius:8, background:'transparent', border:'1px solid var(--border-1)', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--fg-3)'}}>
          <Icon name="x" size={16}/>
        </button>
      )}
    </div>
  );
}

Object.assign(window, { RecipientFlow });
