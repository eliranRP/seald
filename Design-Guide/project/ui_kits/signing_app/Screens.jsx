/* @jsx React.createElement */
/* Signing App — top-level app shell + screens.
   Demonstrates: upload → place fields → sign → sent. */

const { useState } = React;

function TopNav({ onLogo }) {
  return (
    <div style={{
      position:'sticky', top:0, zIndex:20, height:56,
      background:'rgba(255,255,255,0.82)', backdropFilter:'blur(12px)',
      borderBottom:'1px solid var(--border-1)',
      display:'flex', alignItems:'center', padding:'0 24px', gap:24
    }}>
      <img src="../../assets/logo.svg" height="26" alt="Sealed" onClick={onLogo} style={{cursor:'pointer'}}/>
      <div style={{display:'flex',gap:4,marginLeft:16}}>
        {['Documents','Templates','Signers','Reports'].map(l => (
          <div key={l} style={{padding:'6px 12px',borderRadius:8,fontSize:14,fontWeight:500,color:l==='Documents'?'var(--fg-1)':'var(--fg-3)',cursor:'pointer'}}>{l}</div>
        ))}
      </div>
      <div style={{flex:1}}/>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:'var(--ink-100)',borderRadius:999,fontSize:13,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>
          <Icon name="search" size={14}/> ⌘K
        </div>
        <Icon name="bell" size={18} style={{color:'var(--fg-3)'}}/>
        <Avatar name="Jamie Okonkwo" size={32}/>
      </div>
    </div>
  );
}

function LeftRail({ active = 'inbox', onPick }) {
  const items = [
    { id:'inbox', label:'Inbox', icon:'inbox', count: 3 },
    { id:'sent', label:'Sent', icon:'send', count: 12 },
    { id:'drafts', label:'Drafts', icon:'file-text', count: 2 },
    { id:'completed', label:'Completed', icon:'check-circle-2', count: 48 },
    { id:'templates', label:'Templates', icon:'bookmark' },
  ];
  return (
    <div style={{width:240, padding:'16px 12px', borderRight:'1px solid var(--border-1)', height:'calc(100vh - 56px)', position:'sticky', top:56, background:'var(--ink-50)'}}>
      <Button variant="primary" icon="upload-cloud" style={{width:'100%', justifyContent:'center'}}>New document</Button>
      <div style={{height:20}}/>
      {items.map(it => (
        <div key={it.id} onClick={()=>onPick && onPick(it.id)}
          style={{
            display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:10,
            background: active===it.id?'#fff':'transparent',
            border: active===it.id?'1px solid var(--border-1)':'1px solid transparent',
            color: active===it.id?'var(--fg-1)':'var(--fg-2)',
            fontSize:14, fontWeight: active===it.id?600:500, cursor:'pointer', marginBottom:2,
          }}>
          <Icon name={it.icon} size={16} style={{color: active===it.id?'var(--indigo-600)':'var(--fg-3)'}}/>
          <span style={{flex:1}}>{it.label}</span>
          {it.count != null && <span style={{fontSize:12,color:'var(--fg-3)',fontWeight:500}}>{it.count}</span>}
        </div>
      ))}
      <div style={{height:28}}/>
      <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase',padding:'0 12px 8px'}}>Folders</div>
      {['Client contracts','HR','Vendor NDAs'].map(f => (
        <div key={f} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 12px',borderRadius:10,color:'var(--fg-2)',fontSize:14,cursor:'pointer'}}>
          <Icon name="folder" size={16} style={{color:'var(--fg-3)'}}/>{f}
        </div>
      ))}
    </div>
  );
}

/* ----- Screen 1: Upload ----- */
function UploadScreen({ onNext }) {
  return (
    <div style={{padding:'48px 48px 80px', maxWidth:960, margin:'0 auto'}}>
      <div style={{fontFamily:'var(--font-serif)', fontSize:40, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.1}}>Start a new document</div>
      <div style={{fontSize:16, color:'var(--fg-3)', marginTop:10, lineHeight:1.55}}>Drop a PDF, or choose from your computer. We'll walk you through placing signature fields and sending it off.</div>

      <div style={{marginTop:32, background:'#fff', border:'1.5px dashed var(--indigo-300)', borderRadius:28, padding:'56px 32px', textAlign:'center', position:'relative'}}>
        <div style={{width:64,height:64,borderRadius:999,background:'var(--indigo-50)',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'var(--indigo-600)',marginBottom:20}}>
          <Icon name="upload-cloud" size={28}/>
        </div>
        <div style={{fontFamily:'var(--font-serif)',fontSize:24,fontWeight:500,color:'var(--fg-1)'}}>Drop your PDF here</div>
        <div style={{fontSize:14,color:'var(--fg-3)',marginTop:8}}>or choose a file from your computer · up to 25 MB</div>
        <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:24}}>
          <Button variant="primary" onClick={onNext}>Choose file</Button>
          <Button variant="secondary" icon="link">From URL</Button>
          <Button variant="secondary" icon="cloud">From Drive</Button>
        </div>
      </div>

      <div style={{marginTop:36, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
        {[
          {t:'Self-sign', d:"Sign a document that's just for you.", i:'pen-tool'},
          {t:'Request signatures', d:'Send to one or more signers in order.', i:'users'},
          {t:'Use a template', d:'Start from a template you saved.', i:'bookmark'},
        ].map(c => (
          <Card key={c.t} padding={20}>
            <div style={{color:'var(--indigo-600)', marginBottom:10}}><Icon name={c.i} size={20}/></div>
            <div style={{fontFamily:'var(--font-serif)',fontSize:18,fontWeight:500,color:'var(--fg-1)'}}>{c.t}</div>
            <div style={{fontSize:13,color:'var(--fg-3)',marginTop:4,lineHeight:1.55}}>{c.d}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ----- Screen 2: Place fields ----- */
function PlaceFieldsScreen({ onNext, onBack, layout = 'split' }) {
  const Page = ({ children }) => (
    <div style={{width:540, minHeight:720, background:'#fff', borderRadius:6, boxShadow:'var(--shadow-paper)', padding:'56px 64px', position:'relative', margin:'0 auto'}}>
      <div style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:500, color:'var(--fg-1)'}}>Master Services Agreement</div>
      <div style={{fontSize:11,color:'var(--fg-3)',fontFamily:'var(--font-mono)',marginTop:4}}>DOC-8F3A-4291 · Page 1 of 4</div>
      <div style={{height:18}}/>
      {[...Array(14)].map((_,i)=>(
        <div key={i} style={{height:6,borderRadius:2,background:'var(--ink-150)',margin:'8px 0',width: `${70 + (i*7)%30}%`}}/>
      ))}
      <div style={{height:24}}/>
      {children}
    </div>
  );

  const SigPlaceholder = ({ signer, placed }) => (
    <div style={{
      border: placed ? '1.5px solid var(--indigo-500)' : '1.5px dashed var(--indigo-400)',
      background: placed ? 'var(--indigo-50)' : 'rgba(238,242,255,0.5)',
      borderRadius:8, padding:'10px 14px', margin:'8px 0', position:'relative',
      minHeight: 54, display:'flex', alignItems:'center',
    }}>
      <div style={{position:'absolute',top:-10,left:10,padding:'2px 8px',borderRadius:999,background:'var(--indigo-600)',color:'#fff',fontSize:10,fontWeight:600,letterSpacing:'0.04em'}}>{signer}</div>
      {placed ? <SignatureMark name={signer} size={26} underline={false}/> : <span style={{fontSize:12,color:'var(--indigo-700)',fontWeight:500}}>Signature field</span>}
    </div>
  );

  return (
    <div style={{display:'grid', gridTemplateColumns: layout==='split' ? '1fr 360px' : '260px 1fr', height:'calc(100vh - 56px)', background:'var(--ink-50)'}}>
      {layout==='split' ? (
        <>
          {/* Center canvas */}
          <div style={{overflow:'auto', padding:'32px 0'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:680,margin:'0 auto 16px',padding:'0 24px'}}>
              <Button variant="ghost" icon="arrow-left" size="sm" onClick={onBack}>Back</Button>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <Badge tone="indigo">Step 2 of 3 · Place fields</Badge>
              </div>
              <Button variant="primary" size="sm" iconRight="arrow-right" onClick={onNext}>Next — Review</Button>
            </div>
            <Page>
              <SigPlaceholder signer="You" placed/>
              <SigPlaceholder signer="Ana Torres"/>
            </Page>
          </div>
          {/* Right rail */}
          <div style={{borderLeft:'1px solid var(--border-1)', background:'#fff', padding:24, overflow:'auto'}}>
            <div style={{fontFamily:'var(--font-serif)',fontSize:20,fontWeight:500,color:'var(--fg-1)'}}>Fields</div>
            <div style={{fontSize:13,color:'var(--fg-3)',marginTop:4}}>Drag onto the page for each signer.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:16}}>
              {[{i:'pen-tool',l:'Signature'},{i:'type',l:'Initial'},{i:'calendar',l:'Date'},{i:'text-cursor-input',l:'Text'},{i:'check-square',l:'Checkbox'},{i:'mail',l:'Email'}].map(f=>(
                <div key={f.l} style={{padding:'12px 10px',border:'1px solid var(--border-1)',borderRadius:12,fontSize:13,fontWeight:500,color:'var(--fg-2)',display:'flex',flexDirection:'column',alignItems:'flex-start',gap:6,cursor:'grab',background:'#fff'}}>
                  <Icon name={f.i} size={16} style={{color:'var(--indigo-600)'}}/>{f.l}
                </div>
              ))}
            </div>
            <div style={{height:24,borderTop:'1px solid var(--border-1)',margin:'24px -24px 0'}}/>
            <div style={{padding:'20px 0 0'}}>
              <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase'}}>Signers</div>
              <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:12}}>
                {[{n:'You',e:'jamie@sealed.co',c:'var(--indigo-600)'},{n:'Ana Torres',e:'ana@farrow.law',c:'var(--success-500)'}].map((s,i)=>(
                  <div key={s.e} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:10,background:'var(--ink-50)'}}>
                    <span style={{width:22,height:22,borderRadius:999,background:s.c,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600}}>{i+1}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--fg-1)'}}>{s.n}</div>
                      <div style={{fontSize:12,color:'var(--fg-3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.e}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="ghost" icon="plus" size="sm" style={{marginTop:10}}>Add signer</Button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Left tools (variation B) */}
          <div style={{borderRight:'1px solid var(--border-1)', background:'#fff', padding:'20px 14px', overflow:'auto'}}>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase',padding:'4px 6px 12px'}}>Fields</div>
            {[{i:'pen-tool',l:'Signature'},{i:'type',l:'Initial'},{i:'calendar',l:'Date'},{i:'text-cursor-input',l:'Text'},{i:'check-square',l:'Checkbox'},{i:'mail',l:'Email'}].map(f=>(
              <div key={f.l} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,fontSize:13,fontWeight:500,color:'var(--fg-2)',cursor:'grab',marginBottom:2}}>
                <Icon name={f.i} size={16} style={{color:'var(--indigo-600)'}}/>{f.l}
              </div>
            ))}
            <div style={{borderTop:'1px solid var(--border-1)',margin:'14px -14px'}}/>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',color:'var(--fg-3)',textTransform:'uppercase',padding:'4px 6px 12px'}}>Signers</div>
            {[{n:'You',c:'var(--indigo-600)'},{n:'Ana Torres',c:'var(--success-500)'}].map((s,i)=>(
              <div key={s.n} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:10,marginBottom:2}}>
                <span style={{width:20,height:20,borderRadius:999,background:s.c,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600}}>{i+1}</span>
                <span style={{fontSize:13,fontWeight:500,color:'var(--fg-1)'}}>{s.n}</span>
              </div>
            ))}
          </div>
          {/* Center */}
          <div style={{overflow:'auto', padding:'32px 0'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:680,margin:'0 auto 16px',padding:'0 24px'}}>
              <Button variant="ghost" icon="arrow-left" size="sm" onClick={onBack}>Back</Button>
              <Badge tone="indigo">Step 2 of 3 · Place fields</Badge>
              <Button variant="primary" size="sm" iconRight="arrow-right" onClick={onNext}>Next — Review</Button>
            </div>
            <Page>
              <SigPlaceholder signer="You" placed/>
              <SigPlaceholder signer="Ana Torres"/>
            </Page>
          </div>
        </>
      )}
    </div>
  );
}

/* ----- Screen 3: Sign & Send ----- */
function SignScreen({ onDone, onBack }) {
  const [tab, setTab] = useState('type');
  const [name, setName] = useState('Jamie Okonkwo');
  return (
    <div style={{maxWidth:720, margin:'0 auto', padding:'48px 24px 80px'}}>
      <Button variant="ghost" icon="arrow-left" size="sm" onClick={onBack}>Back</Button>
      <div style={{height:16}}/>
      <div style={{fontFamily:'var(--font-serif)', fontSize:36, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em'}}>Put your name to it</div>
      <div style={{fontSize:15,color:'var(--fg-3)',marginTop:8}}>You're signing as <b style={{color:'var(--fg-1)'}}>Jamie Okonkwo</b>.</div>

      <div style={{marginTop:28, background:'#fff', border:'1px solid var(--border-1)', borderRadius:20, overflow:'hidden'}}>
        <div style={{display:'flex',borderBottom:'1px solid var(--border-1)'}}>
          {['type','draw','upload'].map(t=>(
            <div key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'14px 0',textAlign:'center',fontSize:14,fontWeight:600,color:tab===t?'var(--fg-1)':'var(--fg-3)',borderBottom: tab===t?'2px solid var(--indigo-600)':'2px solid transparent',cursor:'pointer',textTransform:'capitalize'}}>{t}</div>
          ))}
        </div>
        <div style={{padding:'32px 28px', minHeight:180, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16}}>
          {tab === 'type' && (<>
            <SignatureMark name={name} size={56}/>
            <input value={name} onChange={e=>setName(e.target.value)} style={{padding:'10px 14px', border:'1px solid var(--border-1)', borderRadius:10, fontFamily:'var(--font-sans)', fontSize:14, width:280, textAlign:'center'}}/>
          </>)}
          {tab === 'draw' && (
            <div style={{width:'100%',height:120,border:'1.5px dashed var(--border-2)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--fg-4)',fontSize:14}}>Draw with your mouse or finger</div>
          )}
          {tab === 'upload' && (
            <div style={{width:'100%',height:120,border:'1.5px dashed var(--border-2)',borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'var(--fg-3)',fontSize:14,gap:8}}>
              <Icon name="upload-cloud" size={20}/>Upload PNG or JPG
            </div>
          )}
        </div>
      </div>

      <div style={{marginTop:20, padding:'14px 16px', background:'var(--ink-50)', border:'1px solid var(--border-1)', borderRadius:12, display:'flex',gap:12,alignItems:'flex-start'}}>
        <Icon name="shield-check" size={18} style={{color:'var(--indigo-600)', marginTop:2}}/>
        <div style={{fontSize:13,color:'var(--fg-2)',lineHeight:1.55}}>By signing, you agree that your electronic signature is the legal equivalent of your handwritten signature. The audit trail is attached to the final page of the PDF.</div>
      </div>

      <div style={{marginTop:24, display:'flex', justifyContent:'flex-end', gap:10}}>
        <Button variant="secondary">Save as draft</Button>
        <Button variant="primary" icon="pen-tool" onClick={onDone}>Sign and send</Button>
      </div>
    </div>
  );
}

/* ----- Screen 4: Sent confirmation ----- */
function SentScreen({ onReset }) {
  return (
    <div style={{maxWidth:560, margin:'0 auto', padding:'80px 24px', textAlign:'center'}}>
      <div style={{width:72,height:72,borderRadius:999,background:'var(--success-50)',color:'var(--success-700)',display:'inline-flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
        <Icon name="check-circle-2" size={32}/>
      </div>
      <div style={{fontFamily:'var(--font-serif)',fontSize:40,fontWeight:500,letterSpacing:'-0.02em',color:'var(--fg-1)',lineHeight:1.1}}>Sealed.</div>
      <div style={{fontSize:16,color:'var(--fg-3)',marginTop:12,lineHeight:1.55}}>Sent to Ana Torres. We'll let you know when each signer completes their part.</div>
      <div style={{marginTop:28, padding:18, background:'#fff', border:'1px solid var(--border-1)', borderRadius:16, display:'flex', alignItems:'center', gap:14, textAlign:'left'}}>
        <DocThumb signed/>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:600,color:'var(--fg-1)'}}>Master services agreement</div>
          <div style={{fontSize:12,color:'var(--fg-3)',fontFamily:'var(--font-mono)'}}>DOC-8F3A-4291</div>
        </div>
        <Badge tone="amber">Awaiting others</Badge>
      </div>
      <div style={{marginTop:24, display:'flex', gap:10, justifyContent:'center'}}>
        <Button variant="secondary" icon="download">Download copy</Button>
        <Button variant="primary" onClick={onReset}>Back to documents</Button>
      </div>
    </div>
  );
}

Object.assign(window, { TopNav, LeftRail, UploadScreen, PlaceFieldsScreen, SignScreen, SentScreen });
