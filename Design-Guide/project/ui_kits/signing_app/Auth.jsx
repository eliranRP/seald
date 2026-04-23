/* @jsx React.createElement */
/* Sealed — Authentication (Sign in / Sign up).
   Split-screen layout: editorial brand panel on the left, form on the right.
   Supports Google SSO, email+password (sign up adds name), forgot-password flow. */

function AuthScreen({ mode = 'signin', onMode, onAuthed, onSkip }) {
  // mode: 'signin' | 'signup' | 'forgot' | 'check-email'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';
  const isCheck  = mode === 'check-email';

  const valid = useMemo(() => {
    if (isCheck) return true;
    if (isForgot) return /\S+@\S+\.\S+/.test(email);
    if (isSignup) return name.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && password.length >= 8 && agreed;
    return /\S+@\S+\.\S+/.test(email) && password.length >= 1;
  }, [mode, name, email, password, agreed]);

  // Password strength (signup only)
  const pwStrength = useMemo(() => {
    if (!isSignup) return null;
    let s = 0;
    if (password.length >= 8)  s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return Math.min(s, 4); // 0..4
  }, [password, isSignup]);

  const submit = (e) => {
    e && e.preventDefault();
    if (!valid || busy) return;
    setError(null);
    setBusy(true);
    // Simulate network
    setTimeout(() => {
      setBusy(false);
      if (isForgot) { onMode && onMode('check-email'); return; }
      onAuthed && onAuthed({ name: isSignup ? name : 'Jamie Okonkwo', email });
    }, 900);
  };

  const google = () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    setTimeout(() => { setBusy(false); onAuthed && onAuthed({ name:'Jamie Okonkwo', email:'jamie.okonkwo@sealed.app', provider:'google' }); }, 800);
  };

  return (
    <div style={{
      minHeight:'100vh', background:'var(--ink-50)', display:'flex',
      fontFamily:'var(--font-sans)', color:'var(--fg-2)',
    }}>
      {/* Left: brand panel */}
      <AuthBrandPanel/>

      {/* Right: form */}
      <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px'}}>
        <div style={{width:'100%', maxWidth:420}}>
          {/* Mobile-only wordmark (brand panel hides under 960) */}
          <div className="sealed-auth-mobile-brand" style={{display:'none', marginBottom:28}}>
            <img src="../../assets/logo.svg" height={26} alt="Sealed"/>
          </div>

          {isCheck ? (
            <CheckEmailState email={email} onMode={onMode}/>
          ) : (
            <>
              <Heading mode={mode}/>

              {/* Google SSO — hidden on forgot password */}
              {!isForgot && (
                <>
                  <button
                    type="button" onClick={google} disabled={busy}
                    style={{
                      width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                      height:46, border:'1px solid var(--border-2)', background:'#fff',
                      borderRadius:10, fontSize:14, fontWeight:600, color:'var(--fg-1)',
                      cursor:busy?'default':'pointer', transition:'border-color 120ms, background 120ms',
                      opacity:busy?0.6:1,
                    }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='var(--ink-400)'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-2)'}
                  >
                    <GoogleG/>
                    {isSignup ? 'Sign up with Google' : 'Continue with Google'}
                  </button>
                  <Divider label="or"/>
                </>
              )}

              <form onSubmit={submit} noValidate>
                {isSignup && (
                  <Field label="Full name" htmlFor="auth-name">
                    <input
                      id="auth-name" type="text" autoComplete="name"
                      value={name} onChange={e=>setName(e.target.value)}
                      placeholder="Ada Lovelace"
                      style={inputStyle}
                    />
                  </Field>
                )}
                <Field label={isForgot ? 'Your work email' : 'Email'} htmlFor="auth-email">
                  <input
                    id="auth-email" type="email" autoComplete="email"
                    value={email} onChange={e=>setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={inputStyle}
                  />
                </Field>

                {!isForgot && (
                  <Field
                    label="Password" htmlFor="auth-pw"
                    rightLabel={!isSignup && (
                      <a onClick={(e)=>{e.preventDefault(); onMode && onMode('forgot');}} href="#" style={linkStyle}>Forgot?</a>
                    )}
                  >
                    <div style={{position:'relative'}}>
                      <input
                        id="auth-pw"
                        type={showPw ? 'text' : 'password'}
                        autoComplete={isSignup ? 'new-password' : 'current-password'}
                        value={password} onChange={e=>setPassword(e.target.value)}
                        placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                        style={{...inputStyle, paddingRight:44}}
                      />
                      <button type="button" onClick={()=>setShowPw(v=>!v)} aria-label={showPw?'Hide password':'Show password'} style={{
                        position:'absolute', right:4, top:4, bottom:4, width:36,
                        border:'none', background:'transparent', borderRadius:6, cursor:'pointer',
                        color:'var(--fg-3)', display:'inline-flex', alignItems:'center', justifyContent:'center',
                      }}>
                        <Icon name={showPw ? 'eye-off' : 'eye'} size={16}/>
                      </button>
                    </div>
                    {isSignup && password.length > 0 && (
                      <PasswordStrength level={pwStrength}/>
                    )}
                  </Field>
                )}

                {isSignup && (
                  <label style={{display:'flex', alignItems:'flex-start', gap:10, margin:'6px 0 20px', fontSize:13, color:'var(--fg-2)', cursor:'pointer', lineHeight:1.5}}>
                    <Checkbox checked={agreed} onChange={setAgreed}/>
                    <span>
                      I agree to Sealed's{' '}
                      <a href="#" style={linkStyle} onClick={e=>e.preventDefault()}>Terms of Service</a>
                      {' '}and{' '}
                      <a href="#" style={linkStyle} onClick={e=>e.preventDefault()}>Privacy Policy</a>.
                    </span>
                  </label>
                )}

                {!isSignup && !isForgot && (
                  <label style={{display:'inline-flex', alignItems:'center', gap:8, margin:'0 0 20px', fontSize:13, color:'var(--fg-2)', cursor:'pointer'}}>
                    <Checkbox checked={remember} onChange={setRemember}/>
                    Keep me signed in
                  </label>
                )}

                {error && (
                  <div style={{background:'var(--danger-50)', border:'1px solid var(--danger-500)', color:'var(--danger-700)', fontSize:13, padding:'10px 12px', borderRadius:8, margin:'0 0 14px'}}>{error}</div>
                )}

                <button
                  type="submit" disabled={!valid || busy}
                  style={{
                    width:'100%', height:46, border:'none', borderRadius:10,
                    background: valid ? 'var(--ink-900)' : 'var(--ink-300)',
                    color:'#fff', fontSize:14, fontWeight:600, cursor: valid?'pointer':'not-allowed',
                    transition:'background 140ms, transform 60ms',
                    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
                  }}
                >
                  {busy
                    ? <span style={{width:16,height:16,borderRadius:999,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',display:'inline-block',animation:'spin 0.8s linear infinite'}}/>
                    : null}
                  {isForgot ? 'Send reset link' : isSignup ? 'Create account' : 'Sign in'}
                </button>
              </form>

              <FooterSwitcher mode={mode} onMode={onMode}/>

              {!isForgot && onSkip && (
                <div style={{marginTop:28, paddingTop:20, borderTop:'1px dashed var(--border-1)', textAlign:'center'}}>
                  <button
                    type="button" onClick={onSkip}
                    style={{
                      display:'inline-flex', alignItems:'center', gap:8,
                      padding:'8px 14px', background:'transparent', border:'none',
                      fontSize:13, fontWeight:600, color:'var(--fg-3)', cursor:'pointer',
                      borderRadius:8,
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.color='var(--fg-1)'; e.currentTarget.style.background='var(--ink-100)';}}
                    onMouseLeave={e=>{e.currentTarget.style.color='var(--fg-3)'; e.currentTarget.style.background='transparent';}}
                  >
                    Skip — try it without an account
                    <Icon name="arrow-right" size={14}/>
                  </button>
                  <div style={{marginTop:6, fontSize:11, color:'var(--fg-4)'}}>You can sign up later to save your documents.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @media (max-width: 960px) {
          .sealed-auth-brand-panel { display: none !important; }
          .sealed-auth-mobile-brand { display: block !important; }
        }
      `}</style>
    </div>
  );
}

/* ---------- Left brand panel ---------- */
function AuthBrandPanel() {
  return (
    <div className="sealed-auth-brand-panel" style={{
      flex:'0 0 44%', minWidth:380, maxWidth:620,
      background:'var(--ink-900)', color:'#fff', position:'relative', overflow:'hidden',
      display:'flex', flexDirection:'column', padding:'44px 52px',
    }}>
      {/* Subtle radial glow */}
      <div style={{position:'absolute', top:'-20%', right:'-20%', width:540, height:540, borderRadius:'50%',
        background:'radial-gradient(circle, rgba(99,102,241,0.22), rgba(99,102,241,0) 60%)', pointerEvents:'none'}}/>
      <div style={{position:'absolute', bottom:'-25%', left:'-15%', width:520, height:520, borderRadius:'50%',
        background:'radial-gradient(circle, rgba(236,72,153,0.14), rgba(236,72,153,0) 60%)', pointerEvents:'none'}}/>

      <img src="../../assets/logo-white.svg" height={28} alt="Sealed" style={{alignSelf:'flex-start'}}/>

      <div style={{flex:1, display:'flex', flexDirection:'column', justifyContent:'center', maxWidth:460, position:'relative'}}>
        <div style={{fontFamily:'var(--font-serif)', fontSize:46, fontWeight:500, lineHeight:1.08, letterSpacing:'-0.02em', color:'#fff'}}>
          Documents, <em style={{fontStyle:'italic', color:'#C7D2FE'}}>sealed</em> in minutes.
        </div>
        <div style={{marginTop:18, fontSize:15, lineHeight:1.6, color:'rgba(255,255,255,0.72)'}}>
          Upload a PDF, place signature fields, and collect signatures from anyone with an email address. Audit-ready, encrypted end-to-end.
        </div>

        {/* Testimonial */}
        <div style={{marginTop:44, padding:'22px 22px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:14}}>
          <div style={{fontFamily:'var(--font-serif)', fontSize:18, fontStyle:'italic', lineHeight:1.55, color:'#EEF2FF'}}>
            "We moved our entire contract workflow onto Sealed in a weekend. Our clients finish signing before our sales calls end."
          </div>
          <div style={{marginTop:16, display:'flex', alignItems:'center', gap:12}}>
            <div style={{width:32, height:32, borderRadius:999, background:'linear-gradient(135deg,#F472B6,#FB7185)', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700}}>MR</div>
            <div style={{fontSize:13}}>
              <div style={{color:'#fff', fontWeight:600}}>Maya Raskin</div>
              <div style={{color:'rgba(255,255,255,0.55)'}}>General Counsel, Northwind</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:10, fontSize:12, color:'rgba(255,255,255,0.48)'}}>
        <Icon name="shield-check" size={14}/>
        SOC 2 Type II · eIDAS-qualified · 256-bit AES
      </div>
    </div>
  );
}

/* ---------- Check-email state (after forgot) ---------- */
function CheckEmailState({ email, onMode }) {
  return (
    <div>
      <div style={{width:56, height:56, borderRadius:999, background:'var(--indigo-50)', color:'var(--indigo-600)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:20}}>
        <Icon name="mail-check" size={26}/>
      </div>
      <div style={{fontFamily:'var(--font-serif)', fontSize:32, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.01em', lineHeight:1.15}}>Check your email</div>
      <div style={{fontSize:14, color:'var(--fg-3)', marginTop:10, lineHeight:1.6}}>
        We sent a password reset link to <b style={{color:'var(--fg-1)'}}>{email || 'your inbox'}</b>. It'll expire in 30 minutes.
      </div>
      <div style={{marginTop:28, display:'flex', gap:10}}>
        <button onClick={()=>onMode && onMode('signin')} style={{flex:1, height:44, borderRadius:10, border:'1px solid var(--border-2)', background:'#fff', fontSize:14, fontWeight:600, color:'var(--fg-1)', cursor:'pointer'}}>Back to sign in</button>
        <button onClick={()=>onMode && onMode('forgot')} style={{flex:1, height:44, borderRadius:10, border:'none', background:'var(--ink-900)', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer'}}>Resend link</button>
      </div>
    </div>
  );
}

/* ---------- Heading per mode ---------- */
function Heading({ mode }) {
  const copy = {
    signin:  { h:'Welcome back',           s:'Sign in to pick up where you left off.' },
    signup:  { h:'Create your account',     s:'Send your first document in under a minute.' },
    forgot:  { h:'Reset your password',     s:'Enter the email tied to your account and we\'ll send a secure link.' },
  }[mode] || { h:'', s:'' };
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontFamily:'var(--font-serif)', fontSize:36, fontWeight:500, color:'var(--fg-1)', letterSpacing:'-0.02em', lineHeight:1.1}}>{copy.h}</div>
      <div style={{fontSize:14, color:'var(--fg-3)', marginTop:8, lineHeight:1.55}}>{copy.s}</div>
    </div>
  );
}

/* ---------- Footer switcher ---------- */
function FooterSwitcher({ mode, onMode }) {
  if (mode === 'forgot') {
    return (
      <div style={{marginTop:20, textAlign:'center', fontSize:13, color:'var(--fg-3)'}}>
        Remembered it? <a onClick={e=>{e.preventDefault(); onMode('signin');}} href="#" style={linkStyle}>Back to sign in</a>
      </div>
    );
  }
  if (mode === 'signup') {
    return (
      <div style={{marginTop:20, textAlign:'center', fontSize:13, color:'var(--fg-3)'}}>
        Already have an account? <a onClick={e=>{e.preventDefault(); onMode('signin');}} href="#" style={linkStyle}>Sign in</a>
      </div>
    );
  }
  return (
    <div style={{marginTop:20, textAlign:'center', fontSize:13, color:'var(--fg-3)'}}>
      New to Sealed? <a onClick={e=>{e.preventDefault(); onMode('signup');}} href="#" style={linkStyle}>Create an account</a>
    </div>
  );
}

/* ---------- Small building blocks ---------- */
function Field({ label, htmlFor, rightLabel, children }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6}}>
        <label htmlFor={htmlFor} style={{fontSize:12, fontWeight:600, color:'var(--fg-2)'}}>{label}</label>
        {rightLabel}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width:'100%', height:44, padding:'0 14px',
  border:'1px solid var(--border-2)', borderRadius:10, background:'#fff',
  fontSize:14, color:'var(--fg-1)', fontFamily:'var(--font-sans)',
  outline:'none', transition:'border-color 120ms, box-shadow 120ms',
  boxSizing:'border-box',
};

const linkStyle = { color:'var(--indigo-600)', textDecoration:'none', fontWeight:600 };

function Checkbox({ checked, onChange }) {
  return (
    <span
      onClick={()=>onChange(!checked)}
      style={{
        width:18, height:18, borderRadius:4, flexShrink:0,
        border:`1.5px solid ${checked?'var(--ink-900)':'var(--border-2)'}`,
        background: checked ? 'var(--ink-900)' : '#fff',
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        transition:'background 120ms, border-color 120ms',
        cursor:'pointer',
      }}
    >
      {checked && <Icon name="check" size={12} style={{color:'#fff'}}/>}
    </span>
  );
}

function Divider({ label }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:12, margin:'20px 0'}}>
      <div style={{flex:1, height:1, background:'var(--border-1)'}}/>
      <div style={{fontSize:11, fontWeight:600, color:'var(--fg-4)', letterSpacing:'0.08em', textTransform:'uppercase'}}>{label}</div>
      <div style={{flex:1, height:1, background:'var(--border-1)'}}/>
    </div>
  );
}

function PasswordStrength({ level }) {
  const labels = ['Too short', 'Weak', 'Okay', 'Strong', 'Excellent'];
  const colors = ['var(--ink-300)', 'var(--danger-500)', 'var(--warn-500)', 'var(--indigo-500)', 'var(--success-500)'];
  return (
    <div style={{marginTop:8}}>
      <div style={{display:'flex', gap:4}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{flex:1, height:4, borderRadius:999, background: i<level ? colors[level] : 'var(--ink-150)', transition:'background 160ms'}}/>
        ))}
      </div>
      <div style={{marginTop:6, fontSize:12, color:'var(--fg-3)'}}>{labels[level]}</div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.614z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

Object.assign(window, { AuthScreen });
