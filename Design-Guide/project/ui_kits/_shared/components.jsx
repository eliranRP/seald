/* @jsx React.createElement */
/* Shared Sealed components — load with Babel after React.
   Each component exports to window so other babel scripts can use it. */

const { useState, useRef, useEffect } = React;

/* ---------- Icon ---------- */
function Icon({ name, size = 18, color, style, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (window.lucide && ref.current) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({ attrs: { width: size, height: size } });
    }
  }, [name, size]);
  return <span ref={ref} style={{ display:'inline-flex', width:size, height:size, color: color || 'currentColor', ...style }} {...rest} />;
}

/* ---------- Button ---------- */
function Button({ variant = 'primary', size = 'md', icon, iconRight, children, onClick, disabled, style, ...rest }) {
  const base = {
    display:'inline-flex', alignItems:'center', gap: 8,
    fontFamily:'var(--font-sans)', fontWeight:600, cursor: disabled?'not-allowed':'pointer',
    border:'1px solid transparent', transition:'background 120ms var(--ease-standard), box-shadow 120ms',
    opacity: disabled ? 0.5 : 1,
  };
  const sizes = {
    sm: { padding:'6px 12px', fontSize:13, borderRadius:10 },
    md: { padding:'10px 16px', fontSize:14, borderRadius:12 },
    lg: { padding:'13px 22px', fontSize:15, borderRadius:14 },
  };
  const variants = {
    primary: { background:'var(--indigo-600)', color:'#fff' },
    secondary: { background:'#fff', color:'var(--fg-1)', borderColor:'var(--border-1)' },
    ghost: { background:'transparent', color:'var(--fg-2)' },
    danger: { background:'#fff', color:'var(--danger-700)', borderColor:'#FECACA' },
    dark: { background:'var(--ink-900)', color:'#fff' },
  };
  const [hover, setHover] = useState(false);
  const hoverBg = {
    primary:'var(--indigo-700)', secondary:'var(--ink-50)', ghost:'var(--bg-subtle)', danger:'#FEF2F2', dark:'var(--ink-800)'
  }[variant];
  return (
    <button
      onClick={disabled?undefined:onClick} disabled={disabled}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{ ...base, ...sizes[size], ...variants[variant], ...(hover&&!disabled?{background:hoverBg}:{}), ...style }}
      {...rest}>
      {icon && <Icon name={icon} size={size==='sm'?14:16}/>}
      {children}
      {iconRight && <Icon name={iconRight} size={size==='sm'?14:16}/>}
    </button>
  );
}

/* ---------- Badge ---------- */
function Badge({ tone = 'neutral', children }) {
  // Accept semantic aliases as well as native tone names.
  const aliases = { success:'emerald', warning:'amber', danger:'red', error:'red' };
  const key = aliases[tone] || tone;
  const map = {
    indigo: { bg:'var(--indigo-50)', fg:'var(--indigo-800)', dot:'var(--indigo-600)' },
    amber:  { bg:'var(--warn-50)',   fg:'var(--warn-700)',   dot:'var(--warn-500)' },
    emerald:{ bg:'var(--success-50)',fg:'var(--success-700)',dot:'var(--success-500)' },
    red:    { bg:'var(--danger-50)', fg:'var(--danger-700)', dot:'var(--danger-500)' },
    neutral:{ bg:'var(--ink-100)',   fg:'var(--fg-2)',       dot:'var(--fg-3)' },
  };
  const tones = map[key] || map.neutral;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px 4px 8px',borderRadius:999,background:tones.bg,color:tones.fg,fontSize:12,fontWeight:600,lineHeight:1.2}}>
      <span style={{width:6,height:6,borderRadius:999,background:tones.dot}}/>
      {children}
    </span>
  );
}

/* ---------- Card ---------- */
function Card({ children, style, padding = 24, elevated }) {
  return (
    <div style={{
      background:'var(--paper)', border:'1px solid var(--border-1)',
      borderRadius:16, padding, boxShadow: elevated?'var(--shadow-md)':'none', ...style
    }}>{children}</div>
  );
}

/* ---------- TextField ---------- */
function TextField({ label, value, onChange, placeholder, error, icon, disabled, type='text' }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {label && <label style={{fontSize:13,fontWeight:600,color:'var(--fg-2)'}}>{label}</label>}
      <div style={{position:'relative'}}>
        {icon && <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--fg-3)'}}><Icon name={icon} size={16}/></span>}
        <input
          type={type} value={value ?? ''} onChange={e=>onChange && onChange(e.target.value)}
          placeholder={placeholder} disabled={disabled}
          onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
          style={{
            width:'100%', padding: icon ? '11px 14px 11px 36px' : '11px 14px',
            border:`1px solid ${error?'var(--danger-500)':focus?'var(--indigo-500)':'var(--border-1)'}`,
            borderRadius:12, font:'400 14px var(--font-sans)',
            background: disabled?'var(--ink-50)':'#fff', color: disabled?'var(--fg-4)':'var(--fg-1)',
            outline:'none',
            boxShadow: focus ? 'var(--shadow-focus)' : error ? '0 0 0 4px rgba(239,68,68,0.14)' : 'none',
            transition:'border-color 120ms, box-shadow 120ms',
          }}
        />
      </div>
      {error && <div style={{fontSize:12,color:'var(--danger-700)'}}>{error}</div>}
    </div>
  );
}

/* ---------- Avatar ---------- */
function Avatar({ name, size = 32, tone }) {
  const initials = (name||'').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
  const palette = ['#4F46E5','#0F766E','#B45309','#BE185D','#1D4ED8','#475569'];
  const bg = tone || palette[(name||'').charCodeAt(0) % palette.length];
  return (
    <div style={{width:size,height:size,borderRadius:999,background:bg,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:size*0.4,fontWeight:600,flexShrink:0}}>
      {initials}
    </div>
  );
}

/* ---------- SignatureMark — the one script flourish ---------- */
function SignatureMark({ name = 'Jamie Okonkwo', underline = true, size = 44, color = 'var(--ink-900)' }) {
  return (
    <div style={{display:'inline-block'}}>
      <div style={{fontFamily:'var(--font-script)', fontWeight:600, fontSize:size, lineHeight:1, color, letterSpacing:0}}>
        {name}
      </div>
      {underline && (
        <svg width={Math.max(120, name.length*size*0.28)} height="6" style={{display:'block', marginTop:-2}}>
          <path d={`M4 3 Q ${size} -1 ${size*2} 3 T ${Math.max(110, name.length*size*0.28)-6} 3`} stroke="var(--indigo-600)" strokeWidth="1.75" fill="none" strokeLinecap="round" opacity="0.55"/>
        </svg>
      )}
    </div>
  );
}

/* ---------- DocThumb — tiny PDF icon ---------- */
function DocThumb({ title = 'Document', signed, size = 52 }) {
  return (
    <div style={{width:size*0.77, height:size, background:'#fff', border:'1px solid var(--border-1)', borderRadius:4, position:'relative', boxShadow:'0 1px 0 rgba(15,23,42,0.04), 0 6px 14px rgba(15,23,42,0.06)', flexShrink:0}}>
      <div style={{position:'absolute',left:5,top:9,width:'60%',height:2,background:'var(--ink-200)',borderRadius:1}}/>
      <div style={{position:'absolute',left:5,top:14,width:'75%',height:2,background:'var(--ink-200)',borderRadius:1}}/>
      <div style={{position:'absolute',left:5,top:19,width:'45%',height:2,background:'var(--ink-200)',borderRadius:1}}/>
      <div style={{position:'absolute',left:5,top:24,width:'65%',height:2,background:'var(--ink-200)',borderRadius:1}}/>
      {signed && <div style={{position:'absolute',right:4,bottom:4,fontFamily:'var(--font-script)',fontSize:10,color:'var(--indigo-600)',fontWeight:600}}>signed</div>}
    </div>
  );
}

Object.assign(window, { Icon, Button, Badge, Card, TextField, Avatar, SignatureMark, DocThumb });
