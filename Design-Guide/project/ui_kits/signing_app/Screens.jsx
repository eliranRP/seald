/* @jsx React.createElement */
/* Signing App — with multi-signer field assignment, duplicate-to-pages,
   and resizable/collapsible rails. */

const { useState, useRef, useEffect, useMemo } = React;

/* ---------- Default contacts (persisted) ---------- */
const DEFAULT_CONTACTS = [
  { id:'c1', name:'Eliran Azulay',   email:'eliran@azulay.co',   color:'#F472B6' },
  { id:'c2', name:'Nitsan Yanovitch',email:'nitsan@yanov.co',    color:'#7DD3FC' },
  { id:'c3', name:'Ana Torres',      email:'ana@farrow.law',     color:'#10B981' },
  { id:'c4', name:'Meilin Chen',     email:'meilin@chen.co',     color:'#F59E0B' },
  { id:'c5', name:'Priya Kapoor',    email:'priya@kapoor.com',   color:'#818CF8' },
];
function useContacts() {
  const [contacts, setContacts] = useState(() => {
    try { const s = localStorage.getItem('sealed.contacts'); if (s) return JSON.parse(s); } catch(e){}
    return DEFAULT_CONTACTS;
  });
  useEffect(()=>{ localStorage.setItem('sealed.contacts', JSON.stringify(contacts)); }, [contacts]);
  return [contacts, setContacts];
}

function TopNav({ onLogo, active='documents', onNav }) {
  const items = ['Documents','Contacts'];
  return (
    <div style={{position:'sticky', top:0, zIndex:20, height:56, background:'rgba(255,255,255,0.82)', backdropFilter:'blur(12px)', borderBottom:'1px solid var(--border-1)', display:'flex', alignItems:'center', padding:'0 24px', gap:24}}>
      <img src="../../assets/logo.svg" height="26" alt="Sealed" onClick={onLogo} style={{cursor:'pointer'}}/>
      <div style={{display:'flex',gap:4,marginLeft:16}}>
        {items.map(l => {
          const isActive = l.toLowerCase() === active;
          return <div key={l} onClick={()=>onNav && onNav(l.toLowerCase())} style={{padding:'6px 12px',borderRadius:8,fontSize:14,fontWeight:500,color: isActive ?'var(--fg-1)':'var(--fg-3)',cursor:'pointer',background: isActive?'var(--ink-100)':'transparent'}}>{l}</div>;
        })}
      </div>
      <div style={{flex:1}}/>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <Avatar name="Jamie Okonkwo" size={32}/>
      </div>
    </div>
  );
}

function LeftRail({ active='sent', onNew }) {
  const items = [
    { id:'inbox', label:'Inbox', icon:'inbox' },
    { id:'sent', label:'Sent', icon:'send' },
    { id:'drafts', label:'Drafts', icon:'file-text' },
    { id:'completed', label:'Completed', icon:'check-circle-2' },
  ];
  return (
    <div style={{width:240, padding:'16px 12px', borderRight:'1px solid var(--border-1)', height:'calc(100vh - 56px)', position:'sticky', top:56, background:'var(--ink-50)'}}>
      <Button variant="primary" icon="upload-cloud" onClick={onNew} style={{width:'100%', justifyContent:'center'}}>New document</Button>
      <div style={{height:20}}/>
      {items.map(it => (
        <div key={it.id} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:10, background: active===it.id?'#fff':'transparent', border: active===it.id?'1px solid var(--border-1)':'1px solid transparent', color: active===it.id?'var(--fg-1)':'var(--fg-2)', fontSize:14, fontWeight: active===it.id?600:500, cursor:'pointer', marginBottom:2}}>
          <Icon name={it.icon} size={16} style={{color: active===it.id?'var(--indigo-600)':'var(--fg-3)'}}/>
          <span style={{flex:1}}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function UploadScreen({ onNext }) {
  return (
    <div style={{padding:'48px 48px 80px', maxWidth:960, margin:'0 auto'}}>
      <div style={{fontFamily:'var(--font-serif)', fontSize:40, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.1}}>Start a new document</div>
      <div style={{fontSize:16, color:'var(--fg-3)', marginTop:10, lineHeight:1.55}}>Drop a PDF, or choose from your computer. We'll walk you through placing signature fields and sending it off.</div>
      <div style={{marginTop:32, background:'#fff', border:'1.5px dashed var(--indigo-300)', borderRadius:28, padding:'56px 32px', textAlign:'center'}}>
        <div style={{width:64,height:64,borderRadius:999,background:'var(--indigo-50)',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'var(--indigo-600)',marginBottom:20}}><Icon name="upload-cloud" size={28}/></div>
        <div style={{fontFamily:'var(--font-serif)',fontSize:24,fontWeight:500,color:'var(--fg-1)'}}>Drop your PDF here</div>
        <div style={{fontSize:14,color:'var(--fg-3)',marginTop:8}}>or choose a file from your computer · up to 25 MB</div>
            <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:24}}>
          <Button variant="primary" onClick={onNext}>Choose file</Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PLACE FIELDS — new version
   ============================================================ */

const FIELD_TYPES = [
  {k:'signature', i:'pen-tool', l:'Signature', required:true},
  {k:'initial',   i:'type',     l:'Initials', required:true},
  {k:'name',      i:'user',     l:'Name'},
  {k:'date',      i:'calendar', l:'Date'},
  {k:'text',      i:'text-cursor-input', l:'Text'},
  {k:'checkbox',  i:'check-square', l:'Checkbox'},
];

/* Semantic sign zones detected in the PDF — bottom-of-page signature lines.
   Fields dropped or dragged within SNAP_RADIUS px of a zone's center snap to it. */
const SIGN_ZONES = {
  1: [], // no sign zones on page 1
  2: [],
  3: [],
  4: [
    { x: 60,  y: 560, w: 200, h: 54, label: 'Signature — Client' },
    { x: 272, y: 560, w: 200, h: 54, label: 'Signature — Counterparty' },
    { x: 60,  y: 640, w: 180, h: 40, label: 'Date' },
  ],
};
const SNAP_RADIUS = 28;        // snap to zone if within this many px of its top-left
const ALIGN_SNAP  = 6;         // align to other fields within this many px

function PlaceFieldsScreen({ onNext, onBack, contacts, setContacts, totalPages = 4 }) {
  const [signers, setSigners] = useState(() => [
    { id:'s1', contactId:'c1', name:'Eliran Azulay',    email:'eliran@azulay.co', color:'#F472B6' },
    { id:'s2', contactId:'c2', name:'Nitsan Yanovitch', email:'nitsan@yanov.co',  color:'#7DD3FC' },
  ]);
  const [currentPage, setCurrentPage] = useState(4);
  // fields: array of {id, page, type, x, y, signerIds:[]}
  const [fields, setFields] = useState(() => [
    { id:'f1', page:4, type:'signature', x: 60, y: 560, signerIds:['s1'] },
    { id:'f2', page:4, type:'signature', x: 272, y: 560, signerIds:['s2'] },
  ]);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]); // multi-select (group)
  const [marquee, setMarquee] = useState(null); // {x1,y1,x2,y2}
  const [signerPopover, setSignerPopover] = useState(null);   // {fieldId, x, y}
  const [pagesPopover, setPagesPopover] = useState(null);     // {fieldId}
  const [addSignerOpen, setAddSignerOpen] = useState(false);

  // rail state: widths + collapsed
  const [leftW, setLeftW]   = useState(() => Number(localStorage.getItem('sealed.leftW'))  || 240);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem('sealed.rightW')) || 320);
  const [leftOpen,  setLeftOpen]  = useState(() => localStorage.getItem('sealed.leftOpen')  !== '0');
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('sealed.rightOpen') !== '0');
  useEffect(()=>{ localStorage.setItem('sealed.leftW', leftW); localStorage.setItem('sealed.rightW', rightW);
    localStorage.setItem('sealed.leftOpen', leftOpen?'1':'0'); localStorage.setItem('sealed.rightOpen', rightOpen?'1':'0');
  }, [leftW, rightW, leftOpen, rightOpen]);

  const canvasRef = useRef(null);

  // Active alignment guides + hovered sign zone (shown while dragging a field)
  const [guides, setGuides] = useState(null);  // { v: [x,...], h: [y,...] }
  const [activeZone, setActiveZone] = useState(null); // zone object currently being hovered
  const [draggingId, setDraggingId] = useState(null); // id of field being dragged (for opacity)

  // Compute snap + guides for a field being dragged to (nx, ny) on `page`.
  // Returns { x, y, guides:{v,h}, zone }
  const snapAndAlign = (fieldId, nx, ny, page, width, height) => {
    // 1) Sign-zone snap (strongest — snap exactly if within SNAP_RADIUS)
    const zones = SIGN_ZONES[page] || [];
    let bestZone = null, bestDist = Infinity;
    for (const z of zones) {
      const dx = (z.x) - nx, dy = (z.y) - ny;
      const d = Math.hypot(dx, dy);
      if (d < SNAP_RADIUS && d < bestDist) { bestZone = z; bestDist = d; }
    }
    if (bestZone) return { x: bestZone.x, y: bestZone.y, guides: null, zone: bestZone };

    // 2) Smart-guide alignment to other fields on same page
    const others = fields.filter(f => f.id !== fieldId && f.page === page && !(selectedIds.includes(f.id)));
    const v = [], h = [];
    const edgesX = []; // candidate x targets
    const edgesY = [];
    for (const o of others) {
      const ow = (o.signerIds && o.signerIds.length > 1) ? width*2+8 : width;
      edgesX.push(o.x, o.x + ow, o.x + ow/2);
      edgesY.push(o.y, o.y + height, o.y + height/2);
    }
    let sx = nx, sy = ny;
    const cx = nx + width/2, cy = ny + height/2;
    // Try snapping left, center, right to any candidate
    const tryX = [
      { probe: nx,          snap: (t)=>t },
      { probe: cx,          snap: (t)=>t - width/2 },
      { probe: nx + width,  snap: (t)=>t - width },
    ];
    let hitX = null;
    for (const { probe, snap } of tryX) {
      for (const t of edgesX) {
        if (Math.abs(probe - t) < ALIGN_SNAP) {
          sx = snap(t); hitX = t; break;
        }
      }
      if (hitX !== null) break;
    }
    const tryY = [
      { probe: ny,           snap: (t)=>t },
      { probe: cy,           snap: (t)=>t - height/2 },
      { probe: ny + height,  snap: (t)=>t - height },
    ];
    let hitY = null;
    for (const { probe, snap } of tryY) {
      for (const t of edgesY) {
        if (Math.abs(probe - t) < ALIGN_SNAP) {
          sy = snap(t); hitY = t; break;
        }
      }
      if (hitY !== null) break;
    }
    if (hitX !== null) v.push(hitX);
    if (hitY !== null) h.push(hitY);
    return { x: sx, y: sy, guides: (v.length||h.length) ? {v,h} : null, zone: null };
  };

  // Drag & drop a field from palette → canvas
  const [dragType, setDragType] = useState(null);
  const [dragHoverPos, setDragHoverPos] = useState(null); // {x,y,page} preview ghost

  const handleCanvasDragOver = (e) => {
    e.preventDefault();
    if (!dragType || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nx = e.clientX - rect.left - 60;
    const ny = e.clientY - rect.top - 22;
    // show hovered zone if close
    const zones = SIGN_ZONES[currentPage] || [];
    let bestZone = null, bestDist = Infinity;
    for (const z of zones) {
      const d = Math.hypot(z.x - nx, z.y - ny);
      if (d < SNAP_RADIUS && d < bestDist) { bestZone = z; bestDist = d; }
    }
    setActiveZone(bestZone);
    setDragHoverPos({ x: bestZone ? bestZone.x : nx, y: bestZone ? bestZone.y : ny });
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    if (!dragType) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left - 60;
    let y = e.clientY - rect.top - 22;
    // Snap to nearest sign zone on drop
    const zones = SIGN_ZONES[currentPage] || [];
    let bestZone = null, bestDist = Infinity;
    for (const z of zones) {
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < SNAP_RADIUS && d < bestDist) { bestZone = z; bestDist = d; }
    }
    if (bestZone) { x = bestZone.x; y = bestZone.y; }
    const newField = {
      id: 'f'+Math.random().toString(36).slice(2,7),
      page: currentPage, type: dragType, x, y,
      signerIds: signers.length === 1 ? [signers[0].id] : signers.map(s=>s.id),
    };
    setFields(fs => [...fs, newField]);
    setSelectedFieldId(newField.id);
    setSignerPopover({ fieldId: newField.id, screenX: e.clientX, screenY: e.clientY });
    setDragType(null);
    setActiveZone(null);
    setDragHoverPos(null);
  };

  // Jump to next unfilled sign zone
  const jumpToNextSignZone = () => {
    // find first page with a zone that has no field near it
    for (let p = 1; p <= totalPages; p++) {
      for (const z of (SIGN_ZONES[p] || [])) {
        const covered = fields.some(f => f.page === p && Math.hypot(f.x - z.x, f.y - z.y) < 40);
        if (!covered) {
          setCurrentPage(p);
          // scroll canvas into view so zone is visible
          setTimeout(()=>{
            if (canvasRef.current) {
              const scroller = canvasRef.current.closest('[data-canvas-scroll]');
              if (scroller) scroller.scrollTo({ top: Math.max(0, z.y - 120), behavior: 'smooth' });
            }
          }, 50);
          return;
        }
      }
    }
  };

  const selectedField = fields.find(f=>f.id===selectedFieldId);

  const duplicateField = (fid, mode, customPages) => {
    const src = fields.find(f=>f.id===fid);
    if (!src) return;
    let pages = [];
    if (mode==='this') pages = [src.page];
    else if (mode==='all') pages = Array.from({length: totalPages}, (_,i)=>i+1);
    else if (mode==='allButLast') pages = Array.from({length: totalPages-1}, (_,i)=>i+1);
    else if (mode==='last') pages = [totalPages];
    else if (mode==='custom') pages = customPages || [];
    // replace any existing duplicates of this anchor: for demo, just add new ones on pages != src.page
    const newOnes = pages.filter(p=>p!==src.page).map(p => ({
      ...src, id:'f'+Math.random().toString(36).slice(2,7), page:p,
    }));
    setFields(fs => [...fs, ...newOnes]);
    setPagesPopover(null);
  };

  const removeField = (fid) => { setFields(fs => fs.filter(f=>f.id!==fid)); setSelectedFieldId(null); };

  const updateFieldSigners = (fid, signerIds) => {
    setFields(fs => fs.map(f => f.id===fid ? {...f, signerIds} : f));
  };

  const addSignerFromContact = (contact) => {
    if (signers.some(s=>s.contactId===contact.id)) return;
    setSigners(xs => [...xs, { id:'s'+Math.random().toString(36).slice(2,5), contactId:contact.id, name:contact.name, email:contact.email, color:contact.color }]);
  };
  const addBrandNewSigner = (name, email) => {
    const color = ['#F472B6','#7DD3FC','#10B981','#F59E0B','#818CF8'][signers.length % 5];
    const contact = { id:'c'+Date.now(), name, email, color };
    setContacts(cs => [...cs, contact]);
    setSigners(xs => [...xs, { id:'s'+Date.now(), contactId:contact.id, name, email, color }]);
  };

  return (
    <div
      onClick={()=>{ setSignerPopover(null); setPagesPopover(null); setAddSignerOpen(false); }}
      style={{display:'flex', height:'calc(100vh - 56px)', background:'var(--ink-50)', position:'relative', userSelect:'none'}}
    >
      {/* Left rail — field palette */}
      <CollapsibleRail side="left" open={leftOpen} setOpen={setLeftOpen} width={leftW} setWidth={setLeftW} minW={200} maxW={360} title="Fields">
        <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase',padding:'10px 4px 8px'}}>Required fields</div>
        {FIELD_TYPES.filter(f=>f.required).map(f=>(
          <FieldPaletteItem key={f.k} f={f} onDragStart={()=>setDragType(f.k)}/>
        ))}
        <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase',padding:'14px 4px 8px'}}>Optional fields</div>
        {FIELD_TYPES.filter(f=>!f.required).map(f=>(
          <FieldPaletteItem key={f.k} f={f} onDragStart={()=>setDragType(f.k)}/>
        ))}
        <div style={{marginTop:18,padding:'12px 12px',background:'var(--indigo-50)',borderRadius:10,fontSize:12,color:'var(--indigo-800)',lineHeight:1.5}}>
          Drag a field onto the page. You'll pick which signers fill it.
        </div>
      </CollapsibleRail>

      {/* Center canvas */}
      <div data-canvas-scroll="true" style={{flex:1, minWidth:0, overflow:'auto', padding:'24px 0', position:'relative'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:780,margin:'0 auto 16px',padding:'0 24px'}}>
          <Button variant="ghost" icon="arrow-left" size="sm" onClick={onBack}>Back</Button>
          <div style={{display:'inline-flex',alignItems:'center',gap:2,padding:'4px 6px',borderRadius:10,border:'1px solid var(--border-1)',background:'#fff'}}>
            <button onClick={jumpToNextSignZone} title="Jump to next signature line" style={{width:26,height:26,border:'none',background:'transparent',borderRadius:6,cursor:'pointer',color:'var(--fg-2)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
              <Icon name="target" size={14}/>
            </button>
            <span style={{width:1,height:16,background:'var(--border-1)',margin:'0 4px'}}/>
            <button onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} style={{width:26,height:26,border:'none',background:'transparent',borderRadius:6,cursor:'pointer',color:'var(--fg-2)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="chevron-left" size={14}/></button>
            <span style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--fg-2)',padding:'0 6px',minWidth:40,textAlign:'center'}}>{currentPage} / {totalPages}</span>
            <button onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} style={{width:26,height:26,border:'none',background:'transparent',borderRadius:6,cursor:'pointer',color:'var(--fg-2)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><Icon name="chevron-right" size={14}/></button>
          </div>
          <div style={{width:68}}/>
        </div>

        <div
          ref={canvasRef}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onMouseDown={(e)=>{
            // Start marquee selection on background
            if (e.target !== e.currentTarget) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
            setMarquee({x1:sx,y1:sy,x2:sx,y2:sy});
            const onMove_ = (ev) => {
              const r = canvasRef.current.getBoundingClientRect();
              setMarquee(m => m ? {...m, x2: ev.clientX - r.left, y2: ev.clientY - r.top} : m);
            };
            const onUp_ = (ev) => {
              window.removeEventListener('mousemove', onMove_);
              window.removeEventListener('mouseup', onUp_);
              const r = canvasRef.current.getBoundingClientRect();
              const ex = ev.clientX - r.left, ey = ev.clientY - r.top;
              const x1 = Math.min(sx,ex), y1 = Math.min(sy,ey), x2 = Math.max(sx,ex), y2 = Math.max(sy,ey);
              if (Math.abs(x2-x1) < 4 && Math.abs(y2-y1) < 4) { setMarquee(null); return; }
              setFields(curr => {
                const hit = curr.filter(f => {
                  if (f.page !== currentPage) return false;
                  const multi = f.signerIds.length > 1;
                  const fw = (multi ? 132*2+8 : 132), fh = 54;
                  return f.x < x2 && f.x + fw > x1 && f.y < y2 && f.y + fh > y1;
                }).map(f=>f.id);
                setSelectedIds(hit);
                setSelectedFieldId(hit.length===1?hit[0]:null);
                return curr;
              });
              setMarquee(null);
            };
            window.addEventListener('mousemove', onMove_);
            window.addEventListener('mouseup', onUp_);
          }}
          onClick={e=>{ e.stopPropagation(); if (e.target===e.currentTarget){ setSelectedFieldId(null); setSelectedIds([]); setSignerPopover(null); setPagesPopover(null); } }}
          style={{width:560, minHeight:740, background:'#fff', borderRadius:6, boxShadow:'var(--shadow-paper)', padding:'56px 64px', position:'relative', margin:'0 auto', userSelect:'none'}}
        >
          <div style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:500, color:'var(--fg-1)'}}>Master Services Agreement</div>
          <div style={{fontSize:11,color:'var(--fg-3)',fontFamily:'var(--font-mono)',marginTop:4}}>DOC-8F3A-4291 · Page {currentPage} of {totalPages}</div>
          <div style={{height:18}}/>
          {[...Array(currentPage===totalPages ? 8 : 14)].map((_,i)=>(<div key={i} style={{height:6,borderRadius:2,background:'var(--ink-150)',margin:'8px 0',width:`${70+(i*7)%30}%`}}/>))}

          {/* Explicit signature lines on final page — the semantic anchor */}
          {currentPage===totalPages && (
            <div style={{position:'absolute', left:64, right:64, top:540, display:'flex', flexDirection:'column', gap:28}}>
              <div style={{display:'flex', gap:12}}>
                <div style={{flex:1}}>
                  <div style={{borderBottom:'1.5px solid var(--ink-300)', height:54}}/>
                  <div style={{fontSize:10, fontFamily:'var(--font-mono)', color:'var(--fg-3)', marginTop:6, letterSpacing:'0.04em'}}>CLIENT SIGNATURE</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{borderBottom:'1.5px solid var(--ink-300)', height:54}}/>
                  <div style={{fontSize:10, fontFamily:'var(--font-mono)', color:'var(--fg-3)', marginTop:6, letterSpacing:'0.04em'}}>COUNTERPARTY SIGNATURE</div>
                </div>
              </div>
            </div>
          )}

          {/* Sign zones — semantic drop targets. Highlighted when hovered during drag. */}
          {(SIGN_ZONES[currentPage] || []).map((z, i) => {
            const isActive = activeZone && activeZone.x===z.x && activeZone.y===z.y;
            const show = dragType || draggingId || isActive;
            if (!show) return null;
            return (
              <div key={i} style={{
                position:'absolute', left:z.x, top:z.y, width:z.w, height:z.h,
                border: `1.5px dashed ${isActive?'var(--success-500)':'var(--indigo-400)'}`,
                background: isActive?'rgba(16,185,129,0.10)':'rgba(99,102,241,0.06)',
                borderRadius:8, pointerEvents:'none', zIndex:1,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:11, fontWeight:600, color: isActive?'var(--success-700)':'var(--indigo-700)',
                transition:'background 120ms, border-color 120ms'
              }}>
                {isActive ? '✓ Snap here' : z.label}
              </div>
            );
          })}

          {/* Ghost preview while dragging from palette */}
          {dragType && dragHoverPos && (
            <div style={{position:'absolute', left:dragHoverPos.x, top:dragHoverPos.y, width:132, height:54, border:'1.5px dashed var(--indigo-500)', background:'rgba(99,102,241,0.12)', borderRadius:6, pointerEvents:'none', zIndex:3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'var(--indigo-700)'}}>
              {FIELD_TYPES.find(t=>t.k===dragType)?.l}
            </div>
          )}

          {/* Alignment guides (magenta) */}
          {guides && guides.v && guides.v.map((x,i)=>(
            <div key={'gv'+i} style={{position:'absolute', left:x, top:0, bottom:0, width:1, background:'#EC4899', pointerEvents:'none', zIndex:9, boxShadow:'0 0 0 0.5px #EC4899'}}/>
          ))}
          {guides && guides.h && guides.h.map((y,i)=>(
            <div key={'gh'+i} style={{position:'absolute', top:y, left:0, right:0, height:1, background:'#EC4899', pointerEvents:'none', zIndex:9}}/>
          ))}

          {/* Fields on current page */}
          {fields.filter(f=>f.page===currentPage).map(field => (
            <PlacedField
              key={field.id}
              field={field}
              signers={signers}
              selected={selectedFieldId===field.id || selectedIds.includes(field.id)}
              inGroup={selectedIds.includes(field.id) && selectedIds.length>1}
              canvasRef={canvasRef}
              onSelect={(e)=>{
                e.stopPropagation();
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  setSelectedIds(xs => xs.includes(field.id) ? xs.filter(x=>x!==field.id) : [...xs, field.id]);
                  setSelectedFieldId(null);
                } else if (!selectedIds.includes(field.id)) {
                  setSelectedFieldId(field.id); setSelectedIds([]);
                }
                setSignerPopover(null); setPagesPopover(null);
              }}
              onOpenSignerPopover={(e)=>{ e.stopPropagation(); setSignerPopover({fieldId:field.id, screenX:e.clientX, screenY:e.clientY}); }}
              onOpenPagesPopover={(e)=>{ e.stopPropagation(); setPagesPopover({fieldId:field.id, screenX:e.clientX, screenY:e.clientY}); }}
              onRemove={()=>removeField(field.id)}
              onMove={(fid,nx,ny)=>{
                const ids = selectedIds.includes(fid) && selectedIds.length>1 ? selectedIds : [fid];
                const page = field.page;
                // Snap/align the anchor field
                const snap = snapAndAlign(fid, nx, ny, page, 132, 54);
                setActiveZone(snap.zone);
                setGuides(snap.guides);
                setFields(fs => {
                  if (ids.length===1) return fs.map(f=>f.id===fid?{...f,x:snap.x,y:snap.y}:f);
                  const anchor = fs.find(f=>f.id===fid);
                  const dx = snap.x - anchor.x, dy = snap.y - anchor.y;
                  return fs.map(f => ids.includes(f.id) ? {...f, x:f.x+dx, y:f.y+dy} : f);
                });
              }}
              onDragStart={()=>setDraggingId(field.id)}
              onDragEnd={()=>{ setDraggingId(null); setGuides(null); setActiveZone(null); }}
              isDragging={draggingId===field.id || (selectedIds.includes(field.id) && selectedIds.length>1 && draggingId && selectedIds.includes(draggingId))}
            />
          ))}

          {/* Marquee */}
          {marquee && (
            <div style={{position:'absolute', left:Math.min(marquee.x1,marquee.x2), top:Math.min(marquee.y1,marquee.y2), width:Math.abs(marquee.x2-marquee.x1), height:Math.abs(marquee.y2-marquee.y1), border:'1.5px dashed var(--indigo-500)', background:'rgba(99,102,241,0.08)', borderRadius:4, pointerEvents:'none', zIndex:10}}/>
          )}
          {selectedIds.length>1 && !marquee && (
            <div style={{position:'absolute', top:10, right:10, padding:'6px 8px 6px 12px', background:'var(--ink-900)', color:'#fff', borderRadius:999, fontSize:12, fontWeight:600, boxShadow:'var(--shadow-md)', display:'inline-flex', alignItems:'center', gap:8, zIndex:12}}>
              <Icon name="link" size={12}/> {selectedIds.length} linked — move together
              <button onClick={(e)=>{ e.stopPropagation(); setSelectedIds([]); setSelectedFieldId(null); }} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',padding:'3px 9px',borderRadius:999,fontSize:11,fontWeight:600,cursor:'pointer'}}>Unlink</button>
            </div>
          )}
        </div>

        {/* Page thumbnails */}
        <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:18}}>
          {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
            <div key={p} onClick={()=>setCurrentPage(p)} style={{width:34,height:44,borderRadius:4,background:'#fff',border:`1.5px solid ${currentPage===p?'var(--indigo-600)':'var(--border-1)'}`,display:'flex',alignItems:'flex-end',justifyContent:'center',fontSize:10,fontFamily:'var(--font-mono)',color:currentPage===p?'var(--indigo-700)':'var(--fg-3)',padding:'0 0 3px',cursor:'pointer',position:'relative'}}>
              {p}
              {fields.filter(f=>f.page===p).length>0 && <span style={{position:'absolute',top:3,right:3,width:6,height:6,borderRadius:999,background:'var(--indigo-600)'}}/>}
            </div>
          ))}
        </div>
      </div>

      {/* Right rail — signers (compact) + fields summary + Send CTA pinned to bottom */}
      <CollapsibleRail side="right" open={rightOpen} setOpen={setRightOpen} width={rightW} setWidth={setRightW} minW={280} maxW={440} title="Ready to send" noPad>
        <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
          <div style={{flex:1,overflow:'auto',padding:'14px 16px'}}>
            {/* Signers: compact chips (like reference) */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--fg-1)'}}>Signers</div>
              <span style={{fontSize:11,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{signers.length}</span>
            </div>
            <div onClick={(e)=>e.stopPropagation()} style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16,position:'relative'}}>
              {signers.map(s=>(
                <span key={s.id} title={`${s.name} · ${s.email}`} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px 4px 4px',borderRadius:999,background:'#fff',border:'1px solid var(--border-1)'}}>
                  <span style={{width:22,height:22,borderRadius:999,background:s.color,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>{s.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</span>
                  <span style={{fontSize:12,fontWeight:600,color:'var(--fg-1)'}}>{s.name.split(' ')[0]}</span>
                </span>
              ))}
              <button onClick={()=>setAddSignerOpen(v=>!v)} title="Add signer" style={{width:30,height:30,borderRadius:999,border:'1.5px dashed var(--border-2)',background:'#fff',color:'var(--fg-3)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                <Icon name="plus" size={14}/>
              </button>
              {addSignerOpen && (
                <AddSignerDropdown
                  contacts={contacts}
                  existing={signers.map(s=>s.contactId)}
                  onPick={(c)=>{ addSignerFromContact(c); setAddSignerOpen(false); }}
                  onCreate={(name,email)=>{ addBrandNewSigner(name,email); setAddSignerOpen(false); }}
                  onClose={()=>setAddSignerOpen(false)}
                />
              )}
            </div>

            {/* Fields summary */}
            <div style={{fontSize:12,fontWeight:600,color:'var(--fg-1)',margin:'4px 0 10px'}}>Fields placed</div>
            {fields.length===0 ? (
              <div style={{padding:'14px 14px',border:'1px dashed var(--border-2)',borderRadius:12,fontSize:12,color:'var(--fg-3)',lineHeight:1.5,background:'var(--ink-50)'}}>
                Drag a field from the left onto the page to get started.
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {fields.map(f => {
                  const t = FIELD_TYPES.find(x=>x.k===f.type);
                  const assigned = f.signerIds.map(id => signers.find(s=>s.id===id)).filter(Boolean);
                  return (
                    <div key={f.id} onClick={(e)=>{e.stopPropagation(); setCurrentPage(f.page); setSelectedFieldId(f.id);}} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10,background:selectedFieldId===f.id?'var(--indigo-50)':'#fff',border:`1px solid ${selectedFieldId===f.id?'var(--indigo-300)':'var(--border-1)'}`,cursor:'pointer'}}>
                      <Icon name={t?.i||'pen-tool'} size={14} style={{color:'var(--indigo-600)',flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0,fontSize:12,fontWeight:600,color:'var(--fg-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t?.l||'Field'}</div>
                      <span style={{fontSize:10,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>p{f.page}</span>
                      <div style={{display:'flex',marginLeft:2}}>
                        {assigned.slice(0,3).map((s,i)=>(
                          <span key={s.id} style={{width:18,height:18,borderRadius:999,background:s.color,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,marginLeft:i===0?0:-5,border:'1.5px solid #fff'}}>{s.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pinned action footer */}
          <div style={{borderTop:'1px solid var(--border-1)',padding:'14px 16px',background:'linear-gradient(180deg, var(--ink-50) 0%, #fff 100%)'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,fontSize:12,color: fields.length?'var(--success-700)':'var(--fg-3)'}}>
              <Icon name={fields.length?'check-circle-2':'circle-dashed'} size={14}/>
              {fields.length
                ? <span><b style={{color:'var(--fg-1)'}}>{fields.length}</b> field{fields.length===1?'':'s'} · {signers.length} signer{signers.length===1?'':'s'}</span>
                : <span>Place at least one field to enable sending</span>}
            </div>
            <button
              disabled={!fields.length}
              onClick={onNext}
              style={{
                width:'100%', padding:'14px 18px', borderRadius:14, border:'none',
                background: fields.length ? 'var(--indigo-600)' : 'var(--ink-200)',
                color: fields.length ? '#fff' : 'var(--fg-4)',
                fontSize:15, fontWeight:700, fontFamily:'var(--font-sans)',
                cursor: fields.length ? 'pointer' : 'not-allowed',
                display:'inline-flex', alignItems:'center', justifyContent:'center', gap:10,
                boxShadow: fields.length ? '0 6px 16px rgba(79,70,229,0.28)' : 'none',
                transition:'background 160ms, box-shadow 160ms, transform 80ms'
              }}
              onMouseDown={(e)=>{ if(fields.length) e.currentTarget.style.transform='translateY(1px)'; }}
              onMouseUp={(e)=>{ e.currentTarget.style.transform='translateY(0)'; }}
              onMouseLeave={(e)=>{ e.currentTarget.style.transform='translateY(0)'; }}
            >
              Send to Sign
              <Icon name="arrow-right" size={16}/>
            </button>
            <div style={{display:'flex',justifyContent:'center',marginTop:10}}>
              <button style={{background:'transparent',border:'none',color:'var(--fg-3)',fontSize:12,fontWeight:500,cursor:'pointer',padding:'4px 6px'}}>Save as draft</button>
            </div>
          </div>
        </div>
      </CollapsibleRail>

      {/* Popovers */}
      {signerPopover && selectedField && (
        <SelectSignersPopover
          pos={signerPopover}
          signers={signers}
          selectedIds={selectedField.signerIds}
          onApply={(ids)=>{ updateFieldSigners(selectedField.id, ids); setSignerPopover(null); }}
          onCancel={()=>setSignerPopover(null)}
        />
      )}
      {pagesPopover && selectedField && (
        <PlaceOnPagesPopover
          pos={pagesPopover}
          totalPages={totalPages}
          currentPage={selectedField.page}
          onApply={(mode,customPages)=>duplicateField(selectedField.id, mode, customPages)}
          onCancel={()=>setPagesPopover(null)}
        />
      )}
    </div>
  );
}

const btnGhost = {border:'none', background:'transparent', padding:4, borderRadius:6, cursor:'pointer', color:'var(--fg-2)', display:'inline-flex', alignItems:'center'};

/* ----- Palette draggable item ----- */
function FieldPaletteItem({ f, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e)=>{ e.dataTransfer.effectAllowed='copy'; onDragStart(); }}
      style={{display:'flex',alignItems:'center',gap:10,padding:'10px 10px',borderRadius:10,fontSize:13,fontWeight:500,color:'var(--fg-2)',cursor:'grab',background:'#fff',border:'1px solid var(--border-1)',marginBottom:6}}
    >
      <Icon name={f.i} size={16} style={{color:'var(--indigo-600)'}}/>{f.l}
      <span style={{flex:1}}/>
      <Icon name="grip-vertical" size={14} style={{color:'var(--fg-4)'}}/>
    </div>
  );
}

/* ----- Placed field w/ overlay controls ----- */
function PlacedField({ field, signers, selected, inGroup, onSelect, onOpenSignerPopover, onOpenPagesPopover, onRemove, onMove, canvasRef, onDragStart, onDragEnd, isDragging }) {
  const assigned = field.signerIds.map(id => signers.find(s=>s.id===id)).filter(Boolean);
  const multi = assigned.length > 1;
  const width = 132, height = 54;
  const bg = assigned[0] ? assigned[0].color+'2A' : 'rgba(238,242,255,0.6)';
  const dragRef = useRef(null);

  const handleMouseDown = (e) => {
    // Ignore drags starting on buttons / interactive controls
    if (e.target.closest('button')) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect && onSelect(e);
    onDragStart && onDragStart();
    const startX = e.clientX, startY = e.clientY;
    const origX = field.x, origY = field.y;
    const rect = canvasRef && canvasRef.current ? canvasRef.current.getBoundingClientRect() : null;
    const totalW = multi ? width*2 + 8 : width;
    let moved = false;
    const onMove_ = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.abs(dx)+Math.abs(dy) > 3) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (rect) {
        nx = Math.max(0, Math.min(nx, rect.width - totalW));
        ny = Math.max(0, Math.min(ny, rect.height - height));
      }
      onMove && onMove(field.id, nx, ny);
    };
    const onUp_ = () => {
      window.removeEventListener('mousemove', onMove_);
      window.removeEventListener('mouseup', onUp_);
      onDragEnd && onDragEnd();
    };
    window.addEventListener('mousemove', onMove_);
    window.addEventListener('mouseup', onUp_);
  };

  return (
    <div
      ref={dragRef}
      onMouseDown={handleMouseDown}
      onClick={(e)=>{ e.stopPropagation(); onSelect && onSelect(e); }}
      style={{position:'absolute', left:field.x, top:field.y, width: multi ? width*2 + 8 : width, height, cursor: selected?'grabbing':'grab', zIndex: selected?5:2, userSelect:'none', opacity: isDragging ? 0.55 : 1, transition: isDragging ? 'none' : 'opacity 120ms'}}
    >
      {selected && !inGroup && (
        <>
          {/* Top-left bubble: "Place field" prompt / signers */}
          <div onClick={onOpenSignerPopover} style={{position:'absolute',top:-32,left:0,padding:'5px 10px',background:'var(--ink-900)',color:'#fff',borderRadius:8,fontSize:12,fontWeight:600,display:'inline-flex',alignItems:'center',gap:6,boxShadow:'var(--shadow-md)',whiteSpace:'nowrap',cursor:'pointer'}}>
            <Icon name="users" size={12}/>Assign signers
            <Icon name="chevron-down" size={12}/>
          </div>
          {/* Top-right: duplicate + delete */}
          <div style={{position:'absolute',top:-30,right:0,display:'flex',gap:4}}>
            <button title="Duplicate to pages" onClick={onOpenPagesPopover} style={{width:24,height:24,borderRadius:6,border:'none',background:'var(--indigo-600)',color:'#fff',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--shadow-md)'}}><Icon name="copy" size={12}/></button>
            <button title="Delete" onClick={(e)=>{e.stopPropagation(); onRemove();}} style={{width:24,height:24,borderRadius:6,border:'none',background:'var(--danger-500)',color:'#fff',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--shadow-md)'}}><Icon name="x" size={12}/></button>
          </div>
          {/* Resize halo */}
          <div style={{position:'absolute',inset:-4,border:'1.5px solid var(--indigo-500)',borderRadius:8,pointerEvents:'none'}}/>
          {[[-5,-5],[-5,'auto'],['auto',-5],['auto','auto']].map((pos,i)=>(
            <div key={i} style={{position:'absolute',top:pos[0]==='auto'?'auto':pos[0],bottom:pos[0]==='auto'?-5:'auto',left:pos[1]==='auto'?'auto':pos[1],right:pos[1]==='auto'?-5:'auto',width:10,height:10,borderRadius:999,background:'#fff',border:'1.5px solid var(--indigo-500)'}}/>
          ))}
        </>
      )}
      {inGroup && (
        <div style={{position:'absolute',inset:-3,border:'1.5px dashed var(--indigo-500)', background:'rgba(99,102,241,0.06)', borderRadius:8,pointerEvents:'none'}}/>
      )}
      <div style={{display:'flex',gap:8,width:'100%',height:'100%'}}>
        {(multi ? assigned : [assigned[0] || null]).map((s,i) => (
          <div key={i} style={{flex:1,background: s?s.color+'2A':'var(--indigo-50)', border:`1.5px solid ${s?s.color:'var(--indigo-400)'}`, borderRadius:6, padding:'8px 10px', display:'flex',flexDirection:'column',justifyContent:'space-between', position:'relative'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,color:'var(--fg-1)'}}>
              <Icon name={FIELD_TYPES.find(t=>t.k===field.type)?.i || 'pen-tool'} size={12} style={{color:s?s.color:'var(--indigo-600)'}}/>
              {FIELD_TYPES.find(t=>t.k===field.type)?.l || 'Field'}
            </div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--fg-3)',letterSpacing:'0.04em'}}>SIGN ID (UUID)</div>
            {s && <span style={{position:'absolute',top:-6,right:-6,width:16,height:16,borderRadius:999,background:s.color,color:'#fff',fontSize:9,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{s.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----- Select signers popover (multi-select) ----- */
function SelectSignersPopover({ pos, signers, selectedIds, onApply, onCancel }) {
  const [ids, setIds] = useState(selectedIds || []);
  const toggle = (id) => setIds(xs => xs.includes(id) ? xs.filter(x=>x!==id) : [...xs, id]);
  return (
    <PopoverShell onCancel={onCancel}>
      <div style={{fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,color:'var(--fg-1)',textAlign:'center',marginBottom:20}}>Select signers</div>
      <div style={{display:'flex',flexDirection:'column',gap:12,padding:'0 8px'}}>
        {signers.map(s => (
          <label key={s.id} style={{display:'flex',alignItems:'center',gap:12,padding:'6px 4px',cursor:'pointer'}}>
            <span style={{width:22,height:22,borderRadius:6,border:`1.5px solid ${ids.includes(s.id)?'var(--success-500)':'var(--border-2)'}`,background:ids.includes(s.id)?'var(--success-500)':'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
              {ids.includes(s.id) && <Icon name="check" size={14}/>}
            </span>
            <input type="checkbox" checked={ids.includes(s.id)} onChange={()=>toggle(s.id)} style={{display:'none'}}/>
            <span onClick={()=>toggle(s.id)} style={{width:10,height:10,borderRadius:999,background:s.color}}/>
            <span onClick={()=>toggle(s.id)} style={{fontSize:16,color:'var(--fg-1)',fontWeight:500}}>{s.name}</span>
          </label>
        ))}
      </div>
      <div style={{borderTop:'1px solid var(--border-1)',margin:'20px -24px 0',padding:'14px 24px 0',display:'flex',justifyContent:'flex-end',gap:14,alignItems:'center'}}>
        <button onClick={onCancel} style={{background:'transparent',border:'none',color:'var(--fg-2)',fontSize:14,fontWeight:600,textDecoration:'underline',textUnderlineOffset:3,cursor:'pointer',padding:'8px 6px'}}>Cancel</button>
        <Button variant="primary" onClick={()=>onApply(ids)}>Apply</Button>
      </div>
    </PopoverShell>
  );
}

/* ----- Place on pages popover (radio + custom) ----- */
function PlaceOnPagesPopover({ pos, totalPages, currentPage, onApply, onCancel }) {
  const [mode, setMode] = useState('all');
  const [custom, setCustom] = useState('');
  const hints = {
    this:'Keep it only on this page.',
    all:'Create a linked copy on every page of the document.',
    allButLast:'Copy to every page except the last.',
    last:'Place only on the final page.',
    custom:'Comma-separated page numbers, e.g. 1, 3, 5.',
  };
  const opts = [
    {k:'this', l:'Only this page'},
    {k:'all', l:'All pages'},
    {k:'allButLast', l:'All pages but last'},
    {k:'last', l:'Last page'},
    {k:'custom', l:'Custom pages'},
  ];
  const parseCustom = () => custom.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n) && n>=1 && n<=totalPages);
  return (
    <PopoverShell onCancel={onCancel}>
      <div style={{fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,color:'var(--fg-1)',textAlign:'center',marginBottom:20}}>Place on</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 220px',gap:24,alignItems:'flex-start'}}>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {opts.map(o => (
            <label key={o.k} onClick={()=>setMode(o.k)} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',padding:'4px 0'}}>
              <span style={{width:20,height:20,borderRadius:999,border:`1.75px solid ${mode===o.k?'var(--success-500)':'var(--border-2)'}`,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {mode===o.k && <span style={{width:10,height:10,borderRadius:999,background:'var(--success-500)'}}/>}
              </span>
              <span style={{fontSize:15,color:mode===o.k?'var(--fg-1)':'var(--fg-2)',fontWeight:mode===o.k?600:500}}>{o.l}</span>
            </label>
          ))}
          {mode==='custom' && (
            <input autoFocus value={custom} onChange={e=>setCustom(e.target.value)} placeholder="e.g. 1, 3, 5"
              style={{marginTop:4,padding:'10px 12px',border:'1px solid var(--border-1)',borderRadius:10,fontSize:14,fontFamily:'var(--font-sans)'}}/>
          )}
          <div style={{fontSize:12,color:'var(--fg-3)',marginTop:10,lineHeight:1.5}}>Current page: <b style={{color:'var(--fg-1)',fontFamily:'var(--font-mono)'}}>{currentPage}</b> of {totalPages}</div>
        </div>
        <div style={{background:'var(--indigo-50)',border:'1px solid var(--indigo-200)',borderRadius:10,padding:'14px 16px',fontSize:13,color:'var(--indigo-800)',lineHeight:1.55}}>
          {hints[mode]}
        </div>
      </div>
      <div style={{borderTop:'1px solid var(--border-1)',margin:'20px -24px 0',padding:'14px 24px 0',display:'flex',justifyContent:'flex-end',gap:14,alignItems:'center'}}>
        <button onClick={onCancel} style={{background:'transparent',border:'none',color:'var(--fg-2)',fontSize:14,fontWeight:600,textDecoration:'underline',textUnderlineOffset:3,cursor:'pointer',padding:'8px 6px'}}>Cancel</button>
        <Button variant="primary" onClick={()=>onApply(mode, mode==='custom'?parseCustom():undefined)}>Apply</Button>
      </div>
    </PopoverShell>
  );
}

function PopoverShell({ children, onCancel }) {
  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,zIndex:90,background:'rgba(15,23,42,0.35)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{width:560,maxWidth:'100%',background:'#fff',borderRadius:20,boxShadow:'var(--shadow-xl)',padding:'32px 24px 20px'}}>
        {children}
      </div>
    </div>
  );
}

/* ----- Add signer dropdown (from contacts + inline create) ----- */
function AddSignerDropdown({ contacts, existing, onPick, onCreate, onClose }) {
  const [q, setQ] = useState('');
  const filtered = contacts.filter(c => !existing.includes(c.id) && (c.name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase())));
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
  const noExactMatch = !contacts.some(c => c.email.toLowerCase() === q.trim().toLowerCase());
  return (
    <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:6,background:'#fff',border:'1px solid var(--border-1)',borderRadius:12,boxShadow:'var(--shadow-lg)',zIndex:30,overflow:'hidden'}}>
      <div style={{padding:10,borderBottom:'1px solid var(--border-1)'}}>
        <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search contacts or type an email…"
          style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border-1)',borderRadius:8,fontSize:13,fontFamily:'var(--font-sans)',outline:'none'}}/>
      </div>
      <div style={{maxHeight:220,overflow:'auto'}}>
        {filtered.slice(0,8).map(c => (
          <div key={c.id} onClick={()=>onPick(c)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',cursor:'pointer'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--ink-50)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{width:24,height:24,borderRadius:999,background:c.color,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600}}>{c.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--fg-1)'}}>{c.name}</div>
              <div style={{fontSize:12,color:'var(--fg-3)'}}>{c.email}</div>
            </div>
          </div>
        ))}
        {filtered.length===0 && !isEmail && (
          <div style={{padding:'14px 12px',fontSize:13,color:'var(--fg-3)'}}>Type a name or email to search your contacts.</div>
        )}
      </div>
      {isEmail && noExactMatch && (
        <div style={{borderTop:'1px solid var(--border-1)',padding:10,background:'var(--indigo-50)'}}>
          <div style={{fontSize:12,color:'var(--indigo-800)',marginBottom:6}}>Not in your contacts.</div>
          <Button variant="primary" size="sm" icon="user-plus" style={{width:'100%',justifyContent:'center'}} onClick={()=>onCreate(q.trim().split('@')[0], q.trim())}>Add "{q.trim()}" as new contact</Button>
        </div>
      )}
    </div>
  );
}

/* ----- Collapsible, resizable rail ----- */
function CollapsibleRail({ side, open, setOpen, width, setWidth, minW, maxW, title, children, noPad }) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      setWidth(w => {
        const delta = side==='right' ? -e.movementX : e.movementX;
        return Math.max(minW, Math.min(maxW, w + delta));
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, side, setWidth, minW, maxW]);

  if (!open) {
    return (
      <div style={{width:40,background:'#fff', [side==='left'?'borderRight':'borderLeft']:'1px solid var(--border-1)',display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 0',flexShrink:0}}>
        <button onClick={()=>setOpen(true)} title={`Open ${title.toLowerCase()}`}
          style={{border:'1px solid var(--border-1)',background:'#fff',width:28,height:28,borderRadius:8,cursor:'pointer',color:'var(--fg-2)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
          <Icon name={side==='left'?'chevron-right':'chevron-left'} size={14}/>
        </button>
        <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',fontSize:11,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--fg-3)',marginTop:16}}>{title}</div>
      </div>
    );
  }

  return (
    <div onClick={e=>e.stopPropagation()} style={{width, background:'#fff', [side==='left'?'borderRight':'borderLeft']:'1px solid var(--border-1)',display:'flex',flexDirection:'column',flexShrink:0,position:'relative',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:'1px solid var(--border-1)'}}>
        <div style={{fontFamily:'var(--font-serif)',fontSize:18,fontWeight:500,color:'var(--fg-1)'}}>{title}</div>
        <button onClick={()=>setOpen(false)} title="Collapse" style={{border:'none',background:'transparent',padding:4,borderRadius:6,cursor:'pointer',color:'var(--fg-3)',display:'inline-flex',alignItems:'center'}}>
          <Icon name={side==='left'?'chevron-left':'chevron-right'} size={16}/>
        </button>
      </div>
      <div style={{flex:1,overflow:'auto',padding: noPad ? 0 : '14px 16px'}}>{children}</div>
      {/* Resize handle */}
      <div onMouseDown={()=>setDragging(true)} style={{position:'absolute', top:0, bottom:0, [side==='left'?'right':'left']:-3, width:6, cursor:'col-resize', zIndex:5}}>
        <div style={{position:'absolute',top:'50%',left:2,transform:'translateY(-50%)',width:2,height:32,borderRadius:999,background: dragging?'var(--indigo-500)':'transparent'}}/>
      </div>
    </div>
  );
}

/* ----- Screen 3: Sign & Send (type-your-name only — draw/upload not implemented) ----- */
function SignScreen({ onDone, onBack }) {
  const [name, setName] = useState('Jamie Okonkwo');
  return (
    <div style={{maxWidth:720, margin:'0 auto', padding:'48px 24px 80px'}}>
      <Button variant="ghost" icon="arrow-left" size="sm" onClick={onBack}>Back</Button>
      <div style={{height:16}}/>
      <div style={{fontFamily:'var(--font-serif)', fontSize:36, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em'}}>Put your name to it</div>
      <div style={{fontSize:14, color:'var(--fg-3)', marginTop:8}}>Type your name. We'll render it as a signature.</div>
      <div style={{marginTop:28, background:'#fff', border:'1px solid var(--border-1)', borderRadius:20, padding:'40px 28px', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:20}}>
        <SignatureMark name={name} size={56}/>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={{padding:'10px 14px', border:'1px solid var(--border-1)', borderRadius:10, fontFamily:'var(--font-sans)', fontSize:14, width:280, textAlign:'center'}}/>
      </div>
      <div style={{marginTop:24, display:'flex', justifyContent:'flex-end'}}>
        <Button variant="primary" icon="pen-tool" onClick={onDone} disabled={!name.trim()}>Sign and send</Button>
      </div>
    </div>
  );
}

function SentScreen({ onReset }) {
  return (
    <div style={{maxWidth:560, margin:'0 auto', padding:'80px 24px', textAlign:'center'}}>
      <div style={{width:72,height:72,borderRadius:999,background:'var(--success-50)',color:'var(--success-700)',display:'inline-flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}><Icon name="check-circle-2" size={32}/></div>
      <div style={{fontFamily:'var(--font-serif)',fontSize:40,fontWeight:500,letterSpacing:'-0.02em',color:'var(--fg-1)',lineHeight:1.1}}>Sealed.</div>
      <div style={{fontSize:16,color:'var(--fg-3)',marginTop:12}}>Sent to your signers. We'll let you know when they complete their part.</div>
      <div style={{marginTop:24}}><Button variant="primary" onClick={onReset}>Back to documents</Button></div>
    </div>
  );
}

/* ============================================================
   CONTACTS SCREEN
   ============================================================ */
function ContactsScreen({ contacts, setContacts }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // {id?, name, email}
  const [showForm, setShowForm] = useState(false);
  const filtered = contacts.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase()));

  const save = (c) => {
    if (c.id) setContacts(xs => xs.map(x => x.id===c.id ? {...x, ...c} : x));
    else {
      const color = ['#F472B6','#7DD3FC','#10B981','#F59E0B','#818CF8','#EC4899'][contacts.length % 6];
      setContacts(xs => [...xs, {...c, id:'c'+Date.now(), color}]);
    }
    setShowForm(false); setEditing(null);
  };
  const remove = (id) => setContacts(xs => xs.filter(x=>x.id!==id));

  return (
    <div style={{display:'flex'}} data-screen-label="Contacts">
      <LeftRail active="sent"/>
      <div style={{flex:1, padding:'40px 48px 80px', maxWidth:1200, margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:28}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase'}}>Contacts</div>
            <div style={{fontFamily:'var(--font-serif)',fontSize:40,fontWeight:500,color:'var(--fg-1)',letterSpacing:'-0.02em',marginTop:4}}>People you send to</div>
            <div style={{fontSize:14,color:'var(--fg-3)',marginTop:6}}>Saved contacts auto-complete when you add signers to a document.</div>
          </div>
          <Button variant="primary" icon="user-plus" onClick={()=>{setEditing({name:'',email:''});setShowForm(true);}}>New contact</Button>
        </div>

        <div style={{display:'flex',gap:10,marginBottom:18}}>
          <div style={{flex:1,display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#fff',border:'1px solid var(--border-1)',borderRadius:12}}>
            <Icon name="search" size={16} style={{color:'var(--fg-3)'}}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name or email…" style={{border:'none',outline:'none',background:'transparent',flex:1,fontSize:14,fontFamily:'var(--font-sans)',color:'var(--fg-1)'}}/>
            <span style={{fontSize:12,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{filtered.length} of {contacts.length}</span>
          </div>
        </div>

        <div style={{background:'#fff',border:'1px solid var(--border-1)',borderRadius:16,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'1.2fr 1.4fr 160px 80px',padding:'12px 20px',background:'var(--ink-50)',borderBottom:'1px solid var(--border-1)',fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase'}}>
            <div>Name</div><div>Email</div><div>Last used</div><div></div>
          </div>
          {filtered.map((c,i) => (
            <div key={c.id} style={{display:'grid',gridTemplateColumns:'1.2fr 1.4fr 160px 80px',padding:'14px 20px',borderBottom:i<filtered.length-1?'1px solid var(--border-1)':'none',alignItems:'center'}}>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <span style={{width:32,height:32,borderRadius:999,background:c.color,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600}}>{c.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</span>
                <span style={{fontWeight:600,color:'var(--fg-1)'}}>{c.name}</span>
              </div>
              <div style={{color:'var(--fg-2)',fontSize:14}}>{c.email}</div>
              <div style={{fontSize:13,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{['Apr 20','Apr 18','Apr 14','Apr 11','Mar 28'][i%5]}</div>
              <div style={{textAlign:'right',display:'flex',gap:6,justifyContent:'flex-end'}}>
                <button onClick={()=>{setEditing(c);setShowForm(true);}} style={{border:'1px solid var(--border-1)',background:'#fff',padding:'6px 10px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,color:'var(--fg-2)'}}>Edit</button>
                <button onClick={()=>remove(c.id)} style={{border:'1px solid #FECACA',background:'#fff',padding:'6px 8px',borderRadius:8,cursor:'pointer',color:'var(--danger-700)'}}><Icon name="trash-2" size={14}/></button>
              </div>
            </div>
          ))}
          {filtered.length===0 && (
            <div style={{padding:'48px 20px',textAlign:'center',color:'var(--fg-3)'}}>
              <div style={{fontSize:15,marginBottom:12}}>No contacts match "{q}".</div>
              <Button variant="secondary" icon="user-plus" onClick={()=>{setEditing({name:q.split('@')[0]||'',email:q.includes('@')?q:''});setShowForm(true);}}>Add as new contact</Button>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <PopoverShell onCancel={()=>{setShowForm(false);setEditing(null);}}>
          <div style={{fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,color:'var(--fg-1)',textAlign:'center',marginBottom:20}}>{editing?.id?'Edit contact':'New contact'}</div>
          <div style={{display:'flex',flexDirection:'column',gap:14,padding:'0 8px'}}>
            <TextField label="Full name" value={editing?.name||''} onChange={v=>setEditing(e=>({...e,name:v}))} placeholder="e.g. Ana Torres"/>
            <TextField label="Email" value={editing?.email||''} onChange={v=>setEditing(e=>({...e,email:v}))} placeholder="ana@example.com"/>
          </div>
          <div style={{borderTop:'1px solid var(--border-1)',margin:'20px -24px 0',padding:'14px 24px 0',display:'flex',justifyContent:'flex-end',gap:14,alignItems:'center'}}>
            <button onClick={()=>{setShowForm(false);setEditing(null);}} style={{background:'transparent',border:'none',color:'var(--fg-2)',fontSize:14,fontWeight:600,textDecoration:'underline',textUnderlineOffset:3,cursor:'pointer',padding:'8px 6px'}}>Cancel</button>
            <Button variant="primary" onClick={()=>editing?.name && editing?.email && save(editing)}>{editing?.id?'Save changes':'Add contact'}</Button>
          </div>
        </PopoverShell>
      )}
    </div>
  );
}

Object.assign(window, { TopNav, LeftRail, UploadScreen, PlaceFieldsScreen, SignScreen, SentScreen, ContactsScreen, useContacts });
