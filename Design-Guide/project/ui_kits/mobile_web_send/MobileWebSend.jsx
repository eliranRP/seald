/* @jsx React.createElement */
/*
 * MobileWebSend.jsx — six-screen sender flow for adding & sending a PDF
 * from a phone browser. Reuses _shared/components.jsx primitives and
 * MobileWebDevice / MWStep / MWStickyBar / MWBottomSheet from
 * mobile-web-frame.jsx.
 *
 * Steps: start → file → signers → place → review → sent
 *
 * Place-fields parity with desktop signing_app:
 *   - 12-page document, tappable filmstrip + swipe between pages
 *   - Tap-to-arm a field type, tap-canvas-to-drop
 *   - Tap a placed field to select; action toolbar above field with
 *     Pages / Signers / Delete + drag handle to reposition
 *   - Bulk-apply sheet with the SAME 5 modes as desktop:
 *       Only this page / All pages / All pages but last / Last page / Custom
 *   - Multi-signer assignment sheet (multi-select chips). When a field has
 *     ≥2 signers it renders as a split pill (one cell per signer color)
 *
 * Hub variants (initialStep): the canonical 6 + place sub-states:
 *   place-empty | place-armed | place-selected | place-apply | place-assign |
 *   place-linked | place-group | place-dragging
 *
 * Selection model on the place step:
 *   - One tap on a placed field → single-select (replaces selection)
 *   - One tap on another field while a selection exists → adds it to the
 *     selection (group of 2+); same tap on an already-selected member
 *     removes it from the selection
 *   - Tap on empty canvas → clears selection (when no tool is armed)
 *   - Drag any selected field → ALL selected fields translate together
 *     (touch + mouse via Pointer Events; live offset applied during drag,
 *     committed on pointer-up; canvas-bound clamped)
 *   - "Group" makes the multi-selection sticky — fields share a groupId so
 *     tapping any member auto-selects the whole group again. "Ungroup"
 *     clears the groupId.
 */

const { useState, useMemo } = React;

const MW_URL = {
  start:   'seald.nromomentum.com/document/new',
  file:    'seald.nromomentum.com/document/new',
  signers: 'seald.nromomentum.com/document/draft-2c1a/signers',
  place:   'seald.nromomentum.com/document/draft-2c1a/fields',
  review:  'seald.nromomentum.com/document/draft-2c1a/review',
  sent:    'seald.nromomentum.com/document/draft-2c1a/sent',
};

const TOTAL_PAGES = 12;
const DEMO_SIGNERS = [
  { id:'s1', name:'Jamie Okonkwo',  email:'jamie@seald.app',  role:'Signer 1', color:'#818CF8', initials:'JO' },
  { id:'s2', name:'Priya Kapoor',    email:'priya@kapoor.com', role:'Signer 2', color:'#10B981', initials:'PK' },
  { id:'s3', name:'Meilin Chen',     email:'meilin@chen.co',   role:'Signer 3', color:'#F59E0B', initials:'MC' },
];

const FIELD_CHIPS = [
  { k:'sig', label:'Signature', icon:'pen-tool',     w:180, h:50 },
  { k:'ini', label:'Initials',  icon:'type',         w:84,  h:40 },
  { k:'dat', label:'Date',      icon:'calendar',     w:96,  h:32 },
  { k:'txt', label:'Text',      icon:'square',       w:140, h:32 },
  { k:'chk', label:'Checkbox',  icon:'check-square', w:32,  h:32 },
];
const fieldDef = (k) => FIELD_CHIPS.find(c => c.k === k);

/* ───────────── 1. Start ───────────── */
function MWStart({ onPick }) {
  const tiles = [
    { key:'upload',   icon:'upload',     title:'Upload PDF',
      sub:'Pick a file from your phone',     accent:'var(--indigo-600)' },
    { key:'camera',   icon:'camera',     title:'Take photo',
      sub:'Scan a paper document',           accent:'var(--ink-900)' },
    { key:'template', icon:'layout-template', title:'From a template',
      sub:'Reuse a saved layout',            accent:'var(--success-700)' },
  ];
  const recent = [
    { t:'NDA — Quill Capital',  date:'Apr 30', pages:4 },
    { t:'Vendor agreement v3',  date:'Apr 27', pages:11 },
  ];
  return (
    <div style={{ padding:'8px 16px 24px' }}>
      <div style={{
        fontFamily:'var(--font-serif)', fontSize:30, fontWeight:500,
        color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.1,
        padding:'8px 4px 4px',
      }}>New document</div>
      <div style={{ fontSize:14, color:'var(--fg-3)', padding:'0 4px 18px' }}>
        How do you want to start?
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {tiles.map(t => (
          <button key={t.key} onClick={()=>onPick && onPick(t.key)} style={{
            textAlign:'left', border:'1px solid var(--border-1)', background:'#fff',
            borderRadius:18, padding:'16px 16px',
            display:'flex', alignItems:'center', gap:14, cursor:'pointer',
            boxShadow:'0 1px 2px rgba(11,18,32,0.04)',
          }}>
            <div style={{
              width:44, height:44, borderRadius:12, background:'var(--ink-100)',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            }}>
              <Icon name={t.icon} size={22} style={{color:t.accent}}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:15, fontWeight:600, color:'var(--fg-1)' }}>{t.title}</div>
              <div style={{ fontSize:13, color:'var(--fg-3)', marginTop:2 }}>{t.sub}</div>
            </div>
            <Icon name="chevron-right" size={18} style={{color:'var(--fg-4)'}}/>
          </button>
        ))}
      </div>

      <div style={{
        fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-3)',
        textTransform:'uppercase', letterSpacing:'0.08em', padding:'24px 4px 8px',
      }}>Recent</div>
      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:16, overflow:'hidden',
      }}>
        {recent.map((r,i)=>(
          <div key={r.t} style={{
            padding:'12px 14px', display:'flex', alignItems:'center', gap:12,
            borderBottom: i<recent.length-1 ? '1px solid var(--border-1)' : 'none',
          }}>
            <DocThumb size={36}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--fg-1)',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.t}</div>
              <div style={{ fontSize:12, color:'var(--fg-3)', marginTop:2,
                fontFamily:'var(--font-mono)' }}>{r.date} · {r.pages} pp</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── 2. File ready ───────────── */
function MWFile({ onReplace }) {
  return (
    <div style={{ padding:'4px 16px 24px' }}>
      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:18,
        padding:18, display:'flex', flexDirection:'column', alignItems:'center',
      }}>
        <div style={{
          width:160, height:208, borderRadius:8, background:'#fff',
          boxShadow:'0 1px 2px rgba(11,18,32,0.06), 0 8px 24px rgba(11,18,32,0.06)',
          padding:'16px 14px', position:'relative',
        }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:11, fontWeight:500 }}>Mutual Non-Disclosure</div>
          <div style={{ height:6 }}/>
          {[...Array(10)].map((_,i)=>(
            <div key={i} style={{ height:3, borderRadius:2,
              background:'var(--ink-150)', margin:'4px 0',
              width:`${60+(i*11)%35}%` }}/>
          ))}
        </div>
        <div style={{ marginTop:18, textAlign:'center' }}>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--fg-1)' }}>NDA — Quill Capital.pdf</div>
          <div style={{ fontSize:13, color:'var(--fg-3)', marginTop:4,
            fontFamily:'var(--font-mono)' }}>{TOTAL_PAGES} pages · 318 KB</div>
        </div>
        <button onClick={onReplace} style={{
          marginTop:14, border:'1px solid var(--border-1)', background:'#fff',
          borderRadius:12, padding:'8px 14px', fontSize:13, fontWeight:600,
          color:'var(--fg-2)', cursor:'pointer',
          display:'inline-flex', alignItems:'center', gap:6,
        }}>
          <Icon name="rotate-ccw" size={14}/> Replace file
        </button>
      </div>

      <div style={{
        marginTop:14, padding:'12px 14px', background:'var(--accent-subtle)',
        border:'1px solid var(--indigo-200)', borderRadius:14,
        display:'flex', gap:10, alignItems:'flex-start',
      }}>
        <Icon name="info" size={16} style={{color:'var(--indigo-600)', marginTop:2}}/>
        <div style={{ fontSize:12, color:'var(--indigo-700)', lineHeight:1.5 }}>
          We'll keep your draft as you go. Close the tab and pick up from
          the dashboard.
        </div>
      </div>
    </div>
  );
}

/* ───────────── 3. Signers ───────────── */
function MWSigners({ signers, onAdd, onMeToggle, meIncluded }) {
  return (
    <div style={{ padding:'4px 16px 24px' }}>
      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:14,
        padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:10,
      }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--fg-1)' }}>Add me as signer</div>
          <div style={{ fontSize:12, color:'var(--fg-3)', marginTop:2 }}>Sign first, then send</div>
        </div>
        <button onClick={onMeToggle} aria-pressed={meIncluded} style={{
          width:46, height:28, borderRadius:14, border:'none', cursor:'pointer',
          background: meIncluded ? 'var(--indigo-600)' : 'var(--ink-200)',
          position:'relative', transition:'background .15s',
        }}>
          <div style={{
            position:'absolute', top:2, left: meIncluded ? 20 : 2,
            width:24, height:24, borderRadius:12, background:'#fff',
            boxShadow:'0 1px 2px rgba(0,0,0,0.2)', transition:'left .15s',
          }}/>
        </button>
      </div>

      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:18,
        overflow:'hidden',
      }}>
        {signers.map((s,i)=>(
          <div key={s.email} style={{
            padding:'14px 14px', display:'flex', alignItems:'center', gap:12,
            borderBottom: i<signers.length-1 ? '1px solid var(--border-1)' : 'none',
          }}>
            <Avatar name={s.name} color={s.color}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--fg-1)' }}>{s.name}</div>
              <div style={{ fontSize:12, color:'var(--fg-3)', marginTop:2 }}>{s.email}</div>
            </div>
            <Badge tone="indigo">{s.role}</Badge>
          </div>
        ))}
        <button onClick={onAdd} style={{
          width:'100%', textAlign:'left', padding:'14px 14px', border:'none',
          background:'transparent', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10,
          color:'var(--indigo-700)', fontSize:14, fontWeight:600,
          borderTop:'1px dashed var(--border-1)',
        }}>
          <Icon name="plus" size={18}/> Add signer
        </button>
      </div>

      <div style={{
        marginTop:18, padding:'10px 14px', display:'flex',
        alignItems:'center', justifyContent:'space-between', gap:10,
      }}>
        <div style={{ fontSize:12, color:'var(--fg-3)' }}>Signing order</div>
        <div style={{ display:'flex', background:'var(--ink-100)', borderRadius:10, padding:3 }}>
          {['Anyone', 'In order'].map((l,i)=>(
            <div key={l} style={{
              padding:'6px 12px', borderRadius:7, fontSize:12, fontWeight:600,
              background: i===0 ? '#fff' : 'transparent',
              color: i===0 ? 'var(--fg-1)' : 'var(--fg-3)',
              boxShadow: i===0 ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── 4. Place fields — multi-page + multi-signer ───────────── */
function PageFilmstrip({ totalPages, currentPage, onPage, fields }) {
  // Each thumb shows a tiny preview + a green dot if any field exists on it
  return (
    <div style={{
      display:'flex', gap:6, padding:'6px 12px 8px',
      overflowX:'auto', WebkitOverflowScrolling:'touch',
      borderBottom:'0.5px solid var(--border-1)',
      background:'rgba(243,246,250,0.85)',
    }}>
      {Array.from({length: totalPages}).map((_,i)=>{
        const n = i+1;
        const isActive = n===currentPage;
        const hasFields = fields.some(f => (f.linkedPages || [f.page]).includes(n));
        return (
          <button key={n} onClick={()=>onPage && onPage(n)} style={{
            flexShrink:0, width:46, height:60, padding:0, cursor:'pointer',
            border: isActive ? '2px solid var(--indigo-600)' : '1px solid var(--border-1)',
            borderRadius:6, background:'#fff', position:'relative',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start',
            paddingTop:4, gap:3,
          }}>
            {/* mini lines */}
            <div style={{ width:32, height:1.5, background:'var(--ink-150)', borderRadius:1 }}/>
            <div style={{ width:28, height:1.5, background:'var(--ink-150)', borderRadius:1 }}/>
            <div style={{ width:30, height:1.5, background:'var(--ink-150)', borderRadius:1 }}/>
            <div style={{ width:24, height:1.5, background:'var(--ink-150)', borderRadius:1 }}/>
            {hasFields && (
              <div style={{
                position:'absolute', top:3, right:3, width:6, height:6,
                borderRadius:3, background:'var(--indigo-600)',
              }}/>
            )}
            <div style={{
              position:'absolute', bottom:2, left:0, right:0, textAlign:'center',
              fontFamily:'var(--font-mono)', fontSize:9,
              color: isActive ? 'var(--indigo-700)' : 'var(--fg-3)',
              fontWeight: isActive ? 700 : 500,
            }}>{n}</div>
          </button>
        );
      })}
    </div>
  );
}

function PlacedFieldMobile({
  field, signers, selected, dragging, dragOffset = {x:0,y:0},
  onPointerDown, onPointerMove, onPointerUp,
}) {
  const def = fieldDef(field.type);
  const ws = field.signerIds.map(id => signers.find(s=>s.id===id)).filter(Boolean);
  const isMulti = ws.length > 1;
  const linkedCount = (field.linkedPages || [field.page]).length;
  const totalW = isMulti ? def.w * 2 + 8 : def.w;
  // dragging is owned by parent; apply offset whenever this field is part of the active drag set
  const ox = dragging ? dragOffset.x : 0;
  const oy = dragging ? dragOffset.y : 0;

  return (
    <div
      onPointerDown={(e)=>onPointerDown && onPointerDown(e, field.id)}
      onPointerMove={(e)=>onPointerMove && onPointerMove(e)}
      onPointerUp={(e)=>onPointerUp && onPointerUp(e)}
      onPointerCancel={(e)=>onPointerUp && onPointerUp(e)}
      // Stop the synthetic click from bubbling to the canvas (which would
      // otherwise treat the tap as "tap on empty canvas" and clear selection).
      onClick={(e)=>e.stopPropagation()}
      style={{
        position:'absolute', left:field.x + ox, top:field.y + oy,
        width:totalW, height:def.h,
        cursor: dragging ? 'grabbing' : (selected ? 'grab' : 'pointer'),
        zIndex: selected ? 10 : 1,
        touchAction:'none', userSelect:'none', WebkitUserSelect:'none',
        transition: dragging ? 'none' : 'box-shadow .12s ease',
        filter: dragging ? 'drop-shadow(0 6px 16px rgba(11,18,32,0.18))' : 'none',
      }}
    >
      {/* the field pill(s) */}
      <div style={{ display:'flex', gap: isMulti ? 8 : 0, height:'100%' }}>
        {(isMulti ? ws : [ws[0] || signers[0]]).map((s, idx) => (
          <div key={(s && s.id) || idx} style={{
            flex:1, height:'100%',
            border: `${selected ? 2 : 1.5}px ${selected ? 'solid' : 'dashed'} ${s ? s.color : 'var(--ink-400)'}`,
            background: s ? `${s.color}1A` : 'rgba(238,242,255,0.6)',
            borderRadius:6, display:'flex', alignItems:'center', gap:6,
            padding:'0 8px', fontSize:11, fontWeight:600,
            color: s ? 'var(--fg-1)' : 'var(--fg-3)', overflow:'hidden',
          }}>
            <Icon name={def.icon} size={12} style={{ color: s ? s.color : 'var(--fg-3)' }}/>
            <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {s ? `${s.initials} · ${def.label}` : def.label}
            </span>
          </div>
        ))}
      </div>

      {/* drag-handle dots — visible when selected */}
      {selected && (
        <div style={{
          position:'absolute', top:-3, left:-3,
          width:14, height:14, borderRadius:7, background:'#fff',
          border:'1.5px solid var(--indigo-600)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 1px 2px rgba(0,0,0,0.12)',
        }}>
          <Icon name="move" size={9} style={{color:'var(--indigo-700)'}}/>
        </div>
      )}

      {/* Signer-initials avatars — pinned to the right edge of the field
          when selected. Always visible during selection so the assignment
          is unambiguous, even before the user opens the Signers sheet. */}
      {selected && !dragging && ws.length > 0 && (
        <div style={{
          position:'absolute', top:-10, right:-6, display:'flex',
          flexDirection:'row-reverse',
        }}>
          {ws.map((s, i) => (
            <div key={s.id} title={s.name} style={{
              width:20, height:20, borderRadius:10,
              background:s.color, color:'#fff',
              fontSize:9, fontWeight:700, fontFamily:'var(--font-sans)',
              display:'flex', alignItems:'center', justifyContent:'center',
              border:'1.5px solid #fff',
              boxShadow:'0 1px 2px rgba(0,0,0,0.18)',
              marginLeft: i === 0 ? 0 : -6,
            }}>{s.initials}</div>
          ))}
        </div>
      )}

      {/* Page-toggle strip — quick "add this field to other pages"
          affordance under the selected field. Tapping a number toggles
          that page in the field's linkedPages. */}

      {/* "Linked · N pages" badge if duplicated */}
      {linkedCount > 1 && !selected && (
        <div style={{
          position:'absolute', top:-9, left:6, padding:'2px 6px',
          background:'#fff', border:'1px solid var(--indigo-200)', borderRadius:8,
          fontSize:10, fontWeight:700, color:'var(--indigo-700)',
          fontFamily:'var(--font-mono)', letterSpacing:'0.02em',
          display:'inline-flex', alignItems:'center', gap:3,
        }}>
          <Icon name="link" size={10} style={{color:'var(--indigo-600)'}}/>
          {linkedCount}p
        </div>
      )}
    </div>
  );
}

function FieldActionToolbar({ field, signers, onPages, onSigners, onDelete }) {
  const def = fieldDef(field.type);
  const ws = field.signerIds.map(id => signers.find(s=>s.id===id)).filter(Boolean);
  const linkedCount = (field.linkedPages || [field.page]).length;
  return (
    <div style={{
      position:'absolute', left: Math.max(8, field.x - 6),
      top: Math.max(8, field.y - 50), zIndex:20,
      display:'flex', alignItems:'center', gap:6,
      padding:'6px 8px', background:'var(--ink-900)', color:'#fff',
      borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.25)',
      fontSize:11, fontWeight:600,
    }}>
      <span style={{ opacity:0.7, fontFamily:'var(--font-mono)' }}>{def.label}</span>
      <span style={{ opacity:0.4 }}>·</span>
      <button onPointerDown={(e)=>e.stopPropagation()} onClick={onPages} style={tbBtn()}>
        <Icon name="copy" size={13}/> {linkedCount > 1 ? `${linkedCount}p` : 'Pages'}
      </button>
      <button onPointerDown={(e)=>e.stopPropagation()} onClick={onSigners} style={tbBtn()}>
        <Icon name="users" size={13}/> {ws.length || 'Signers'}
      </button>
      <button onPointerDown={(e)=>e.stopPropagation()} onClick={onDelete} style={{...tbBtn(), color:'#FCA5A5'}}>
        <Icon name="trash-2" size={13}/>
      </button>
    </div>
  );
}

/* ---- multi-select toolbar (anchored above the bounding box). The
 * selection itself IS the group — there's no separate "Group" verb;
 * tap any member to remove it from the selection (and thus the group).
 */
function GroupActionToolbar({ count, bounds, onPages, onSigners, onDelete }) {
  const left = Math.max(8, bounds.minX - 6);
  const top  = Math.max(8, bounds.minY - 50);
  const stop = (e)=>e.stopPropagation();
  return (
    <div style={{
      position:'absolute', left, top, zIndex:25,
      display:'flex', alignItems:'center', gap:6,
      padding:'6px 8px', background:'var(--indigo-700)', color:'#fff',
      borderRadius:10, boxShadow:'0 8px 24px rgba(79,70,229,0.32)',
      fontSize:11, fontWeight:700,
    }}>
      <span style={{ fontFamily:'var(--font-mono)', letterSpacing:'0.04em' }}>
        {count} selected
      </span>
      <span style={{ opacity:0.5 }}>·</span>
      <button onPointerDown={stop} onClick={onPages} style={tbBtn()}>
        <Icon name="copy" size={13}/> Pages
      </button>
      <button onPointerDown={stop} onClick={onSigners} style={tbBtn()}>
        <Icon name="users" size={13}/> Signers
      </button>
      <button onPointerDown={stop} onClick={onDelete} style={{...tbBtn(), color:'#FCA5A5'}}>
        <Icon name="trash-2" size={13}/>
      </button>
    </div>
  );
}

/* dotted bounding box around the multi-selection (visual cue) */
function SelectionBounds({ bounds }) {
  return (
    <div style={{
      position:'absolute',
      left: bounds.minX - 4, top: bounds.minY - 4,
      width:  bounds.maxX - bounds.minX + 8,
      height: bounds.maxY - bounds.minY + 8,
      border:'1.5px dashed var(--indigo-600)', borderRadius:8,
      background:'rgba(79,70,229,0.04)', pointerEvents:'none', zIndex:5,
    }}/>
  );
}
function tbBtn() {
  return {
    border:'none', background:'transparent', color:'#fff', cursor:'pointer',
    display:'inline-flex', alignItems:'center', gap:4,
    padding:'4px 6px', borderRadius:6, fontSize:11, fontWeight:600,
  };
}

function MWPlace({
  page, totalPages, onPage,
  fields, signers, selectedIds, onTapField, onClearSelection,
  armedTool, onArmTool, onCanvasTap,
  onOpenApply, onOpenAssign,
  onDeleteSelected, onCommitDrag,
}) {
  const visibleFields = fields.filter(f => (f.linkedPages || [f.page]).includes(page));
  const selectedOnPage = visibleFields.filter(f => selectedIds.includes(f.id));
  const singleSelected = selectedOnPage.length === 1 ? selectedOnPage[0] : null;
  const isMultiSelect = selectedOnPage.length > 1;
  const hasSelection = selectedOnPage.length > 0;

  // Bounding box (canvas-relative px) of all selected fields on this page —
  // used to anchor the multi-select toolbar. For a single selected field
  // this collapses to the field's own bounds.
  const bounds = (() => {
    if (!hasSelection) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedOnPage.forEach(f => {
      const def = fieldDef(f.type);
      minX = Math.min(minX, f.x);
      minY = Math.min(minY, f.y);
      maxX = Math.max(maxX, f.x + def.w);
      maxY = Math.max(maxY, f.y + def.h);
    });
    return { minX, minY, maxX, maxY };
  })();

  /* ---------- drag orchestration ----------
   * Selection is NEVER mutated on pointerdown — that lets a pure tap behave as
   * a clean toggle (add/remove from current selection). Selection only changes
   * on pointerup-without-movement (toggle) or after a drag of an unselected
   * field (the dragged field becomes the new single-selection).
   */
  const dragRef = React.useRef(null);
  // {fieldId, startX, startY, pointerId, moved, wasSelected}
  const [dragOffset, setDragOffset] = React.useState({ x:0, y:0 });
  const [dragTargetId, setDragTargetId] = React.useState(null);

  const onFieldPointerDown = (e, fieldId) => {
    if (armedTool) return;            // drop-mode wins
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    dragRef.current = {
      fieldId, startX: e.clientX, startY: e.clientY,
      pointerId: e.pointerId, moved: false,
      wasSelected: selectedIds.includes(fieldId),
    };
  };

  const onFieldPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      d.moved = true;
      setDragTargetId(d.fieldId);     // start visualising the drag
    }
    if (d.moved) setDragOffset({ x:dx, y:dy });
  };

  const onFieldPointerUp = (e) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.moved) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      // If the dragged field was already in selection → move all selected.
      // Otherwise drag it solo, then make it the new single-selection.
      const ids = d.wasSelected ? selectedIds : [d.fieldId];
      onCommitDrag && onCommitDrag(ids, dx, dy);
      if (!d.wasSelected) onTapField && onTapField(d.fieldId, /*replace*/ true);
      setDragOffset({ x:0, y:0 });
      setDragTargetId(null);
    } else {
      // pure tap → toggle membership in the current selection
      onTapField && onTapField(d.fieldId, /*replace*/ false);
    }
  };

  // Per-render: which fields visually translate during the active drag?
  // - drag target itself, always
  // - other selected fields, only if the drag target was already selected
  //   (otherwise the drag is a solo move on an unselected field)
  const dragTargetSelected = dragTargetId && selectedIds.includes(dragTargetId);
  const isFieldDragging = (fid) => {
    if (!dragTargetId) return false;
    if (fid === dragTargetId) return true;
    return dragTargetSelected && selectedIds.includes(fid);
  };

  return (
    <div style={{ padding:'0', position:'relative' }}>
      {/* Tappable filmstrip */}
      <PageFilmstrip totalPages={totalPages} currentPage={page} onPage={onPage} fields={fields}/>

      {/* Page-N · armed-tool hint row */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'8px 16px 4px',
      }}>
        <div style={{
          fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-3)',
          textTransform:'uppercase', letterSpacing:'0.08em',
        }}>Page {page} of {totalPages}</div>
        {armedTool ? (
          <div style={{
            display:'inline-flex', alignItems:'center', gap:6,
            padding:'4px 10px', borderRadius:10,
            background:'var(--indigo-50)', color:'var(--indigo-700)',
            fontSize:11, fontWeight:700,
          }}>
            <Icon name={fieldDef(armedTool).icon} size={12}/>
            Tap to drop · {fieldDef(armedTool).label}
          </div>
        ) : (
          <div style={{ fontSize:11, color:'var(--fg-3)' }}>Swipe ← → to change page</div>
        )}
      </div>

      {/* Page canvas */}
      <div style={{ padding:'4px 12px 0', position:'relative' }}>
        <div onClick={(e)=>{
          if (armedTool) {
            const rect = e.currentTarget.getBoundingClientRect();
            onCanvasTap && onCanvasTap({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          } else {
            onClearSelection && onClearSelection();
          }
        }} style={{
          background:'#fff', boxShadow:'0 1px 2px rgba(11,18,32,0.06), 0 12px 32px rgba(11,18,32,0.08)',
          borderRadius:8, padding:'24px 22px', position:'relative',
          height:340, overflow:'hidden',
          cursor: armedTool ? 'crosshair' : 'default',
        }}>
          {/* page header */}
          <div style={{ fontFamily:'var(--font-serif)', fontSize:14, fontWeight:500 }}>
            Mutual NDA — Page {page}
          </div>
          <div style={{ height:8 }}/>
          {[...Array(7)].map((_,i)=>(
            <div key={i} style={{ height:4, borderRadius:2,
              background:'var(--ink-150)', margin:'5px 0',
              width:`${60+(i*13 + page*7)%35}%` }}/>
          ))}

          {/* dotted bounding box for multi-select */}
          {isMultiSelect && bounds && <SelectionBounds bounds={bounds}/>}

          {/* placed fields */}
          {visibleFields.map(f => {
            const isSelected = selectedIds.includes(f.id);
            const fDragging = isFieldDragging(f.id);
            return (
              <PlacedFieldMobile key={f.id} field={f} signers={signers}
                selected={isSelected}
                dragging={fDragging}
                dragOffset={fDragging ? dragOffset : { x:0, y:0 }}
                onPointerDown={onFieldPointerDown}
                onPointerMove={onFieldPointerMove}
                onPointerUp={onFieldPointerUp}/>
            );
          })}

          {/* single-selection toolbar */}
          {!isMultiSelect && singleSelected && !dragTargetId && (
            <FieldActionToolbar field={singleSelected} signers={signers}
              onPages={()=>onOpenApply(singleSelected.id)}
              onSigners={()=>onOpenAssign(singleSelected.id)}
              onDelete={()=>onDeleteSelected()}/>
          )}

          {/* multi-selection toolbar (selection IS the group) */}
          {isMultiSelect && bounds && !dragTargetId && (
            <GroupActionToolbar count={selectedOnPage.length} bounds={bounds}
              onPages={()=>onOpenApply(selectedOnPage[0].id)}
              onSigners={()=>onOpenAssign(selectedOnPage[0].id)}
              onDelete={onDeleteSelected}/>
          )}

          {/* Empty hint — only on truly empty page */}
          {visibleFields.length === 0 && !armedTool && (
            <div style={{
              position:'absolute', left:0, right:0, bottom:14, textAlign:'center',
              fontSize:12, color:'var(--fg-4)', padding:'0 16px',
            }}>
              Pick a field below, then tap on the page.
            </div>
          )}
        </div>
      </div>

      {/* Field tray */}
      <div style={{
        marginTop:14, padding:'12px 16px 6px',
        background:'#fff', borderTop:'0.5px solid var(--border-1)',
      }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          marginBottom:10,
        }}>
          <div style={{
            fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-3)',
            textTransform:'uppercase', letterSpacing:'0.08em',
          }}>Field tray</div>
          {armedTool && (
            <button onClick={()=>onArmTool(null)} style={{
              border:'none', background:'transparent', color:'var(--fg-3)',
              fontSize:11, fontWeight:600, cursor:'pointer',
              display:'inline-flex', alignItems:'center', gap:4,
            }}>
              <Icon name="x" size={12}/> Cancel
            </button>
          )}
        </div>
        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:6 }}>
          {FIELD_CHIPS.map(c => {
            const isArmed = armedTool === c.k;
            return (
              <button key={c.k} onClick={()=>onArmTool(isArmed ? null : c.k)} style={{
                flexShrink:0, padding:'10px 14px', borderRadius:12,
                background: isArmed ? 'var(--indigo-600)' : 'var(--ink-100)',
                color:     isArmed ? '#fff' : 'var(--fg-1)',
                border: isArmed ? '1px solid var(--indigo-700)' : '1px solid transparent',
                display:'inline-flex', alignItems:'center', gap:6,
                fontSize:13, fontWeight:600, cursor:'pointer',
                transition:'background .12s',
              }}>
                <Icon name={c.icon} size={14}/> {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Apply-to-pages bottom sheet (parity with desktop) ─────────── */
function MWApplyPagesSheet({ open, onClose, totalPages, currentPage, currentMode, onApply }) {
  const [mode, setMode] = useState(currentMode || 'this');
  const [custom, setCustom] = useState('');
  const opts = [
    { k:'this',       l:'Only this page',    hint:`Keep it only on page ${currentPage}.` },
    { k:'all',        l:'All pages',         hint:`Place on every page (1–${totalPages}).` },
    { k:'allButLast', l:'All pages but last',hint:`Pages 1–${totalPages-1}. Skips the last page.` },
    { k:'last',       l:'Last page',         hint:`Only page ${totalPages}.` },
    { k:'custom',     l:'Custom pages',      hint:'Comma-separated, e.g. 1, 3, 5.' },
  ];
  const parseCustom = () => custom.split(',').map(s=>parseInt(s.trim(),10))
    .filter(n=>!isNaN(n) && n>=1 && n<=totalPages);

  return (
    <MWBottomSheet open={open} onClose={onClose} title="Place on pages">
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {opts.map(o => {
          const isSel = mode === o.k;
          return (
            <button key={o.k} onClick={()=>setMode(o.k)} style={{
              display:'flex', alignItems:'flex-start', gap:12, padding:'12px',
              border:'1px solid', borderColor: isSel ? 'var(--indigo-500)' : 'var(--border-1)',
              borderRadius:12, background: isSel ? 'var(--indigo-50)' : '#fff',
              textAlign:'left', cursor:'pointer',
            }}>
              <span style={{
                width:20, height:20, borderRadius:10, marginTop:1,
                border: `2px solid ${isSel ? 'var(--indigo-600)' : 'var(--border-2)'}`,
                display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              }}>
                {isSel && <span style={{ width:10, height:10, borderRadius:5, background:'var(--indigo-600)' }}/>}
              </span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color: isSel ? 'var(--indigo-800)' : 'var(--fg-1)' }}>{o.l}</div>
                <div style={{ fontSize:12, color:'var(--fg-3)', marginTop:2 }}>{o.hint}</div>
              </div>
            </button>
          );
        })}
        {mode === 'custom' && (
          <input autoFocus value={custom} onChange={e=>setCustom(e.target.value)}
            placeholder="e.g. 1, 3, 5" style={mwInput()}/>
        )}
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <Button variant="secondary" onClick={onClose} style={{flex:1, justifyContent:'center', padding:'12px', borderRadius:12}}>
            Cancel
          </Button>
          <Button variant="primary" onClick={()=>onApply(mode, mode==='custom' ? parseCustom() : undefined)}
            style={{flex:1, justifyContent:'center', padding:'12px', borderRadius:12}}>
            Apply
          </Button>
        </div>
      </div>
    </MWBottomSheet>
  );
}

/* ───────────── Assign-signers bottom sheet (multi-select) ─────────── */
function MWAssignSignersSheet({ open, onClose, signers, selectedIds, onApply }) {
  const [picked, setPicked] = useState(selectedIds);
  // re-seed when opened with different selection
  React.useEffect(()=>{ setPicked(selectedIds); }, [selectedIds, open]);
  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);
  return (
    <MWBottomSheet open={open} onClose={onClose} title="Assigned signers">
      <div style={{ fontSize:12, color:'var(--fg-3)', marginBottom:10 }}>
        Pick one or more. When more than one signer is assigned, the field is split — each signer fills their half.
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {signers.map(s => {
          const isSel = picked.includes(s.id);
          return (
            <button key={s.id} onClick={()=>toggle(s.id)} style={{
              display:'flex', alignItems:'center', gap:12, padding:'10px 12px',
              border:'1px solid', borderColor: isSel ? s.color : 'var(--border-1)',
              borderRadius:12, background: isSel ? `${s.color}14` : '#fff',
              cursor:'pointer', textAlign:'left',
            }}>
              <Avatar name={s.name} color={s.color}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--fg-1)' }}>{s.name}</div>
                <div style={{ fontSize:12, color:'var(--fg-3)' }}>{s.email}</div>
              </div>
              <span style={{
                width:22, height:22, borderRadius:11,
                border: `2px solid ${isSel ? s.color : 'var(--border-2)'}`,
                background: isSel ? s.color : '#fff',
                display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              }}>
                {isSel && <Icon name="check" size={12} style={{color:'#fff'}}/>}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:8, marginTop:14 }}>
        <Button variant="secondary" onClick={onClose} style={{flex:1, justifyContent:'center', padding:'12px', borderRadius:12}}>
          Cancel
        </Button>
        <Button variant="primary" disabled={picked.length===0} onClick={()=>onApply(picked)}
          style={{flex:1, justifyContent:'center', padding:'12px', borderRadius:12}}>
          Apply
        </Button>
      </div>
    </MWBottomSheet>
  );
}

/* ───────────── 5. Review ───────────── */
function MWReview({ signers, onTitle, title, message, onMessage, fields }) {
  const fieldsBySigner = useMemo(() => {
    const m = {};
    signers.forEach(s => { m[s.id] = 0; });
    fields.forEach(f => {
      const pages = (f.linkedPages || [f.page]).length;
      f.signerIds.forEach(sid => { if (m[sid] != null) m[sid] += pages; });
    });
    return m;
  }, [fields, signers]);
  return (
    <div style={{ padding:'4px 16px 24px' }}>
      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:14,
        padding:'12px 14px', marginBottom:10,
      }}>
        <div style={{
          fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-3)',
          textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6,
        }}>Title</div>
        <input value={title} onChange={(e)=>onTitle && onTitle(e.target.value)} style={{
          width:'100%', border:'none', outline:'none',
          fontFamily:'var(--font-serif)', fontSize:18, fontWeight:500,
          color:'var(--fg-1)', letterSpacing:'-0.01em',
        }}/>
      </div>
      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:14,
        padding:'12px 14px', marginBottom:10,
        display:'flex', flexDirection:'column', gap:10,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <DocThumb size={36}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--fg-1)' }}>NDA — Quill Capital.pdf</div>
            <div style={{ fontSize:12, color:'var(--fg-3)', fontFamily:'var(--font-mono)', marginTop:2 }}>
              {TOTAL_PAGES} pages · {fields.length} fields · {signers.length} signers
            </div>
          </div>
        </div>
        {signers.map(s => (
          <div key={s.email} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Avatar name={s.name} color={s.color}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--fg-1)' }}>{s.name}</div>
              <div style={{ fontSize:12, color:'var(--fg-3)' }}>{s.email}</div>
            </div>
            <Badge tone="indigo">{fieldsBySigner[s.id] || 0} fields</Badge>
          </div>
        ))}
      </div>
      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:14,
        padding:'12px 14px', marginBottom:10,
      }}>
        <div style={{
          fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-3)',
          textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6,
        }}>Message (optional)</div>
        <textarea value={message} onChange={(e)=>onMessage && onMessage(e.target.value)}
          placeholder="Add a short note for your signers" rows={3} style={{
          width:'100%', border:'none', outline:'none', resize:'none',
          fontFamily:'var(--font-sans)', fontSize:14, color:'var(--fg-1)', lineHeight:1.5,
        }}/>
      </div>
      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:14,
        padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--fg-1)' }}>Expires</div>
          <div style={{ fontSize:12, color:'var(--fg-3)', marginTop:2 }}>30 days from send</div>
        </div>
        <button style={{
          border:'1px solid var(--border-1)', background:'#fff',
          borderRadius:10, padding:'6px 12px', fontSize:13, fontWeight:600,
          color:'var(--fg-2)', cursor:'pointer',
        }}>Edit</button>
      </div>
    </div>
  );
}

/* ───────────── 6. Sent ───────────── */
function MWSent({ onView, onAnother, signers }) {
  const headline = signers.length === 1
    ? `We've emailed ${signers[0].name.split(' ')[0]}.`
    : `We've emailed ${signers.length} signers.`;
  return (
    <div style={{ padding:'48px 24px 24px', textAlign:'center' }}>
      <div style={{
        width:64, height:64, borderRadius:32, background:'var(--success-50)',
        margin:'0 auto 24px', display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name="check" size={32} style={{color:'var(--success-700)'}}/>
      </div>
      <div style={{
        fontFamily:'var(--font-script, "Caveat", cursive)',
        fontSize:64, fontWeight:600, color:'var(--indigo-700)',
        lineHeight:1, marginBottom:6,
      }}>Sealed.</div>
      <div style={{
        fontFamily:'var(--font-serif)', fontSize:24, fontWeight:500,
        color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.2,
        marginBottom:8,
      }}>Sent for signature</div>
      <div style={{
        fontSize:14, color:'var(--fg-3)', maxWidth:280, margin:'0 auto 28px',
      }}>
        {headline} You'll get a notification the moment they sign.
      </div>
      <div style={{
        background:'#fff', border:'1px solid var(--border-1)', borderRadius:16,
        padding:'14px 16px', display:'flex', alignItems:'center', gap:12,
        textAlign:'left', margin:'0 auto 28px',
      }}>
        <DocThumb size={42}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--fg-1)' }}>NDA — Quill Capital</div>
          <div style={{ fontSize:12, color:'var(--fg-3)', fontFamily:'var(--font-mono)', marginTop:2 }}>
            DOC-2C1A · awaiting {signers.length === 1 ? signers[0].name.split(' ')[0] : `${signers.length} signers`}
          </div>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <Button variant="primary" onClick={onView} style={{
          width:'100%', justifyContent:'center', padding:'14px', fontSize:15, borderRadius:14,
        }}>View status</Button>
        <Button variant="secondary" onClick={onAnother} style={{
          width:'100%', justifyContent:'center', padding:'14px', fontSize:15, borderRadius:14,
        }}>Send another</Button>
      </div>
    </div>
  );
}

/* ───────────── Wrapper ───────────── */
function MobileWebSend({ initialStep = 'start', interactive = true }) {
  // Map place sub-variants → step='place' + variant
  const placeVariants = [
    'place-empty','place-armed','place-selected','place-apply','place-assign',
    'place-linked','place-group','place-pick-signer',
  ];
  const isPlaceVariant = placeVariants.includes(initialStep);
  const [step, setStep] = useState(isPlaceVariant ? 'place' : initialStep);
  const variant = isPlaceVariant ? initialStep : null;

  const [sheet, setSheet] = useState(
    variant === 'place-apply' ? 'apply' :
    variant === 'place-assign' || variant === 'place-pick-signer' ? 'assign' : null
  );
  // When the assign sheet was opened by a fresh drop (vs the field's own
  // "Signers" toolbar), we seed the picker with ALL signers preselected so
  // the multi-signer flow is one-tap. Editing an existing field uses the
  // field's own signerIds instead.
  const [assignSeedAll, setAssignSeedAll] = useState(
    variant === 'place-pick-signer'
  );
  const [meIncluded, setMeIncluded] = useState(false);
  // 2 signers by default — enough to demonstrate the picker on drop
  const [signers, setSigners] = useState(DEMO_SIGNERS.slice(0, 2));
  const [page, setPage] = useState(
    variant === 'place-linked' ? 7 :
    variant === 'place-group' ? 3 :
    variant === 'place-apply' || variant === 'place-assign' ||
    variant === 'place-selected' || variant === 'place-pick-signer' ? 2 :
    1
  );
  const [armedTool, setArmedTool] = useState(variant === 'place-armed' ? 'sig' : null);
  const [title, setTitle] = useState('NDA — Quill Capital');
  const [message, setMessage] = useState('Hi team — quick NDA before our call. Thanks!');

  // Seed fields per variant
  const [fields, setFields] = useState(() => {
    if (variant === 'place-empty' || variant === 'place-armed') return [];
    if (variant === 'place-linked') return [{
      id:'f1', type:'sig', page:1, x:30, y:240,
      signerIds:['s1','s2'],
      linkedPages: Array.from({length: TOTAL_PAGES-1}, (_,i)=>i+1), // all but last
    }];
    if (variant === 'place-group') return [
      // 3 fields tap-selected together — the selection itself acts as a group;
      // tap any member to remove it (no separate Group/Ungroup verbs).
      { id:'f1', type:'sig', page:3, x:24,  y:200, signerIds:['s1'], linkedPages:[3] },
      { id:'f2', type:'dat', page:3, x:220, y:206, signerIds:['s1'], linkedPages:[3] },
      { id:'f3', type:'ini', page:3, x:24,  y:260, signerIds:['s1'], linkedPages:[3] },
    ];
    if (variant === 'place-pick-signer') return [
      // Freshly dropped field with 2 signers configured → defaults to ALL signers
      // and the picker opens so the user can deselect any they don't want.
      { id:'fnew', type:'sig', page:2, x:60, y:230, signerIds:['s1','s2'], linkedPages:[2] },
    ];
    if (variant === 'place-apply' || variant === 'place-assign' || variant === 'place-selected') {
      return [{ id:'f1', type:'sig', page:2, x:30, y:240, signerIds:['s1'], linkedPages:[2] }];
    }
    // interactive flow default
    return [{ id:'f1', type:'sig', page:2, x:30, y:240, signerIds:['s1'], linkedPages:[2] }];
  });
  const [selectedIds, setSelectedIds] = useState(() => {
    if (variant === 'place-pick-signer') return ['fnew'];
    if (variant === 'place-group') return ['f1','f2','f3'];
    if (variant && variant !== 'place-empty' && variant !== 'place-armed' && variant !== 'place-linked') return ['f1'];
    return [];
  });

  const order = ['start','file','signers','place','review','sent'];
  const stepNum = order.indexOf(step) + 1;
  const goto = (s) => interactive && setStep(s);
  const back = () => {
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i-1]);
  };

  /* --- field operations --- */
  // Approximate canvas bounds for clamping drag (matches MWPlace canvas geometry).
  // 402 mirrors MW_DEVICE_W in mobile-web-frame.jsx — inlined because <script
  // type="text/babel"> tags don't share top-level `const`s across files.
  const CANVAS_W = 402 - 24 /* outer padding */ - 22 * 2 /* canvas inner padding */;
  const CANVAS_H = 340;

  // Drop a single placeholder field at the tap position. The signer picker
  // sheet then opens (when ≥2 signers exist) and `assignSigners` does the
  // actual split-into-N if more than one signer is chosen — mirroring the
  // web SPA's `usePlacement.applySignerSelection` behavior. The placeholder
  // is created with one signer assigned (the first), so even if the user
  // dismisses the sheet without changing anything we end up with a valid
  // single-signer field at the right spot.
  const dropField = (pos) => {
    if (!armedTool) return;
    const def = fieldDef(armedTool);
    const id = `f${Date.now()}`;
    const newField = {
      id, type: armedTool, page,
      x: Math.max(8, pos.x - def.w/2),
      y: Math.max(8, pos.y - def.h/2),
      signerIds: signers.length ? [signers[0].id] : [],
      linkedPages: [page],
    };
    setFields(fs => [...fs, newField]);
    setArmedTool(null);
    setSelectedIds([id]);
    if (signers.length > 1) {
      setAssignSeedAll(true);
      setSheet('assign');
    }
  };

  // tap a placed field: pure toggle in/out of the current selection.
  // The selection itself acts as the (ad-hoc) group — there's no separate
  // sticky group concept anymore. `replace=true` is used after a drag of
  // an unselected field, where that field becomes the new single-selection.
  const tapField = (fid, replace) => {
    setSelectedIds(prev => {
      if (replace) return [fid];
      return prev.includes(fid) ? prev.filter(id => id !== fid) : [...prev, fid];
    });
  };

  // ids is the set of fields to translate. The visible page also matters:
  // a field that's linked to the current page moves on this page (its base
  // x/y is the rendered position regardless of linked-page count).
  const commitDrag = (ids, dx, dy) => {
    setFields(fs => fs.map(f => {
      if (!ids.includes(f.id)) return f;
      const def = fieldDef(f.type);
      const w = (f.signerIds.length > 1 ? def.w * 2 + 8 : def.w);
      return {
        ...f,
        x: Math.max(8, Math.min(CANVAS_W - w  - 8, f.x + dx)),
        y: Math.max(8, Math.min(CANVAS_H - def.h - 8, f.y + dy)),
      };
    }));
  };

  const applyToPages = (mode, customPages) => {
    if (!selectedIds.length) return;
    let pages = [];
    if (mode === 'this')       pages = [page];
    else if (mode === 'all')   pages = Array.from({length: TOTAL_PAGES}, (_,i)=>i+1);
    else if (mode === 'allButLast') pages = Array.from({length: TOTAL_PAGES-1}, (_,i)=>i+1);
    else if (mode === 'last')  pages = [TOTAL_PAGES];
    else if (mode === 'custom') pages = customPages || [page];
    setFields(fs => fs.map(f => selectedIds.includes(f.id) ? {...f, linkedPages: pages} : f));
    setSheet(null);
  };
  // Mirror the web SPA's `usePlacement.applySignerSelection` (apps/web/src/
  // features/documentEditor/model/usePlacement.ts:104-119): when ≥2 signers
  // are picked for a single source field, replace it with N independent
  // single-signer fields placed side-by-side at `source.x + idx * stride`.
  // The user can then tap each one individually to ungroup — same model as
  // the web. When only 1 signer is picked we just reassign in place.
  const assignSigners = (signerIds) => {
    if (!selectedIds.length) return;
    setFields(fs => {
      const out = [];
      const newSelectedIds = [];
      fs.forEach(f => {
        if (!selectedIds.includes(f.id)) { out.push(f); return; }
        if (signerIds.length <= 1) {
          out.push({ ...f, signerIds });
          newSelectedIds.push(f.id);
          return;
        }
        // ≥2 signers → split into N side-by-side single-signer fields.
        const def = fieldDef(f.type);
        const stride = def.w + 8;
        const maxX = CANVAS_W - def.w - 8;
        signerIds.forEach((sid, idx) => {
          const nid = `f${Date.now()}-${idx}-${Math.random().toString(36).slice(2,6)}`;
          out.push({
            ...f,
            id: nid,
            x: Math.min(maxX, f.x + idx * stride),
            signerIds: [sid],
          });
          newSelectedIds.push(nid);
        });
      });
      // Reselect the new fields so the user can immediately tap-to-deselect
      // any one individually (the "ungroup" behavior).
      setSelectedIds(newSelectedIds);
      return out;
    });
    setSheet(null);
  };
  const deleteSelected = () => {
    setFields(fs => fs.filter(f => !selectedIds.includes(f.id)));
    setSelectedIds([]);
  };

  // Sticky-bottom CTAs per step
  const ctas = {
    start: null,
    file: (
      <MWStickyBar>
        <Button variant="secondary" style={{flex:1, justifyContent:'center', padding:'14px', borderRadius:14}}>Cancel</Button>
        <Button variant="primary" icon="arrow-right" style={{flex:2, justifyContent:'center', padding:'14px', borderRadius:14}}
          onClick={()=>goto('signers')}>Continue</Button>
      </MWStickyBar>
    ),
    signers: (
      <Button variant="primary" icon="arrow-right" onClick={()=>goto('place')} style={{
        width:'100%', justifyContent:'center', padding:'14px', fontSize:15, borderRadius:14,
      }}>Next: place fields</Button>
    ),
    place: (
      <Button variant="primary" icon="arrow-right" onClick={()=>goto('review')} style={{
        width:'100%', justifyContent:'center', padding:'14px', fontSize:15, borderRadius:14,
      }}>Review · {fields.length} field{fields.length===1?'':'s'}</Button>
    ),
    review: (
      <Button variant="primary" icon="send" onClick={()=>goto('sent')} style={{
        width:'100%', justifyContent:'center', padding:'14px', fontSize:15, borderRadius:14,
      }}>Send for signature</Button>
    ),
    sent: null,
  };

  const stepLabels = {
    start: 'Pick your starting point',
    file: 'Confirm the file',
    signers: 'Who is signing?',
    place: 'Place the fields',
    review: 'Review & send',
    sent: 'All done',
  };

  // Pages/Signers sheets need a "representative" field for default state.
  // For multi-select we use the first selected; operations are applied to all.
  const representative = fields.find(f => selectedIds.includes(f.id)) || null;

  return (
    <div style={{ position:'relative' }}>
      <MobileWebDevice url={MW_URL[step]} stickyBottom={ctas[step]}>
        {step !== 'start' && step !== 'sent' && (
          <MWStep step={stepNum} total={6} onBack={interactive ? back : null} label={stepLabels[step]}/>
        )}
        {step === 'start'   && <MWStart   onPick={()=>goto('file')}/>}
        {step === 'file'    && <MWFile    onReplace={()=>goto('start')}/>}
        {step === 'signers' && (
          <MWSigners
            signers={signers} meIncluded={meIncluded}
            onMeToggle={()=>setMeIncluded(v=>!v)}
            onAdd={()=>setSheet('addSigner')}
          />
        )}
        {step === 'place' && (
          <MWPlace
            page={page} totalPages={TOTAL_PAGES} onPage={setPage}
            fields={fields} signers={signers}
            selectedIds={selectedIds}
            onTapField={tapField}
            onClearSelection={()=>setSelectedIds([])}
            armedTool={armedTool} onArmTool={setArmedTool}
            onCanvasTap={dropField}
            onOpenApply={()=>setSheet('apply')}
            onOpenAssign={()=>{ setAssignSeedAll(false); setSheet('assign'); }}
            onDeleteSelected={deleteSelected}
            onCommitDrag={commitDrag}
          />
        )}
        {step === 'review'  && (
          <MWReview
            signers={signers} fields={fields}
            title={title} onTitle={setTitle}
            message={message} onMessage={setMessage}
          />
        )}
        {step === 'sent'    && <MWSent onView={()=>goto('start')} onAnother={()=>goto('start')} signers={signers}/>}

        {/* Bottom sheets */}
        <MWApplyPagesSheet
          open={sheet === 'apply'} onClose={()=>setSheet(null)}
          totalPages={TOTAL_PAGES} currentPage={page}
          currentMode={representative ? (
            (representative.linkedPages || [representative.page]).length === TOTAL_PAGES ? 'all' :
            (representative.linkedPages || [representative.page]).length === TOTAL_PAGES - 1 ? 'allButLast' :
            'this'
          ) : 'this'}
          onApply={applyToPages}
        />
        <MWAssignSignersSheet
          open={sheet === 'assign'} onClose={()=>setSheet(null)}
          signers={signers}
          selectedIds={
            assignSeedAll
              ? signers.map(s => s.id)
              : (representative ? representative.signerIds : [])
          }
          onApply={assignSigners}
        />
        <MWBottomSheet open={sheet==='addSigner'} onClose={()=>setSheet(null)} title="Add a signer">
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <div style={{ fontSize:12, color:'var(--fg-3)', marginBottom:6, fontWeight:600 }}>Name</div>
              <input placeholder="Full name" style={mwInput()}/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'var(--fg-3)', marginBottom:6, fontWeight:600 }}>Email</div>
              <input placeholder="name@example.com" style={mwInput()}/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'var(--fg-3)', marginBottom:6, fontWeight:600 }}>Role</div>
              <input placeholder="Signer / Approver / CC" style={mwInput()}/>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <Button variant="secondary" onClick={()=>setSheet(null)} style={{flex:1, justifyContent:'center', padding:'12px', borderRadius:12}}>Cancel</Button>
              <Button variant="primary" onClick={()=>{
                const next = DEMO_SIGNERS[signers.length];
                if (next) setSigners(s => [...s, next]);
                setSheet(null);
              }} style={{flex:1, justifyContent:'center', padding:'12px', borderRadius:12}}>Add</Button>
            </div>
            <button onClick={()=>setSheet(null)} style={{
              border:'none', background:'transparent', color:'var(--indigo-700)',
              fontSize:13, fontWeight:600, padding:'10px 0', cursor:'pointer',
              display:'flex', alignItems:'center', gap:8, justifyContent:'center',
            }}>
              <Icon name="users" size={14}/> Pick from contacts instead
            </button>
          </div>
        </MWBottomSheet>
      </MobileWebDevice>
    </div>
  );
}

function mwInput() {
  return {
    width:'100%', boxSizing:'border-box',
    border:'1px solid var(--border-1)', borderRadius:12,
    padding:'12px 14px', fontFamily:'var(--font-sans)', fontSize:15,
    color:'var(--fg-1)', outline:'none', background:'#fff',
  };
}

Object.assign(window, { MobileWebSend });
