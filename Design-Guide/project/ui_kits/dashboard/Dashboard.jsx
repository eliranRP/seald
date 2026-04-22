/* @jsx React.createElement */
const { useState } = React;

function Dashboard() {
  const [tab, setTab] = useState('all');
  const docs = [
    {t:'Master services agreement', to:'Farrow & Wills', status:'amber', statusLabel:'Awaiting others', date:'Apr 18', id:'DOC-8F3A'},
    {t:'NDA — Quill Capital', to:'quill.vc', status:'indigo', statusLabel:'Awaiting you', date:'Apr 20', id:'DOC-02B1'},
    {t:'Offer letter — M. Chen', to:'meilin@chen.co', status:'emerald', statusLabel:'Completed', date:'Apr 14', id:'DOC-771A'},
    {t:'Consulting agreement', to:'Priya Kapoor', status:'emerald', statusLabel:'Completed', date:'Apr 11', id:'DOC-4C0F'},
    {t:'Lease renewal — 44 Maple', to:'Ortiz Holdings', status:'red', statusLabel:'Declined', date:'Apr 09', id:'DOC-9D22'},
    {t:'Vendor onboarding — Argus', to:'ops@argus.io', status:'neutral', statusLabel:'Draft', date:'Apr 08', id:'DOC-5E70'},
    {t:'Photography release', to:'arlo@studio.co', status:'emerald', statusLabel:'Completed', date:'Apr 02', id:'DOC-1A33'},
  ];
  const filters = [
    {id:'all', l:'All', n: docs.length},
    {id:'you', l:'Awaiting you', n: 1},
    {id:'others', l:'Awaiting others', n: 1},
    {id:'completed', l:'Completed', n: 3},
    {id:'drafts', l:'Drafts', n: 1},
  ];

  return (
    <div data-screen-label="Dashboard">
      <TopNav/>
      <div style={{display:'flex'}}>
        <LeftRail active="sent"/>
        <div style={{flex:1, padding:'40px 48px 80px', maxWidth:1280}}>
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
            {[{l:'Awaiting you',v:1,tone:'var(--indigo-600)'},{l:'Awaiting others',v:4,tone:'var(--warn-500)'},{l:'Completed this month',v:12,tone:'var(--success-500)'},{l:'Avg. turnaround',v:'1.8d',tone:'var(--fg-2)'}].map(s=>(
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
          <div style={{background:'#fff',border:'1px solid var(--border-1)',borderTop:'none',borderRadius:'0 0 16px 16px',overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 180px 100px 80px',padding:'12px 20px',background:'var(--ink-50)',borderBottom:'1px solid var(--border-1)',fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase'}}>
              <div>Document</div><div>Recipient</div><div>Status</div><div>Date</div><div></div>
            </div>
            {docs.map((d,i)=>(
              <div key={d.id} style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 180px 100px 80px',padding:'14px 20px',borderBottom: i<docs.length-1?'1px solid var(--border-1)':'none',alignItems:'center',cursor:'pointer'}}>
                <div style={{display:'flex',gap:12,alignItems:'center',minWidth:0}}>
                  <DocThumb size={40} signed={d.status==='emerald'}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,color:'var(--fg-1)',fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{d.t}</div>
                    <div style={{fontSize:12,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{d.id}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <Avatar name={d.to} size={24}/>
                  <span style={{fontSize:13,color:'var(--fg-2)'}}>{d.to}</span>
                </div>
                <div><Badge tone={d.status}>{d.statusLabel}</Badge></div>
                <div style={{fontSize:13,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>{d.date}</div>
                <div style={{textAlign:'right'}}><Icon name="more-horizontal" size={18} style={{color:'var(--fg-3)'}}/></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
