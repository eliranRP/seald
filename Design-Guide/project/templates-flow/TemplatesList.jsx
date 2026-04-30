/* @jsx React.createElement */
/* Sealed — Templates list. Reuses TopNav + LeftRail from the signing app. */
const { useState: useStateT, useMemo: useMemoT } = React;

// Pre-saved field layouts for each template (positions captured on the example PDF).
const TEMPLATE_FIELDS = {
  'TPL-AC04': [
    { type:'initial',   pageRule:'all',     x: 522, y: 50 },
    { type:'date',      pageRule:'last',    x: 60,  y: 488 },
    { type:'signature', pageRule:'last',    x: 60,  y: 540 },
    { type:'signature', pageRule:'last',    x: 320, y: 540 },
    { type:'text',      pageRule:'last',    x: 60,  y: 612, label:'Print name' },
    { type:'text',      pageRule:'last',    x: 320, y: 612, label:'Print name' },
    { type:'text',      pageRule:'last',    x: 60,  y: 672, label:'Title' },
    { type:'text',      pageRule:'last',    x: 320, y: 672, label:'Title' },
  ],
  'TPL-7B12': [
    { type:'initial',   pageRule:'allButLast', x: 522, y: 50 },
    { type:'signature', pageRule:'last',       x: 60,  y: 540 },
    { type:'signature', pageRule:'last',       x: 320, y: 540 },
    { type:'date',      pageRule:'last',       x: 60,  y: 612 },
    { type:'date',      pageRule:'last',       x: 320, y: 612 },
  ],
  'TPL-29DA': [
    { type:'initial',   pageRule:'all',     x: 522, y: 50 },
    { type:'signature', pageRule:'last',    x: 60,  y: 520 },
    { type:'signature', pageRule:'last',    x: 320, y: 520 },
    { type:'date',      pageRule:'last',    x: 60,  y: 588 },
    { type:'date',      pageRule:'last',    x: 320, y: 588 },
    { type:'text',      pageRule:'last',    x: 60,  y: 644, label:'Print name' },
    { type:'text',      pageRule:'last',    x: 320, y: 644, label:'Print name' },
    { type:'text',      pageRule:'first',   x: 60,  y: 200, label:'Effective date' },
    { type:'text',      pageRule:'first',   x: 320, y: 200, label:'Compensation' },
    { type:'checkbox',  pageRule:'first',   x: 60,  y: 280 },
    { type:'checkbox',  pageRule:'first',   x: 60,  y: 320 },
  ],
  'TPL-5F0E': [
    { type:'signature', pageRule:'last',    x: 60,  y: 540 },
    { type:'date',      pageRule:'last',    x: 320, y: 540 },
    { type:'text',      pageRule:'last',    x: 60,  y: 612, label:'Print name' },
  ],
};

const TEMPLATES = [
  { id:'TPL-AC04', t:'Unconditional waiver — final payment',  pages:6, fields:8,  lastUsed:'Apr 22', uses:14, accent:'indigo',  tags:['Construction','Legal'] },
  { id:'TPL-7B12', t:'Mutual NDA — short form',               pages:3, fields:5,  lastUsed:'Apr 18', uses:46, accent:'amber',   tags:['Legal','Sales'] },
  { id:'TPL-29DA', t:'Independent contractor agreement',      pages:8, fields:11, lastUsed:'Apr 11', uses:7,  accent:'emerald', tags:['HR','Legal'] },
  { id:'TPL-5F0E', t:'Photography release',                   pages:2, fields:3,  lastUsed:'Mar 30', uses:22, accent:'pink',    tags:['Marketing'] },
];

const TAG_COLORS = {
  Legal:        { bg:'#EEF2FF', fg:'#4338CA' },
  Sales:        { bg:'#ECFDF5', fg:'#047857' },
  HR:           { bg:'#FDF2F8', fg:'#BE185D' },
  Construction: { bg:'#FFFBEB', fg:'#B45309' },
  Marketing:    { bg:'#F5F3FF', fg:'#6D28D9' },
};
const TAG_PALETTE = [
  { bg:'#EEF2FF', fg:'#4338CA' }, // indigo
  { bg:'#ECFDF5', fg:'#047857' }, // emerald
  { bg:'#FDF2F8', fg:'#BE185D' }, // pink
  { bg:'#FFFBEB', fg:'#B45309' }, // amber
  { bg:'#F5F3FF', fg:'#6D28D9' }, // violet
  { bg:'#ECFEFF', fg:'#0E7490' }, // cyan
  { bg:'#FEF2F2', fg:'#B91C1C' }, // red
  { bg:'#F0FDF4', fg:'#166534' }, // green
];
function hashStr(s){ let h=0; for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0; return h; }
function tagColorFor(tag){
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  return TAG_PALETTE[hashStr(tag) % TAG_PALETTE.length];
}
function tagStyle(tag){ const c = tagColorFor(tag); return {background:c.bg,color:c.fg}; }

const ACCENTS = {
  indigo:  { bg:'#EEF2FF', mark:'#6366F1', soft:'#E0E7FF' },
  amber:   { bg:'#FFFBEB', mark:'#F59E0B', soft:'#FEF3C7' },
  emerald: { bg:'#ECFDF5', mark:'#10B981', soft:'#D1FAE5' },
  pink:    { bg:'#FDF2F8', mark:'#EC4899', soft:'#FCE7F3' },
};

/* Compact, proportional 4:3 thumbnail */
function MiniThumb({ pages, accent }) {
  const a = ACCENTS[accent] || ACCENTS.indigo;
  return (
    <div style={{position:'relative', width:'100%', aspectRatio:'4 / 3', background:a.bg, borderRadius:12, overflow:'hidden'}}>
      {/* faux paper centered */}
      <div style={{
        position:'absolute', left:'50%', top:'52%', transform:'translate(-50%, -50%)',
        width:'58%', aspectRatio:'3 / 4', background:'#fff',
        boxShadow:'0 6px 14px rgba(15,23,42,0.08), 0 1px 0 rgba(15,23,42,0.04)',
        borderRadius:3, padding:'10% 11%', display:'flex', flexDirection:'column', gap:'4%',
      }}>
        <div style={{height:'4%', borderRadius:1, background:a.mark, width:'48%'}}/>
        <div style={{height:'2%'}}/>
        {[...Array(7)].map((_,i)=>(
          <div key={i} style={{height:'2.4%', borderRadius:1, background:'rgba(15,23,42,0.10)', width:`${58+(i*11)%32}%`}}/>
        ))}
        {/* signature mark */}
        <div style={{position:'absolute', left:'14%', right:'46%', bottom:'14%', height:'7%', borderRadius:2, background:a.soft, border:`1px solid ${a.mark}`}}/>
      </div>
      {/* page count chip */}
      <div style={{position:'absolute', top:8, right:8, padding:'3px 8px', borderRadius:999, background:'rgba(255,255,255,0.92)', fontSize:10, fontWeight:700, fontFamily:'var(--font-mono)', color:'var(--fg-2)', letterSpacing:'0.04em', boxShadow:'0 1px 2px rgba(15,23,42,0.06)'}}>{pages}p</div>
    </div>
  );
}

function TagFilterMenu({ allTags, counts, selected, onToggle, onClear }) {
  const [open, setOpen] = useStateT(false);
  const [q, setQ] = useStateT('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const lower = q.trim().toLowerCase();
  const visible = allTags.filter(t => !lower || t.toLowerCase().includes(lower));
  const sorted = visible.slice().sort((a,b) => (counts[b]||0) - (counts[a]||0) || a.localeCompare(b));

  return (
    <div ref={ref} style={{position:'relative'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        display:'inline-flex',alignItems:'center',gap:7,padding:'6px 11px',borderRadius:10,
        border:'1px solid '+(selected.length?'var(--indigo-300)':'var(--border-1)'),
        background:selected.length?'var(--indigo-50)':'#fff',color:'var(--fg-1)',fontSize:12.5,fontWeight:600,cursor:'pointer',
      }}>
        <Icon name="tag" size={13} style={{color:selected.length?'var(--indigo-700)':'var(--fg-3)'}}/>
        Tags
        {selected.length > 0 && <span style={{padding:'1px 7px',borderRadius:999,background:'var(--indigo-600)',color:'#fff',fontSize:11,fontFamily:'var(--font-mono)'}}>{selected.length}</span>}
        <Icon name="chevron-down" size={12} style={{color:'var(--fg-3)',transition:'transform 140ms',transform:open?'rotate(180deg)':'none'}}/>
      </button>

      {open && (
        <div style={{position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:40,width:280,background:'#fff',border:'1px solid var(--border-1)',borderRadius:12,boxShadow:'var(--shadow-xl)',padding:10}}>
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 6px 8px',borderBottom:'1px solid var(--border-2)'}}>
            <Icon name="search" size={12} style={{color:'var(--fg-3)'}}/>
            <input autoFocus value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Filter tags…"
              style={{flex:1,border:'none',outline:'none',fontSize:12.5,color:'var(--fg-1)',background:'transparent'}}/>
            {selected.length > 0 && (
              <button onClick={onClear} style={{border:'none',background:'transparent',color:'var(--fg-3)',fontSize:11.5,fontWeight:600,cursor:'pointer',padding:'2px 4px'}}>Clear</button>
            )}
          </div>
          <div style={{maxHeight:260,overflowY:'auto',paddingTop:6}}>
            {sorted.map(tag => {
              const ts = tagStyle(tag); const checked = selected.includes(tag);
              return (
                <div key={tag} onClick={()=>onToggle(tag)} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 6px',borderRadius:6,cursor:'pointer'}}
                  onMouseEnter={(e)=>e.currentTarget.style.background='var(--ink-100)'}
                  onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
                  <span style={{width:14,height:14,borderRadius:4,border:'1.5px solid '+(checked?ts.color:'var(--border-1)'),background:checked?ts.color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {checked && <Icon name="check" size={10} style={{color:'#fff'}}/>}
                  </span>
                  <span style={{flex:1,fontSize:12.5,color:'var(--fg-1)',fontWeight:600}}>{tag}</span>
                  <span style={{fontSize:11,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{counts[tag]||0}</span>
                </div>
              );
            })}
            {sorted.length === 0 && (
              <div style={{padding:'14px 6px',fontSize:12,color:'var(--fg-3)',textAlign:'center'}}>No matching tags.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TagEditorPopover({ template, allTags, onClose, onToggle, onCreate }) {
  const [draft, setDraft] = useStateT('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const lower = draft.trim().toLowerCase();
  const visible = allTags.filter(t => !lower || t.toLowerCase().includes(lower));
  const exact = allTags.find(t => t.toLowerCase() === lower);
  const canCreate = lower && !exact;
  const has = (t) => (template.tags||[]).includes(t);

  const submit = () => {
    if (canCreate) { onCreate(draft.trim()); setDraft(''); }
    else if (visible[0]) { onToggle(visible[0]); setDraft(''); }
  };

  return (
    <div ref={ref} onClick={(e)=>e.stopPropagation()} style={{
      position:'absolute', top:54, right:14, zIndex:30, width:240, background:'#fff',
      border:'1px solid var(--border-1)', borderRadius:12, boxShadow:'var(--shadow-xl)', padding:10,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 6px 8px',borderBottom:'1px solid var(--border-2)'}}>
        <Icon name="tag" size={12} style={{color:'var(--fg-3)'}}/>
        <input autoFocus value={draft} onChange={(e)=>setDraft(e.target.value)}
          onKeyDown={(e)=>{ if (e.key==='Enter') { e.preventDefault(); submit(); } }}
          placeholder="Find or create tag…"
          style={{flex:1,border:'none',outline:'none',fontSize:12.5,color:'var(--fg-1)',background:'transparent'}}/>
      </div>
      <div style={{maxHeight:180,overflowY:'auto',paddingTop:6}}>
        {visible.map(tag => {
          const ts = tagStyle(tag); const checked = has(tag);
          return (
            <div key={tag} onClick={()=>onToggle(tag)} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 6px',borderRadius:6,cursor:'pointer'}}
              onMouseEnter={(e)=>e.currentTarget.style.background='var(--ink-100)'}
              onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
              <span style={{width:14,height:14,borderRadius:4,border:'1.5px solid '+(checked?ts.color:'var(--border-1)'),background:checked?ts.color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {checked && <Icon name="check" size={10} style={{color:'#fff'}}/>}
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11.5,fontWeight:700,letterSpacing:'0.02em',padding:'2px 7px',borderRadius:999,...ts}}>
                <span style={{width:6,height:6,borderRadius:999,background:ts.color}}/>{tag}
              </span>
            </div>
          );
        })}
        {visible.length === 0 && !canCreate && (
          <div style={{padding:'10px 6px',fontSize:12,color:'var(--fg-3)',textAlign:'center'}}>No tags yet.</div>
        )}
      </div>
      {canCreate && (
        <div onClick={()=>{ onCreate(draft.trim()); setDraft(''); }}
          style={{marginTop:6,padding:'7px 8px',borderTop:'1px solid var(--border-2)',display:'flex',alignItems:'center',gap:6,cursor:'pointer',borderRadius:6,fontSize:12,color:'var(--fg-1)',fontWeight:600}}
          onMouseEnter={(e)=>e.currentTarget.style.background='var(--indigo-50)'}
          onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
          <Icon name="plus" size={12} style={{color:'var(--indigo-600)'}}/>
          Create <span style={{...tagStyle(draft.trim()),padding:'2px 7px',borderRadius:999,fontSize:11,fontWeight:700,letterSpacing:'0.02em',marginLeft:2}}>{draft.trim()}</span>
        </div>
      )}
    </div>
  );
}

function TemplatesList({ onCreate, onOpen, onUse }) {
  const [q, setQ] = useStateT('');
  const [activeTags, setActiveTags] = useStateT([]);
  const [groupByTag, setGroupByTag] = useStateT(false);
  const [items, setItems] = useStateT(TEMPLATES);
  const [confirmDelete, setConfirmDelete] = useStateT(null);
  const [tagEditorFor, setTagEditorFor] = useStateT(null); // template object or null

  const allTags = useMemoT(() => {
    const s = new Set();
    items.forEach(t => (t.tags||[]).forEach(x => s.add(x)));
    return Array.from(s).sort();
  }, [items]);

  const tagCounts = useMemoT(() => {
    const c = {};
    items.forEach(t => (t.tags||[]).forEach(x => { c[x] = (c[x]||0) + 1; }));
    return c;
  }, [items]);

  const filtered = useMemoT(() => {
    const term = q.trim().toLowerCase();
    return items.filter(t => {
      if (activeTags.length && !activeTags.every(at => (t.tags||[]).includes(at))) return false;
      if (!term) return true;
      if (t.t.toLowerCase().includes(term)) return true;
      if (t.id.toLowerCase().includes(term)) return true;
      if ((t.tags||[]).some(x => x.toLowerCase().includes(term))) return true;
      return false;
    });
  }, [q, items, activeTags]);

  const grouped = useMemoT(() => {
    if (!groupByTag) return null;
    const map = {};
    filtered.forEach(t => {
      const tags = (t.tags && t.tags.length) ? t.tags : ['Untagged'];
      tags.forEach(tag => { (map[tag] = map[tag] || []).push(t); });
    });
    return Object.keys(map).sort().map(k => ({ tag:k, items:map[k] }));
  }, [filtered, groupByTag]);

  const toggleActiveTag = (tag) => setActiveTags(prev => prev.includes(tag) ? prev.filter(x=>x!==tag) : [...prev, tag]);

  const doDelete = (t) => { setItems(prev => prev.filter(x => x.id !== t.id)); setConfirmDelete(null); };

  const toggleTag = (templateId, tag) => {
    setItems(prev => prev.map(t => {
      if (t.id !== templateId) return t;
      const has = (t.tags||[]).includes(tag);
      return { ...t, tags: has ? t.tags.filter(x=>x!==tag) : [...(t.tags||[]), tag] };
    }));
  };
  const addTag = (templateId, tag) => {
    const clean = tag.trim();
    if (!clean) return;
    setItems(prev => prev.map(t => {
      if (t.id !== templateId) return t;
      if ((t.tags||[]).includes(clean)) return t;
      return { ...t, tags: [...(t.tags||[]), clean] };
    }));
  };

  const renderCard = (t) => (
    <div key={t.id} onClick={()=>onUse && onUse(t)} className="tpl-card" style={{
      background:'#fff', border:'1px solid var(--border-1)', borderRadius:16, padding:14,
      cursor:'pointer', transition:'border-color 140ms, box-shadow 140ms, transform 140ms',
      display:'flex', flexDirection:'column', gap:12, position:'relative',
    }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--indigo-300)'; e.currentTarget.style.boxShadow='var(--shadow-md)'; e.currentTarget.style.transform='translateY(-1px)'; const a=e.currentTarget.querySelector('[data-actions]'); if(a) a.style.opacity='1'; }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border-1)'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='translateY(0)'; const a=e.currentTarget.querySelector('[data-actions]'); if(a) a.style.opacity='0'; }}>
      <MiniThumb pages={t.pages} accent={t.accent}/>

      <div style={{padding:'0 4px', minHeight:64}}>
        <div style={{fontSize:14,fontWeight:600,color:'var(--fg-1)',lineHeight:1.3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={t.t}>{t.t}</div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6,flexWrap:'wrap'}}>
          {(() => {
            const tags = t.tags||[]; const visible = tags.slice(0,2); const extra = tags.length - visible.length;
            return (
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6,flexWrap:'wrap'}}>
                {visible.map(tag => {
                  const ts = tagStyle(tag);
                  return (
                    <span key={tag} onClick={(e)=>{ e.stopPropagation(); toggleActiveTag(tag); }} title={`Filter by ${tag}`} style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.02em',padding:'2px 7px',borderRadius:999,cursor:'pointer',...ts}}>{tag}</span>
                  );
                })}
                {extra > 0 && (
                  <span title={tags.slice(2).join(', ')} onClick={(e)=>{ e.stopPropagation(); setTagEditorFor(t); }} style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.02em',padding:'2px 7px',borderRadius:999,cursor:'pointer',background:'var(--ink-100)',color:'var(--fg-2)'}}>+{extra}</span>
                )}
              </div>
            );
          })()}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6,fontSize:11.5,color:'var(--fg-3)'}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Icon name="pen-tool" size={11}/>{t.fields}</span>
          <span style={{width:2,height:2,borderRadius:999,background:'var(--ink-300)'}}/>
          <span>Used {t.uses}×</span>
          <span style={{width:2,height:2,borderRadius:999,background:'var(--ink-300)'}}/>
          <span style={{fontFamily:'var(--font-mono)'}}>{t.lastUsed}</span>
        </div>
      </div>

      {/* Floating action overlay — appears on hover */}
      <div data-actions onClick={(e)=>e.stopPropagation()} style={{
        position:'absolute', top:22, left:22, right:22, display:'flex', justifyContent:'flex-end', gap:6,
        opacity:0, transition:'opacity 140ms',
      }}>
        <button onClick={(e)=>{ e.stopPropagation(); setTagEditorFor(tagEditorFor && tagEditorFor.id===t.id ? null : t); }} title="Edit tags" style={{
          background:'rgba(255,255,255,0.96)', border:'1px solid var(--border-1)', borderRadius:8,
          padding:'6px 8px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5,
          fontSize:12, fontWeight:600, color:'var(--fg-1)', boxShadow:'0 2px 6px rgba(15,23,42,0.08)',
        }}>
          <Icon name="tag" size={12}/> Tags
        </button>
        <button onClick={()=>onOpen && onOpen(t)} title="Edit template" style={{
          background:'rgba(255,255,255,0.96)', border:'1px solid var(--border-1)', borderRadius:8,
          padding:'6px 8px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5,
          fontSize:12, fontWeight:600, color:'var(--fg-1)', boxShadow:'0 2px 6px rgba(15,23,42,0.08)',
        }}>
          <Icon name="pencil" size={12}/> Edit
        </button>
        <button onClick={()=>onUse && onUse(t)} title="Use template" style={{
          background:'var(--ink-900)', color:'#fff', border:'none', borderRadius:8,
          padding:'6px 10px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5,
          fontSize:12, fontWeight:600, boxShadow:'0 2px 6px rgba(15,23,42,0.18)',
        }}>
          <Icon name="send" size={12}/> Use
        </button>
        <button onClick={()=>setConfirmDelete(t)} title="Delete template" style={{
          background:'rgba(255,255,255,0.96)', border:'1px solid var(--border-1)', borderRadius:8,
          padding:'6px 8px', cursor:'pointer', display:'inline-flex', alignItems:'center',
          color:'#DC2626', boxShadow:'0 2px 6px rgba(15,23,42,0.08)',
        }}
          onMouseEnter={e=>{ e.currentTarget.style.background='#FEF2F2'; e.currentTarget.style.borderColor='#FCA5A5'; }}
          onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.96)'; e.currentTarget.style.borderColor='var(--border-1)'; }}>
          <Icon name="trash-2" size={12}/>
        </button>
      </div>

      {/* Tag editor popover */}
      {tagEditorFor && tagEditorFor.id === t.id && (
        <TagEditorPopover
          template={t}
          allTags={allTags}
          onClose={()=>setTagEditorFor(null)}
          onToggle={(tag)=>toggleTag(t.id, tag)}
          onCreate={(tag)=>{ addTag(t.id, tag); }}
        />
      )}
    </div>
  );

  const createCard = (
    <div onClick={onCreate} role="button" tabIndex={0} style={{
      background:'#fff', border:'1.5px dashed var(--indigo-300)', borderRadius:16,
      padding:14, cursor:'pointer', display:'flex', flexDirection:'column', gap:12,
      transition:'border-color 140ms, background 140ms, transform 140ms',
    }}
      onMouseEnter={e=>{ e.currentTarget.style.background='var(--indigo-50)'; e.currentTarget.style.borderColor='var(--indigo-500)'; e.currentTarget.style.transform='translateY(-1px)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='var(--indigo-300)'; e.currentTarget.style.transform='translateY(0)'; }}>
      <div style={{position:'relative', width:'100%', aspectRatio:'4 / 3', background:'var(--indigo-50)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center'}}>
        <div style={{width:54,height:54,borderRadius:14,background:'#fff',color:'var(--indigo-700)',display:'inline-flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(79,70,229,0.18)'}}>
          <Icon name="plus" size={26}/>
        </div>
      </div>
      <div style={{padding:'2px 4px 4px'}}>
        <div style={{fontSize:14,fontWeight:600,color:'var(--fg-1)'}}>New template</div>
        <div style={{fontSize:12,color:'var(--fg-3)',marginTop:3}}>Upload a PDF, place fields once.</div>
      </div>
    </div>
  );

  return (
    <div data-screen-label="Templates list">
      <TopNav active="documents" logoSrc="../assets/logo.svg"/>
      <div style={{display:'flex'}}>
        <LeftRail active="templates"/>
        <div style={{flex:1, padding:'40px 48px 80px', maxWidth:1280}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,marginBottom:24}}>
            <div>
              <div style={{fontFamily:'var(--font-serif)',fontSize:32,fontWeight:500,color:'var(--fg-1)',letterSpacing:'-0.02em',lineHeight:1.1}}>Templates</div>
              <div style={{fontSize:13,color:'var(--fg-3)',marginTop:6}}>Place fields once. Reuse forever.</div>
            </div>
            <Button variant="primary" icon="plus" onClick={onCreate} style={{whiteSpace:'nowrap',flexShrink:0}}>New template</Button>
          </div>

          {/* Tag filter + search + group toggle */}
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18,flexWrap:'wrap'}}>
            <TagFilterMenu allTags={allTags} counts={tagCounts} selected={activeTags} onToggle={toggleActiveTag} onClear={()=>setActiveTags([])}/>
            {activeTags.length > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                {activeTags.slice(0,3).map(tag => {
                  const ts = tagStyle(tag);
                  return (
                    <span key={tag} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 4px 4px 10px',borderRadius:999,fontSize:11.5,fontWeight:700,letterSpacing:'0.02em',...ts}}>
                      {tag}
                      <button onClick={()=>toggleActiveTag(tag)} style={{border:'none',background:'rgba(0,0,0,0.08)',color:'inherit',width:16,height:16,borderRadius:999,cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0}}>
                        <Icon name="x" size={10}/>
                      </button>
                    </span>
                  );
                })}
                {activeTags.length > 3 && (
                  <span style={{fontSize:11.5,color:'var(--fg-3)',fontWeight:600}}>+{activeTags.length-3} more</span>
                )}
              </div>
            )}
            <div style={{flex:1}}/>
            <label style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:12.5,color:'var(--fg-2)',cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}}>
              <input type="checkbox" checked={groupByTag} onChange={(e)=>setGroupByTag(e.target.checked)} style={{accentColor:'var(--indigo-600)'}}/>
              Group by tag
            </label>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',border:'1px solid var(--border-1)',borderRadius:10,background:'#fff',width:240}}>
              <Icon name="search" size={14} style={{color:'var(--fg-3)'}}/>
              <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search by name or tag"
                style={{flex:1,border:'none',outline:'none',fontSize:13,fontFamily:'var(--font-sans)',color:'var(--fg-1)',background:'transparent'}}/>
            </div>
          </div>

          {/* Grid */}
          {groupByTag ? (
            <div style={{display:'flex',flexDirection:'column',gap:32}}>
              {grouped.map(g => {
                const ts = tagStyle(g.tag);
                return (
                  <div key={g.tag}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,fontSize:12,fontWeight:700,letterSpacing:'0.02em',...ts}}>
                        <span style={{width:7,height:7,borderRadius:999,background:ts.color}}/>{g.tag}
                      </span>
                      <span style={{fontSize:12,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{g.items.length}</span>
                      <div style={{flex:1,height:1,background:'var(--border-1)'}}/>
                    </div>
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:18}}>
                      {g.items.map(renderCard)}
                    </div>
                  </div>
                );
              })}
              {grouped.length === 0 && (
                <div style={{padding:'40px 16px', textAlign:'center', color:'var(--fg-3)', fontSize:13, border:'1px dashed var(--border-2)', borderRadius:14, background:'#fff'}}>No templates match your filter.</div>
              )}
            </div>
          ) : (
            <React.Fragment>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:18}}>
                {createCard}
                {filtered.map(renderCard)}
              </div>
              {filtered.length === 0 && (
                <div style={{padding:'40px 16px', textAlign:'center', color:'var(--fg-3)', fontSize:13, border:'1px dashed var(--border-2)', borderRadius:14, background:'#fff', marginTop:16}}>
                  {q ? `No templates match "${q}".` : (activeTags.length ? `No templates match the selected tags.` : 'No templates yet.')}
                </div>
              )}
            </React.Fragment>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div onClick={()=>setConfirmDelete(null)} style={{position:'fixed',inset:0,zIndex:200,background:'rgba(15,23,42,0.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:24,animation:'fadeIn 160ms var(--ease-standard)'}}>
          <div onClick={(e)=>e.stopPropagation()} style={{width:460,maxWidth:'100%',background:'#fff',borderRadius:18,boxShadow:'var(--shadow-xl)',padding:'28px 28px 22px'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
              <div style={{width:44,height:44,borderRadius:12,background:'#FEF2F2',color:'#DC2626',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Icon name="trash-2" size={20}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,color:'var(--fg-1)',letterSpacing:'-0.01em',lineHeight:1.2}}>Delete this template?</div>
                <div style={{fontSize:13,color:'var(--fg-3)',marginTop:6,lineHeight:1.5}}>
                  <b style={{color:'var(--fg-1)'}}>{confirmDelete.t}</b> will be removed. Documents already sent are not affected.
                </div>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}>
              <button onClick={()=>setConfirmDelete(null)} style={{background:'transparent',border:'1px solid var(--border-1)',color:'var(--fg-1)',fontSize:13,fontWeight:600,cursor:'pointer',padding:'9px 16px',borderRadius:10}}>Cancel</button>
              <button onClick={()=>doDelete(confirmDelete)} style={{background:'#DC2626',color:'#fff',border:'none',fontSize:13,fontWeight:600,cursor:'pointer',padding:'9px 16px',borderRadius:10,display:'inline-flex',alignItems:'center',gap:6}}>
                <Icon name="trash-2" size={14}/> Delete template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { TemplatesList, TEMPLATES, TEMPLATE_FIELDS });
