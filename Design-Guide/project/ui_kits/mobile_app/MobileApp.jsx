/* @jsx React.createElement */
const { useState } = React;

function MobileInbox({ onOpen }){
  const docs = [
    {t:'NDA — Quill Capital', from:'ada@quill.vc', status:'indigo', time:'Apr 20'},
    {t:'Offer letter',         from:'hr@chen.co',   status:'indigo', time:'Apr 19'},
    {t:'Vendor agreement',     from:'ops@argus.io', status:'amber',  time:'Apr 17'},
    {t:'Photography release',  from:'arlo@studio', status:'emerald',time:'Apr 02'},
  ];
  return (
    <div style={{fontFamily:'var(--font-sans)',background:'#F2F2F7',minHeight:'100%',paddingTop:4}}>
      <div style={{padding:'0 20px 14px'}}>
        <div style={{background:'#fff',borderRadius:14,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,color:'var(--fg-3)',fontSize:15,border:'1px solid var(--border-1)'}}>
          <Icon name="search" size={16}/>Search documents
        </div>
      </div>
      <div style={{background:'#fff',margin:'0 16px',borderRadius:18,overflow:'hidden',border:'1px solid var(--border-1)'}}>
        {docs.map((d,i)=>(
          <div key={d.t} onClick={()=>onOpen && onOpen(d)} style={{padding:'14px 16px',display:'flex',gap:12,alignItems:'center',borderBottom:i<docs.length-1?'1px solid var(--border-1)':'none',cursor:'pointer'}}>
            <DocThumb size={44} signed={d.status==='emerald'}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:600,color:'var(--fg-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{d.t}</div>
              <div style={{fontSize:13,color:'var(--fg-3)',marginTop:2}}>{d.from}</div>
              <div style={{marginTop:6}}><Badge tone={d.status}>{d.status==='indigo'?'Awaiting you':d.status==='amber'?'Awaiting others':'Completed'}</Badge></div>
            </div>
            <div style={{fontSize:12,color:'var(--fg-3)',fontFamily:'var(--font-mono)',alignSelf:'flex-start',marginTop:4}}>{d.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileDocView({ onBack, onSign }){
  return (
    <div style={{fontFamily:'var(--font-sans)',background:'#F2F2F7',minHeight:'100%',padding:'4px 0 140px'}}>
      <div style={{padding:'0 16px',display:'flex',justifyContent:'space-between',marginBottom:14}}>
        <button onClick={onBack} style={{border:'none',background:'transparent',color:'var(--indigo-600)',fontSize:15,fontWeight:600,display:'flex',alignItems:'center',gap:4,padding:0}}><Icon name="chevron-left" size={18}/>Inbox</button>
        <Icon name="more-horizontal" size={20} style={{color:'var(--indigo-600)'}}/>
      </div>
      <div style={{padding:'0 20px 14px'}}>
        <div style={{fontFamily:'var(--font-serif)',fontSize:26,fontWeight:500,color:'var(--fg-1)',letterSpacing:'-0.02em',lineHeight:1.15}}>NDA — Quill Capital</div>
        <div style={{fontSize:13,color:'var(--fg-3)',marginTop:6,fontFamily:'var(--font-mono)'}}>DOC-02B1 · 4 pages</div>
        <div style={{marginTop:10}}><Badge tone="indigo">Awaiting you</Badge></div>
      </div>
      <div style={{margin:'0 16px',background:'#fff',borderRadius:12,boxShadow:'var(--shadow-paper)',padding:'24px 22px',position:'relative'}}>
        <div style={{fontFamily:'var(--font-serif)',fontSize:15,fontWeight:500}}>Mutual Non-Disclosure</div>
        <div style={{height:10}}/>
        {[...Array(8)].map((_,i)=>(<div key={i} style={{height:4,borderRadius:2,background:'var(--ink-150)',margin:'6px 0',width:`${70+(i*9)%30}%`}}/>))}
        <div style={{marginTop:14,border:'1.5px dashed var(--indigo-400)',background:'rgba(238,242,255,0.5)',borderRadius:8,padding:'10px 12px',color:'var(--indigo-700)',fontSize:12,fontWeight:600}}>Tap here to sign</div>
      </div>
      <div style={{position:'fixed',bottom:40,left:16,right:16,padding:10,background:'#fff',borderRadius:16,border:'1px solid var(--border-1)',boxShadow:'var(--shadow-lg)',display:'flex',gap:8}}>
        <Button variant="secondary" style={{flex:1,justifyContent:'center'}}>Decline</Button>
        <Button variant="primary" icon="pen-tool" style={{flex:2,justifyContent:'center'}} onClick={onSign}>Sign document</Button>
      </div>
    </div>
  );
}

function MobileSign({ onDone, onBack }){
  return (
    <div style={{fontFamily:'var(--font-sans)',background:'#F2F2F7',minHeight:'100%',padding:'4px 0'}}>
      <div style={{padding:'0 16px',marginBottom:14}}>
        <button onClick={onBack} style={{border:'none',background:'transparent',color:'var(--indigo-600)',fontSize:15,fontWeight:600,display:'flex',alignItems:'center',gap:4,padding:0}}><Icon name="chevron-left" size={18}/>Back</button>
      </div>
      <div style={{padding:'0 20px'}}>
        <div style={{fontFamily:'var(--font-serif)',fontSize:30,fontWeight:500,color:'var(--fg-1)',letterSpacing:'-0.02em',lineHeight:1.1}}>Put your name to it</div>
        <div style={{fontSize:14,color:'var(--fg-3)',marginTop:8}}>Signing as Jamie Okonkwo</div>
      </div>
      <div style={{margin:'20px 16px',background:'#fff',border:'1px solid var(--border-1)',borderRadius:20,overflow:'hidden'}}>
        <div style={{display:'flex',borderBottom:'1px solid var(--border-1)'}}>
          {['Type','Draw','Upload'].map((t,i)=>(
            <div key={t} style={{flex:1,padding:'12px 0',textAlign:'center',fontSize:14,fontWeight:600,color:i===0?'var(--fg-1)':'var(--fg-3)',borderBottom:i===0?'2px solid var(--indigo-600)':'2px solid transparent'}}>{t}</div>
          ))}
        </div>
        <div style={{padding:'28px 16px',minHeight:120,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <SignatureMark name="Jamie Okonkwo" size={44}/>
        </div>
      </div>
      <div style={{margin:'0 16px 140px',padding:'14px 16px',background:'#fff',border:'1px solid var(--border-1)',borderRadius:14,display:'flex',gap:10,alignItems:'flex-start'}}>
        <Icon name="shield-check" size={16} style={{color:'var(--indigo-600)',marginTop:2}}/>
        <div style={{fontSize:12,color:'var(--fg-2)',lineHeight:1.5}}>By signing, you agree your electronic signature is legally binding. Audit trail attached.</div>
      </div>
      <div style={{position:'fixed',bottom:40,left:16,right:16}}>
        <Button variant="primary" onClick={onDone} style={{width:'100%',justifyContent:'center',padding:'14px 22px',fontSize:15,borderRadius:14}}>Sign and seal</Button>
      </div>
    </div>
  );
}

function MobileApp(){
  const [screen, setScreen] = useState('inbox');
  const titles = { inbox:'Inbox', doc:'', sign:'' };
  return (
    <div style={{display:'flex',justifyContent:'center',padding:'32px 0',background:'var(--ink-100)',minHeight:'100vh'}}>
      <IOSDevice title={screen==='inbox'?'Inbox':undefined}>
        {screen==='inbox' && <MobileInbox onOpen={()=>setScreen('doc')}/>}
        {screen==='doc'   && <MobileDocView onBack={()=>setScreen('inbox')} onSign={()=>setScreen('sign')}/>}
        {screen==='sign'  && <MobileSign onBack={()=>setScreen('doc')} onDone={()=>setScreen('inbox')}/>}
      </IOSDevice>
    </div>
  );
}

Object.assign(window, { MobileApp });
