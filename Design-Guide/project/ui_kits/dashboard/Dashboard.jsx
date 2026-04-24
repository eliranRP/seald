/* @jsx React.createElement */
const { useState } = React;

// Multi-signer data model — each envelope has signers with per-signer status
const DOCS = [
  {
    id: 'DOC-8F3A',
    t: 'Master services agreement',
    status: 'amber',
    statusLabel: 'Awaiting others',
    date: 'Apr 18',
    signers: [
      { name: 'Eliran Azulay',  email: 'eliran@sealed.dev',     status: 'signed',  at: 'Apr 18 · 10:42 AM' },
      { name: 'Maya Raskin',    email: 'maya@farrow.co',        status: 'signed',  at: 'Apr 19 · 09:12 AM' },
      { name: 'Hannah Wills',   email: 'hannah@farrow.co',      status: 'pending', at: null },
    ],
  },
  {
    id: 'DOC-02B1',
    t: 'NDA — Quill Capital',
    status: 'indigo',
    statusLabel: 'Awaiting you',
    date: 'Apr 20',
    signers: [
      { name: 'Jonah Park',     email: 'jonah@quill.vc',        status: 'signed',  at: 'Apr 20 · 11:30 AM' },
      { name: 'You',            email: 'you@sealed.dev',        status: 'awaiting-you', at: null },
    ],
  },
  {
    id: 'DOC-771A',
    t: 'Offer letter — M. Chen',
    status: 'emerald',
    statusLabel: 'Completed',
    date: 'Apr 14',
    signers: [
      { name: 'You',            email: 'you@sealed.dev',        status: 'signed',  at: 'Apr 14 · 08:05 AM' },
      { name: 'Meilin Chen',    email: 'meilin@chen.co',        status: 'signed',  at: 'Apr 14 · 02:44 PM' },
    ],
  },
  {
    id: 'DOC-4C0F',
    t: 'Consulting agreement',
    status: 'emerald',
    statusLabel: 'Completed',
    date: 'Apr 11',
    signers: [
      { name: 'You',            email: 'you@sealed.dev',        status: 'signed',  at: 'Apr 11 · 09:18 AM' },
      { name: 'Priya Kapoor',   email: 'priya@kapoor.co',       status: 'signed',  at: 'Apr 11 · 04:00 PM' },
    ],
  },
  {
    id: 'DOC-9D22',
    t: 'Lease renewal — 44 Maple',
    status: 'red',
    statusLabel: 'Declined',
    date: 'Apr 09',
    signers: [
      { name: 'You',            email: 'you@sealed.dev',        status: 'signed',   at: 'Apr 09 · 11:00 AM' },
      { name: 'Carmen Ortiz',   email: 'carmen@ortizhold.com',  status: 'declined', at: 'Apr 09 · 04:12 PM' },
    ],
  },
  {
    id: 'DOC-5E70',
    t: 'Vendor onboarding — Argus',
    status: 'neutral',
    statusLabel: 'Draft',
    date: 'Apr 08',
    signers: [
      { name: 'Ops Team',       email: 'ops@argus.io',          status: 'draft',    at: null },
    ],
  },
  {
    id: 'DOC-1A33',
    t: 'Photography release',
    status: 'emerald',
    statusLabel: 'Completed',
    date: 'Apr 02',
    signers: [
      { name: 'Arlo Greene',    email: 'arlo@studio.co',        status: 'signed',  at: 'Apr 02 · 10:20 AM' },
    ],
  },
];

// === signer pill + stacked avatars ===
const STATUS_THEME = {
  signed:       { dot: 'var(--success-500)', bg: '#ECFDF5', fg: '#047857', label: 'Signed' },
  pending:      { dot: 'var(--warn-500)',    bg: '#FFFBEB', fg: '#B45309', label: 'Waiting' },
  'awaiting-you':{ dot: 'var(--indigo-600)', bg: '#EEF2FF', fg: '#3730A3', label: 'Your turn' },
  declined:     { dot: 'var(--danger-500)',  bg: '#FEF2F2', fg: '#B91C1C', label: 'Declined' },
  draft:        { dot: 'var(--fg-4)',        bg: 'var(--ink-100)', fg: 'var(--fg-3)', label: 'Not sent' },
};

function initials(name){
  return name.split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

function SignerStack({ signers, onOpen }){
  // Stacked avatars with status ring; hover shows a popover-style list
  const [open, setOpen] = useState(false);
  const signedCount = signers.filter(s=>s.status==='signed').length;
  return (
    <div style={{position:'relative', display:'flex', alignItems:'center', gap:10}}
         onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
      <div style={{display:'flex'}}>
        {signers.slice(0,4).map((s,i)=>{
          const t = STATUS_THEME[s.status];
          return (
            <div key={s.email} style={{
              width:28, height:28, borderRadius:999, background:'var(--indigo-600)',
              color:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:10, fontWeight:700, marginLeft: i===0?0:-8,
              border:`2px solid ${t.dot}`, boxShadow:'0 0 0 2px #fff',
              opacity: s.status==='pending'||s.status==='draft' ? 0.5 : 1,
              position:'relative', zIndex: signers.length - i,
            }}>
              {initials(s.name)}
            </div>
          );
        })}
        {signers.length > 4 && (
          <div style={{width:28,height:28,borderRadius:999,background:'var(--ink-100)',color:'var(--fg-2)',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,
            marginLeft:-8,border:'2px solid #fff'}}>+{signers.length-4}</div>
        )}
      </div>
      <div style={{fontSize:12, color:'var(--fg-3)', fontFamily:'var(--font-mono)'}}>
        {signedCount}/{signers.length} signed
      </div>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:40,
          background:'#fff', border:'1px solid var(--border-1)', borderRadius:12,
          boxShadow:'var(--shadow-lg)', minWidth:280, padding:6,
        }}>
          {signers.map(s=>{
            const t = STATUS_THEME[s.status];
            return (
              <div key={s.email} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8}}>
                <div style={{width:24,height:24,borderRadius:999,background:'var(--indigo-600)',color:'#fff',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,
                  opacity: s.status==='pending'||s.status==='draft' ? 0.5 : 1}}>{initials(s.name)}</div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--fg-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.name}</div>
                  <div style={{fontSize:11,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{s.at || '—'}</div>
                </div>
                <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:600,
                  padding:'3px 8px',borderRadius:999,background:t.bg,color:t.fg}}>
                  <span style={{width:5,height:5,borderRadius:999,background:t.dot}}/>{t.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SignerProgressBar({ signers }){
  // A thin segmented bar — each signer is one segment, colored by status
  return (
    <div style={{display:'flex',gap:2,height:4,width:120,borderRadius:999,overflow:'hidden',background:'var(--ink-100)'}}>
      {signers.map((s,i)=>{
        const t = STATUS_THEME[s.status];
        return <div key={i} style={{flex:1, background: s.status==='signed'?t.dot : s.status==='awaiting-you'?t.dot : s.status==='declined'?t.dot : 'transparent'}}/>;
      })}
    </div>
  );
}

function Dashboard({ onOpen }) {
  const [tab, setTab] = useState('all');

  const filters = [
    {id:'all', l:'All', n: DOCS.length},
    {id:'you', l:'Awaiting you', n: DOCS.filter(d=>d.status==='indigo').length},
    {id:'others', l:'Awaiting others', n: DOCS.filter(d=>d.status==='amber').length},
    {id:'completed', l:'Completed', n: DOCS.filter(d=>d.status==='emerald').length},
    {id:'drafts', l:'Drafts', n: DOCS.filter(d=>d.status==='neutral').length},
  ];

  const visible = tab==='all' ? DOCS :
    tab==='you' ? DOCS.filter(d=>d.status==='indigo') :
    tab==='others' ? DOCS.filter(d=>d.status==='amber') :
    tab==='completed' ? DOCS.filter(d=>d.status==='emerald') :
    tab==='drafts' ? DOCS.filter(d=>d.status==='neutral') : DOCS;

  return (
    <div data-screen-label="Dashboard">
      <TopNav/>
      <div style={{display:'flex'}}>
        <LeftRail active="sent"/>
        <div style={{flex:1, padding:'40px 48px 80px', maxWidth:1320}}>
          <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:28}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase'}}>Documents</div>
              <div style={{fontFamily:'var(--font-serif)',fontSize:40,fontWeight:500,color:'var(--fg-1)',letterSpacing:'-0.02em',marginTop:4}}>Everything you've sent</div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <Button variant="secondary" icon="filter">Filter</Button>
              <Button variant="primary" icon="upload-cloud">New document</Button>
            </div>
          </div>

          {/* Stat row */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
            {[{l:'Awaiting you',v:1,tone:'var(--indigo-600)'},{l:'Awaiting others',v:1,tone:'var(--warn-500)'},{l:'Completed this month',v:12,tone:'var(--success-500)'},{l:'Avg. turnaround',v:'1.8d',tone:'var(--fg-2)'}].map(s=>(
              <div key={s.l} style={{background:'#fff',border:'1px solid var(--border-1)',borderRadius:14,padding:'18px 20px'}}>
                <div style={{fontSize:13,color:'var(--fg-3)',fontWeight:500}}>{s.l}</div>
                <div style={{fontFamily:'var(--font-serif)',fontSize:32,fontWeight:500,color:s.tone,marginTop:4,letterSpacing:'-0.02em'}}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{display:'flex',gap:6,borderBottom:'1px solid var(--border-1)',marginBottom:0}}>
            {filters.map(f=>(
              <div key={f.id} onClick={()=>setTab(f.id)} style={{padding:'12px 14px',fontSize:14,fontWeight:600,color:tab===f.id?'var(--fg-1)':'var(--fg-3)',borderBottom:tab===f.id?'2px solid var(--indigo-600)':'2px solid transparent',cursor:'pointer',marginBottom:-1,display:'flex',alignItems:'center',gap:8}}>
                {f.l}<span style={{fontSize:12,color:'var(--fg-3)',background:'var(--ink-100)',padding:'1px 7px',borderRadius:999}}>{f.n}</span>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{background:'#fff',border:'1px solid var(--border-1)',borderTop:'none',borderRadius:'0 0 16px 16px',overflow:'visible'}}>
            <div style={{display:'grid',gridTemplateColumns:'1.3fr 1.5fr 1fr 180px 100px 60px',padding:'12px 20px',background:'var(--ink-50)',borderBottom:'1px solid var(--border-1)',fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase'}}>
              <div>Document</div><div>Signers</div><div>Progress</div><div>Status</div><div>Date</div><div></div>
            </div>
            {visible.map((d,i)=>(
              <div key={d.id}
                   onClick={()=>onOpen && onOpen(d)}
                   style={{display:'grid',gridTemplateColumns:'1.3fr 1.5fr 1fr 180px 100px 60px',padding:'14px 20px',borderBottom: i<visible.length-1?'1px solid var(--border-1)':'none',alignItems:'center',cursor:'pointer',transition:'background 120ms'}}
                   onMouseEnter={e=>e.currentTarget.style.background='var(--ink-50)'}
                   onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{display:'flex',gap:12,alignItems:'center',minWidth:0}}>
                  <DocThumb size={40} signed={d.status==='emerald'}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,color:'var(--fg-1)',fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{d.t}</div>
                    <div style={{fontSize:12,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{d.id}</div>
                  </div>
                </div>
                <div><SignerStack signers={d.signers}/></div>
                <div><SignerProgressBar signers={d.signers}/></div>
                <div><Badge tone={d.status}>{d.statusLabel}</Badge></div>
                <div style={{fontSize:13,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{d.date}</div>
                <div style={{textAlign:'right'}}>
                  <Icon name="chevron-right" size={18} style={{color:'var(--fg-3)'}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, DOCS });
