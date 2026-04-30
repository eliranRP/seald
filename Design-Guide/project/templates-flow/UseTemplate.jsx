/* @jsx React.createElement */
/* Sealed — Templates: unified 3-step flow.
   Step 1: Signers (dropdown w/ checkboxes — matches the field-assignment popover)
   Step 2: Document (top-of-screen choice; info on hover)
   Step 3: Fields editor (handled in index.html via PlaceFieldsScreen)
*/
const { useState: useStateUM, useRef: useRefUM, useEffect: useEffectUM } = React;

/* ----------------- Shared progress header ----------------- */
function FlowHeader({ step, mode, templateName, onRenameTemplate, onBack, onCancel }) {
  const [editing, setEditing] = useStateUM(false);
  const [draft, setDraft] = useStateUM(templateName || '');
  useEffectUM(() => { setDraft(templateName || ''); }, [templateName]);
  const commit = () => {
    const v = (draft || '').trim();
    if (v && v !== templateName && onRenameTemplate) onRenameTemplate(v);
    else setDraft(templateName || '');
    setEditing(false);
  };
  const steps = [
    { n:1, label:'Signers' },
    { n:2, label:'Document' },
    { n:3, label:'Fields' },
  ];
  // Pill copy is explicit about path: creating new vs updating existing.
  const pill = mode === 'new'
    ? { bg:'var(--success-50)', fg:'var(--success-700)', icon:'plus', label:'Creating template' }
    : { bg:'var(--indigo-50)', fg:'var(--indigo-700)', icon:'pencil', label:'Updating template' };
  return (
    <div style={{display:'flex',alignItems:'center',gap:18,padding:'18px 28px',borderBottom:'1px solid var(--border-1)',background:'#fff'}}>
      <Button variant="ghost" icon="arrow-left" size="sm" onClick={onBack}>Back</Button>
      <div style={{flex:1, minWidth:0, display:'flex', alignItems:'center', gap:12}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,background:pill.bg,color:pill.fg,fontSize:11,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',flexShrink:0,whiteSpace:'nowrap'}}>
          <Icon name={pill.icon} size={11}/> {pill.label}
        </div>
        {editing ? (
          <input
            autoFocus value={draft}
            onChange={(e)=>setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e)=>{ if(e.key==='Enter') commit(); if(e.key==='Escape'){ setDraft(templateName||''); setEditing(false); } }}
            style={{fontSize:14,fontWeight:600,color:'var(--fg-1)',padding:'6px 10px',border:'1px solid var(--indigo-400)',borderRadius:8,outline:'none',fontFamily:'var(--font-sans)',minWidth:240,boxShadow:'0 0 0 4px rgba(99,102,241,0.12)'}}/>
        ) : (
          <button
            onClick={onRenameTemplate ? ()=>setEditing(true) : undefined}
            title={onRenameTemplate ? 'Rename template' : undefined}
            style={{
              display:'inline-flex',alignItems:'center',gap:6,
              fontSize:14,fontWeight:600,color:'var(--fg-1)',
              background:'transparent',border:'1px solid transparent',borderRadius:8,
              padding:'6px 10px',cursor: onRenameTemplate?'text':'default',
              minWidth:0,maxWidth:360,
            }}
            onMouseEnter={(e)=>{ if(onRenameTemplate){ e.currentTarget.style.background='var(--ink-50)'; e.currentTarget.style.borderColor='var(--border-1)'; } }}
            onMouseLeave={(e)=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='transparent'; }}>
            <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0}}>{templateName}</span>
            {onRenameTemplate && <Icon name="pencil" size={12} style={{color:'var(--fg-3)',flexShrink:0}}/>}
          </button>
        )}
      </div>
      <div style={{display:'flex', alignItems:'center', gap:0}}>
        {steps.map((s, i) => {
          const done = s.n < step;
          const active = s.n === step;
          return (
            <React.Fragment key={s.n}>
              <div style={{display:'inline-flex', alignItems:'center', gap:8, padding:'6px 12px', borderRadius:999, background: active?'var(--ink-900)':'transparent', color: active?'#fff' : done?'var(--success-700)':'var(--fg-3)', fontSize:12, fontWeight:600}}>
                {done
                  ? <span style={{width:16,height:16,borderRadius:999,background:'var(--success-500)',color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="check" size={10}/></span>
                  : <span style={{width:18,height:18,borderRadius:999,border:`1.5px solid ${active?'#fff':'var(--border-2)'}`,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color: active?'#fff':'var(--fg-3)'}}>{s.n}</span>}
                {s.label}
              </div>
              {i < steps.length - 1 && <div style={{width:18, height:1, background:'var(--border-1)'}}/>}
            </React.Fragment>
          );
        })}
      </div>
      <button onClick={onCancel} style={{background:'transparent',border:'none',color:'var(--fg-3)',padding:6,borderRadius:8,cursor:'pointer'}} title="Cancel"><Icon name="x" size={18}/></button>
    </div>
  );
}

/* ---------------------- Step 1: Signers (dropdown w/ checkboxes) ---------------------- */
function SignersDropdown({ contacts, signers, setSigners }) {
  const [open, setOpen] = useStateUM(false);
  const [q, setQ] = useStateUM('');
  const ref = useRefUM(null);
  const colors = ['#F472B6','#7DD3FC','#FBBF24','#A78BFA','#34D399','#FB7185'];

  useEffectUM(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const isOn = (c) => signers.find(s => s.email.toLowerCase() === c.email.toLowerCase());
  const toggle = (c) => {
    if (isOn(c)) {
      setSigners(prev => prev.filter(s => s.email.toLowerCase() !== c.email.toLowerCase()));
    } else {
      setSigners(prev => [...prev, { id:`s${Date.now()}-${Math.random().toString(36).slice(2,6)}`, contactId:c.id, name:c.name, email:c.email, color: colors[prev.length % colors.length] }]);
    }
  };
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s||'').trim());
  const addCustomEmail = () => {
    const email = q.trim();
    if (!isEmail(email)) return;
    if (signers.find(s => s.email.toLowerCase() === email.toLowerCase())) { setQ(''); return; }
    setSigners(prev => [...prev, { id:`s${Date.now()}`, contactId:null, name: email.split('@')[0], email, color: colors[prev.length % colors.length] }]);
    setQ('');
  };

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div ref={ref} style={{position:'relative'}}>
      {/* Trigger */}
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:'100%', textAlign:'left',
        background:'#fff', border:`1px solid ${open?'var(--indigo-400)':'var(--border-1)'}`,
        borderRadius:14, padding:'14px 16px', cursor:'pointer',
        display:'flex', alignItems:'center', gap:12,
        boxShadow: open ? '0 0 0 4px rgba(99,102,241,0.12)' : 'none',
        transition:'border-color 140ms, box-shadow 140ms',
      }}>
        <Icon name="users" size={16} style={{color:'var(--fg-3)', flexShrink:0}}/>
        <div style={{flex:1, minWidth:0}}>
          {signers.length === 0
            ? <span style={{fontSize:14, color:'var(--fg-3)'}}>Select signers…</span>
            : <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                {signers.map(s => (
                  <span key={s.id} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 8px 3px 4px',background:'var(--ink-50)',border:'1px solid var(--border-1)',borderRadius:999,fontSize:12.5,color:'var(--fg-1)'}}>
                    <span style={{width:16,height:16,borderRadius:999,background:s.color,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:8.5,fontWeight:700}}>
                      {(s.name||s.email).split(/\s+/).map(p=>p[0]).slice(0,2).join('').toUpperCase()}
                    </span>
                    {s.name}
                  </span>
                ))}
              </div>
          }
        </div>
        <Icon name={open?'chevron-up':'chevron-down'} size={16} style={{color:'var(--fg-3)', flexShrink:0}}/>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', left:0, right:0, zIndex:30,
          background:'#fff', border:'1px solid var(--border-1)', borderRadius:14,
          boxShadow:'var(--shadow-lg)', overflow:'hidden', maxHeight:380, display:'flex', flexDirection:'column',
        }}>
          {/* Search */}
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--border-1)', display:'flex', alignItems:'center', gap:8}}>
            <Icon name="search" size={14} style={{color:'var(--fg-3)'}}/>
            <input autoFocus value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search or type an email…"
              onKeyDown={(e)=>{ if (e.key==='Enter' && isEmail(q)) addCustomEmail(); }}
              style={{flex:1, border:'none', outline:'none', fontSize:13, fontFamily:'var(--font-sans)', color:'var(--fg-1)', padding:'4px 0'}}/>
          </div>
          {/* List */}
          <div style={{overflow:'auto', flex:1, padding:'6px 0'}}>
            {filtered.length === 0 && !isEmail(q) && (
              <div style={{padding:'24px 16px', textAlign:'center', color:'var(--fg-3)', fontSize:13}}>No matches</div>
            )}
            {filtered.map(c => {
              const on = !!isOn(c);
              return (
                <label key={c.id} onClick={()=>toggle(c)} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 14px',cursor:'pointer'}}
                  onMouseEnter={(e)=>{ e.currentTarget.style.background='var(--ink-50)'; }}
                  onMouseLeave={(e)=>{ e.currentTarget.style.background='transparent'; }}>
                  <span style={{width:20,height:20,borderRadius:5,border:`1.5px solid ${on?'var(--success-500)':'var(--border-2)'}`,background:on?'var(--success-500)':'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
                    {on && <Icon name="check" size={13}/>}
                  </span>
                  <span style={{width:24,height:24,borderRadius:999,background:on ? (signers.find(s=>s.email.toLowerCase()===c.email.toLowerCase())?.color||'var(--ink-300)') : 'var(--ink-200)',color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0}}>
                    {c.name.split(/\s+/).map(p=>p[0]).slice(0,2).join('').toUpperCase()}
                  </span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13.5, color:'var(--fg-1)', fontWeight:500}}>{c.name}</div>
                    <div style={{fontSize:11.5, color:'var(--fg-3)'}}>{c.email}</div>
                  </div>
                </label>
              );
            })}
            {isEmail(q) && !contacts.find(c=>c.email.toLowerCase()===q.trim().toLowerCase()) && (
              <div onClick={addCustomEmail} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',cursor:'pointer',borderTop:'1px solid var(--border-1)',background:'var(--indigo-50)'}}>
                <span style={{width:20,height:20,borderRadius:5,border:'1.5px solid var(--indigo-500)',background:'var(--indigo-500)',color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="plus" size={12}/></span>
                <span style={{fontSize:13, color:'var(--fg-2)'}}>Add <b style={{color:'var(--fg-1)'}}>{q.trim()}</b> as guest signer</span>
              </div>
            )}
          </div>
          {/* Footer */}
          <div style={{borderTop:'1px solid var(--border-1)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:'var(--fg-3)'}}>
            <span>{signers.length} selected</span>
            <button onClick={()=>setOpen(false)} style={{background:'var(--ink-900)',color:'#fff',border:'none',borderRadius:999,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SignersStep({ template, mode, signers, setSigners, contacts, onContinue, onBack, onCancel, onRenameTemplate }) {
  const [picking, setPicking] = useStateUM(false);
  const [q, setQ] = useStateUM('');
  const colors = ['#F472B6','#7DD3FC','#FBBF24','#A78BFA','#34D399','#FB7185'];
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s||'').trim());
  const isOn = (c) => signers.find(s => s.email.toLowerCase() === c.email.toLowerCase());
  const toggle = (c) => {
    if (isOn(c)) setSigners(prev => prev.filter(s => s.email.toLowerCase() !== c.email.toLowerCase()));
    else setSigners(prev => [...prev, { id:`s${Date.now()}-${Math.random().toString(36).slice(2,6)}`, contactId:c.id, name:c.name, email:c.email, color: colors[prev.length % colors.length] }]);
  };
  const addCustomEmail = () => {
    const email = q.trim();
    if (!isEmail(email)) return;
    if (signers.find(s => s.email.toLowerCase() === email.toLowerCase())) { setQ(''); return; }
    setSigners(prev => [...prev, { id:`s${Date.now()}`, contactId:null, name: email.split('@')[0], email, color: colors[prev.length % colors.length] }]);
    setQ('');
  };
  const removeSigner = (id) => setSigners(prev => prev.filter(s => s.id !== id));
  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase())
  );

  const initials = (s) => (s.name||s.email).split(/\s+/).map(p=>p[0]).slice(0,2).join('').toUpperCase();

  return (
    <div data-screen-label="Use template — signers">
      <FlowHeader step={1} mode={mode} templateName={template?.name || 'New template'} onRenameTemplate={onRenameTemplate} onBack={onBack} onCancel={onCancel}/>

      {/* Centered card, modal-style */}
      <div style={{padding:'48px 24px 100px', display:'flex', justifyContent:'center', minHeight:'calc(100vh - 200px)', alignItems:'flex-start'}}>
        <div style={{width:'100%', maxWidth:640, background:'#fff', borderRadius:20, boxShadow:'var(--shadow-lg)', border:'1px solid var(--border-1)', padding:'36px 36px 0', display:'flex', flexDirection:'column'}}>
          <div style={{fontFamily:'var(--font-serif)', fontSize:28, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.2}}>
            {mode==='new' ? 'Who will sign this?' : "Who's signing this time?"}
          </div>
          <div style={{fontSize:14, color:'var(--fg-3)', marginTop:8, lineHeight:1.55}}>
            {mode==='new' ? 'Pick the people who will fill this template.' : 'Pre-filled from last time. Adjust as needed.'}
          </div>

          {/* Empty state pill OR list of selected signers */}
          <div style={{marginTop:22}}>
            {signers.length === 0 ? (
              <div style={{padding:'22px 16px', textAlign:'center', background:'var(--ink-50)', border:'1.5px dashed var(--border-2)', borderRadius:14, color:'var(--fg-3)', fontSize:14}}>
                Add at least one receiver to continue.
              </div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                {signers.map((s, i) => (
                  <div key={s.id} style={{display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'#fff', border:'1px solid var(--border-1)', borderRadius:12}}>
                    <span style={{width:28, height:28, borderRadius:999, background:s.color, color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0}}>{initials(s)}</span>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:14, fontWeight:600, color:'var(--fg-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{s.name}</div>
                      <div style={{fontSize:12, color:'var(--fg-3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{s.email}</div>
                    </div>
                    <span style={{fontSize:11, fontFamily:'var(--font-mono)', color:'var(--fg-3)', background:'var(--ink-100)', padding:'3px 8px', borderRadius:999}}>#{i+1}</span>
                    <button onClick={()=>removeSigner(s.id)} title="Remove" style={{background:'transparent', border:'none', padding:6, borderRadius:6, cursor:'pointer', color:'var(--fg-3)', display:'inline-flex'}}>
                      <Icon name="x" size={16}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add signer button OR inline picker (search + contacts) */}
          <div style={{marginTop:12}}>
            {!picking ? (
              <button onClick={()=>setPicking(true)} style={{
                width:'100%', padding:'14px 16px',
                background:'var(--indigo-50)', border:'1.5px dashed var(--indigo-300)',
                borderRadius:14, cursor:'pointer',
                display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
                color:'var(--indigo-700)', fontSize:14, fontWeight:600, fontFamily:'var(--font-sans)',
                transition:'background 140ms, border-color 140ms',
              }}
                onMouseEnter={(e)=>{ e.currentTarget.style.background='var(--indigo-100)'; e.currentTarget.style.borderColor='var(--indigo-500)'; }}
                onMouseLeave={(e)=>{ e.currentTarget.style.background='var(--indigo-50)'; e.currentTarget.style.borderColor='var(--indigo-300)'; }}>
                <Icon name="plus" size={16}/> Add signer
              </button>
            ) : (
              <div style={{border:'1px solid var(--border-1)', borderRadius:14, overflow:'hidden', background:'#fff'}}>
                {/* Search */}
                <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border-1)', display:'flex', alignItems:'center', gap:10, background:'var(--ink-50)'}}>
                  <Icon name="search" size={14} style={{color:'var(--fg-3)'}}/>
                  <input autoFocus value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search contacts or type an email…"
                    onKeyDown={(e)=>{ if (e.key==='Enter' && isEmail(q)) addCustomEmail(); if (e.key==='Escape') { setPicking(false); setQ(''); } }}
                    style={{flex:1, border:'none', outline:'none', fontSize:14, fontFamily:'var(--font-sans)', color:'var(--fg-1)', background:'transparent'}}/>
                  <button onClick={()=>{ setPicking(false); setQ(''); }} title="Close" style={{background:'transparent', border:'none', padding:4, borderRadius:6, cursor:'pointer', color:'var(--fg-3)', display:'inline-flex'}}>
                    <Icon name="x" size={14}/>
                  </button>
                </div>
                {/* List */}
                <div style={{maxHeight:280, overflow:'auto', padding:'4px 0'}}>
                  {filtered.length === 0 && !isEmail(q) && (
                    <div style={{padding:'24px 16px', textAlign:'center', color:'var(--fg-3)', fontSize:13}}>No matches</div>
                  )}
                  {filtered.map(c => {
                    const on = !!isOn(c);
                    const sigColor = on ? (signers.find(s=>s.email.toLowerCase()===c.email.toLowerCase())?.color) : c.color;
                    return (
                      <div key={c.id} onClick={()=>toggle(c)} style={{display:'flex', alignItems:'center', gap:12, padding:'10px 14px', cursor:'pointer'}}
                        onMouseEnter={(e)=>{ e.currentTarget.style.background='var(--ink-50)'; }}
                        onMouseLeave={(e)=>{ e.currentTarget.style.background='transparent'; }}>
                        <span style={{width:22, height:22, borderRadius:999, border:`1.75px solid ${on?'var(--success-500)':'var(--border-2)'}`, background:on?'var(--success-500)':'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'#fff', flexShrink:0}}>
                          {on && <Icon name="check" size={13}/>}
                        </span>
                        <span style={{width:30, height:30, borderRadius:999, background:sigColor||c.color, color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0}}>
                          {c.name.split(/\s+/).map(p=>p[0]).slice(0,2).join('').toUpperCase()}
                        </span>
                        <div style={{flex:1, minWidth:0}}>
                          <div style={{fontSize:14, color:'var(--fg-1)', fontWeight:600}}>{c.name}</div>
                          <div style={{fontSize:12, color:'var(--fg-3)'}}>{c.email}</div>
                        </div>
                      </div>
                    );
                  })}
                  {isEmail(q) && !contacts.find(c=>c.email.toLowerCase()===q.trim().toLowerCase()) && (
                    <div onClick={addCustomEmail} style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', cursor:'pointer', borderTop:'1px solid var(--border-1)', background:'var(--indigo-50)'}}>
                      <span style={{width:22, height:22, borderRadius:999, border:'1.75px solid var(--indigo-500)', background:'var(--indigo-500)', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center'}}><Icon name="plus" size={12}/></span>
                      <span style={{fontSize:13.5, color:'var(--fg-2)'}}>Add <b style={{color:'var(--fg-1)'}}>{q.trim()}</b> as guest signer</span>
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div style={{borderTop:'1px solid var(--border-1)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:'var(--fg-3)', background:'var(--ink-50)'}}>
                  <span>{signers.length} selected</span>
                  <button onClick={()=>{ setPicking(false); setQ(''); }} style={{background:'var(--ink-900)', color:'#fff', border:'none', borderRadius:999, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer'}}>Done</button>
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div style={{borderTop:'1px solid var(--border-1)', margin:'28px -36px 0', padding:'18px 36px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:14}}>
            <button onClick={onBack} style={{background:'transparent', border:'none', color:'var(--fg-2)', fontSize:14, fontWeight:600, textDecoration:'underline', textUnderlineOffset:3, cursor:'pointer', padding:'8px 6px'}}>Back</button>
            <Button variant="primary" iconRight="arrow-right" disabled={signers.length===0} onClick={onContinue}>Continue to document</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- Step 2: Document (compact, choice at top) ---------------------- */
function InfoTip({ children, label }) {
  const [show, setShow] = useStateUM(false);
  return (
    <span style={{position:'relative', display:'inline-flex'}}
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && (
        <span style={{position:'absolute',bottom:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)',background:'var(--ink-900)',color:'#fff',fontSize:11.5,padding:'7px 10px',borderRadius:8,whiteSpace:'nowrap',zIndex:40,boxShadow:'var(--shadow-md)',pointerEvents:'none'}}>
          {label}
          <span style={{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:'5px solid var(--ink-900)'}}/>
        </span>
      )}
    </span>
  );
}

function DocumentStep({ template, mode, savedDoc, onUseSaved, onUpload, onBack, onCancel, onRenameTemplate }) {
  if (mode === 'new') {
    return (
      <div data-screen-label="New template — upload">
        <FlowHeader step={2} mode={mode} templateName={template?.name || 'New template'} onRenameTemplate={onRenameTemplate} onBack={onBack} onCancel={onCancel}/>
        <UploadScreen
          title="Upload an example document"
          subtitle="A representative copy works best — we'll use it to place fields. Real documents go in later."
          dropTitle="Drop a sample PDF"
          dropSubtitle="up to 25 MB"
          onNext={onUpload}/>
      </div>
    );
  }

  // Existing template — choice up top, compact.
  const [choice, setChoice] = useStateUM('saved'); // 'saved' | 'new'
  return (
    <div data-screen-label="Use template — document">
      <FlowHeader step={2} mode={mode} templateName={template?.name || 'Template'} onRenameTemplate={onRenameTemplate} onBack={onBack} onCancel={onCancel}/>

      <div style={{padding:'32px 48px 80px', maxWidth:880, margin:'0 auto'}}>
        {/* Compact choice bar at the very top */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
          <div style={{fontFamily:'var(--font-serif)',fontSize:28,fontWeight:500,color:'var(--fg-1)',letterSpacing:'-0.02em',flex:1}}>Document</div>
          <InfoTip label="The saved layout adapts to whichever document you pick.">
            <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:22,height:22,borderRadius:999,color:'var(--fg-3)',cursor:'help'}}>
              <Icon name="info" size={14}/>
            </span>
          </InfoTip>
        </div>

        {/* Segmented choice */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,background:'var(--ink-100)',padding:4,borderRadius:14,marginBottom:24}}>
          <button onClick={()=>setChoice('saved')} style={{
            padding:'12px 14px', border:'none', borderRadius:10, cursor:'pointer',
            background: choice==='saved' ? '#fff' : 'transparent',
            color: choice==='saved' ? 'var(--fg-1)' : 'var(--fg-3)',
            fontSize:13.5, fontWeight:600, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow: choice==='saved' ? 'var(--shadow-xs)' : 'none', transition:'all 140ms',
          }}>
            <Icon name="bookmark" size={14}/> Use saved document
          </button>
          <button onClick={()=>setChoice('new')} style={{
            padding:'12px 14px', border:'none', borderRadius:10, cursor:'pointer',
            background: choice==='new' ? '#fff' : 'transparent',
            color: choice==='new' ? 'var(--fg-1)' : 'var(--fg-3)',
            fontSize:13.5, fontWeight:600, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow: choice==='new' ? 'var(--shadow-xs)' : 'none', transition:'all 140ms',
          }}>
            <Icon name="upload-cloud" size={14}/> Upload a new one
          </button>
        </div>

        {/* Saved doc compact card */}
        {choice === 'saved' && (
          <div style={{background:'#fff', border:'1px solid var(--border-1)', borderRadius:14, padding:'18px 20px', display:'flex', alignItems:'center', gap:16}}>
            <div style={{position:'relative', width:56, height:72, flexShrink:0, background:'#fff', border:'1px solid var(--border-1)', borderRadius:5, padding:'7px 6px', boxShadow:'var(--shadow-paper)'}}>
              <div style={{height:3,borderRadius:1.5,background:'var(--indigo-300)',width:'62%'}}/>
              {[...Array(5)].map((_,i)=>(<div key={i} style={{height:1.8,borderRadius:1,background:'var(--ink-200)',width:`${60+(i*11)%32}%`,marginTop:3.5}}/>))}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:'var(--fg-1)'}}>{savedDoc?.name || 'Saved example PDF'}</div>
              <div style={{display:'flex',gap:14,marginTop:4,fontSize:12,color:'var(--fg-3)'}}>
                <span>{template.pages} pages</span>
                <span>·</span>
                <span>{(template.fields||[]).length} field rules</span>
                <span>·</span>
                <span>Last sent {template.lastUsed || '—'}</span>
              </div>
            </div>
            <Button variant="primary" iconRight="arrow-right" onClick={onUseSaved}>Continue</Button>
          </div>
        )}

        {/* Upload zone */}
        {choice === 'new' && (
          <UploadScreen
            title=""
            subtitle=""
            dropTitle="Drop a different PDF"
            dropSubtitle="Saved layout will snap onto it · up to 25 MB"
            onNext={onUpload}/>
        )}
      </div>
    </div>
  );
}

/* --------- Send confirmation popup ---------- */
function SendConfirmDialog({ open, onClose, onJustSend, onSendAndUpdate }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:200,background:'rgba(15,23,42,0.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:24,animation:'fadeIn 160ms var(--ease-standard)'}}>
      <div onClick={(e)=>e.stopPropagation()} style={{width:520,maxWidth:'100%',background:'#fff',borderRadius:18,boxShadow:'var(--shadow-xl)',padding:'28px 28px 22px'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
          <div style={{width:44,height:44,borderRadius:12,background:'var(--indigo-50)',color:'var(--indigo-700)',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon name="bookmark" size={20}/>
          </div>
          <div>
            <div style={{fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,color:'var(--fg-1)',letterSpacing:'-0.01em',lineHeight:1.2}}>Update the template too?</div>
            <div style={{fontSize:13,color:'var(--fg-3)',marginTop:4,lineHeight:1.5}}>Save your field changes back to the template so next time starts here.</div>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:18}}>
          <button onClick={onSendAndUpdate} style={{textAlign:'left',padding:'14px 16px',border:'1.5px solid var(--indigo-300)',borderRadius:12,background:'var(--indigo-50)',cursor:'pointer',display:'flex',alignItems:'center',gap:12}}>
            <Icon name="save" size={18} style={{color:'var(--indigo-700)',flexShrink:0}}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:'var(--fg-1)'}}>Send and update template</div>
              <div style={{fontSize:12,color:'var(--fg-3)',marginTop:2}}>Saves new field positions for everyone using it.</div>
            </div>
            <Icon name="arrow-right" size={16} style={{color:'var(--fg-3)'}}/>
          </button>
          <button onClick={onJustSend} style={{textAlign:'left',padding:'14px 16px',border:'1px solid var(--border-1)',borderRadius:12,background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',gap:12}}>
            <Icon name="send" size={18} style={{color:'var(--fg-2)',flexShrink:0}}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:'var(--fg-1)'}}>Just send this one</div>
              <div style={{fontSize:12,color:'var(--fg-3)',marginTop:2}}>Keeps the original template untouched.</div>
            </div>
            <Icon name="arrow-right" size={16} style={{color:'var(--fg-3)'}}/>
          </button>
        </div>

        <div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FlowHeader, SignersStep, SignersDropdown, DocumentStep, SendConfirmDialog, InfoTip });
