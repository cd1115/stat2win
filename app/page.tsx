"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureUserProfileClient } from "@/lib/ensureUserProfile";
import Link from "next/link";

// ─── Slides ───────────────────────────────────────────────────────────────────

const slides = [
  {
    id: 0,
    badge: "🏆 Free to Play",
    title: "Prove you know\nyour sports.",
    sub: "Make picks on NBA, MLB & Soccer. No money at risk — pure skill.",
    visual: (
      <div style={{position:"relative",width:"100%",height:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{position:"absolute",width:260,height:260,borderRadius:"50%",background:"radial-gradient(circle,rgba(59,130,246,0.2) 0%,transparent 70%)"}}/>
        {[{e:"🏀",x:-85,y:-45,size:44},{e:"⚾",x:82,y:-60,size:36},{e:"⚽",x:-65,y:50,size:40},{e:"🏈",x:90,y:40,size:32}].map(({e,x,y,size})=>(
          <div key={e} style={{position:"absolute",transform:`translate(${x}px,${y}px)`,fontSize:size,filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.5))"}}>
            {e}
          </div>
        ))}
        <div style={{width:90,height:90,borderRadius:"50%",background:"linear-gradient(135deg,#1e3a5f,#0d1f3c)",border:"2px solid rgba(59,130,246,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:42,boxShadow:"0 0 40px rgba(59,130,246,0.25)"}}>
          🏆
        </div>
      </div>
    ),
  },
  {
    id: 1,
    badge: "⚡ How it works",
    title: "Pick · Earn · Win",
    sub: "Three simple steps to climb the leaderboard.",
    visual: (
      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>
        {[
          {num:"01",icon:"🎯",title:"Make your picks",desc:"Choose winners before games start.",color:"#3b82f6"},
          {num:"02",icon:"⭐",title:"Earn Reward Points",desc:"100 pts per correct pick. Collect RP every week.",color:"#8b5cf6"},
          {num:"03",icon:"📊",title:"Climb the board",desc:"Compete weekly & daily. Rise to the top.",color:"#10b981"},
        ].map(({num,icon,title,desc,color})=>(
          <div key={num} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,0.04)",border:`1px solid ${color}25`,borderRadius:16,padding:"12px 14px"}}>
            <div style={{width:40,height:40,borderRadius:12,background:`${color}18`,border:`1px solid ${color}35`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"white",marginBottom:2}}>{title}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.42)",lineHeight:1.4}}>{desc}</div>
            </div>
            <div style={{fontSize:10,fontWeight:800,color:`${color}70`,flexShrink:0}}>{num}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 2,
    badge: "📊 Leaderboard",
    title: "Compete &\nclimb the ranks.",
    sub: "Weekly & daily rankings. See where you stand.",
    visual: (
      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:7}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:20,padding:"4px 12px"}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:"#f59e0b",display:"inline-block"}}/>
            <span style={{fontSize:11,fontWeight:700,color:"#f59e0b"}}>LIVE · Weekly NBA</span>
          </div>
        </div>
        {[
          {rank:1,name:"carlos_pr",pts:"1,240",rp:"+29 RP",you:false,color:"#f59e0b"},
          {rank:2,name:"javi.sports",pts:"1,180",rp:"+15 RP",you:false,color:"rgba(200,200,200,0.7)"},
          {rank:3,name:"mk_picks",pts:"1,050",rp:"+10 RP",you:false,color:"#cd7c2f"},
          {rank:4,name:"you 👈",pts:"980",rp:"+8 RP",you:true,color:"#3b82f6"},
          {rank:5,name:"sportz_king",pts:"920",rp:"+5 RP",you:false,color:"rgba(255,255,255,0.3)"},
        ].map(({rank,name,pts,rp,you,color})=>(
          <div key={rank} style={{display:"flex",alignItems:"center",gap:10,background:you?"rgba(59,130,246,0.1)":"rgba(255,255,255,0.04)",border:`1px solid ${you?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.07)"}`,borderRadius:12,padding:"10px 12px"}}>
            <div style={{fontSize:14,fontWeight:800,color,width:22,flexShrink:0}}>#{rank}</div>
            <div style={{flex:1,fontSize:12,fontWeight:you?700:500,color:you?"white":"rgba(255,255,255,0.7)"}}>@{name}</div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"white"}}>{pts}</div>
              <div style={{fontSize:10,color:"#10b981"}}>{rp}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 3,
    badge: "🎁 +25 RP Free",
    title: "Start earning\nRP today.",
    sub: "Create your free account and get 25 RP instantly.",
    visual: (
      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{background:"linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05))",border:"1px solid rgba(245,158,11,0.3)",borderRadius:20,padding:"18px",textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:4}}>◆</div>
          <div style={{fontSize:30,fontWeight:900,color:"#f59e0b"}}>+25 RP</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:4}}>Welcome bonus — instant on signup</div>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"12px 16px"}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:1,marginBottom:8}}>USE YOUR RP FOR</div>
          {[{icon:"🎁",label:"Gift cards & cash rewards"},{icon:"👕",label:"Exclusive merch"},{icon:"⭐",label:"Premium subscription"}].map(({icon,label})=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <span style={{fontSize:16}}>{icon}</span>
              <span style={{fontSize:12,color:"rgba(255,255,255,0.65)"}}>{label}</span>
              <span style={{marginLeft:"auto",color:"#10b981",fontSize:11}}>✓</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

// ─── Login Bottom Sheet ───────────────────────────────────────────────────────

function LoginSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      try { await ensureUserProfileClient(); } catch {}
      try { await auth.currentUser?.getIdToken(true); } catch {}
      router.replace("/dashboard");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/invalid-credential") setErr("Email o contraseña incorrectos.");
      else if (code === "auth/too-many-requests") setErr("Demasiados intentos.");
      else setErr("No se pudo iniciar sesión.");
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    setErr(null);
    setGoogleLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      try { await ensureUserProfileClient(); } catch {}
      router.replace("/dashboard");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setErr("No se pudo iniciar sesión con Google.");
      }
    } finally { setGoogleLoading(false); }
  }

  const inputCls = "w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 focus:ring-2 focus:ring-blue-500/20 transition";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-white/10 bg-[#0A0C10] shadow-2xl"
        style={{paddingBottom:"env(safe-area-inset-bottom)"}}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-6 pb-6">
          <div className="text-center mb-5">
            <div className="text-lg font-bold text-white">Welcome back</div>
            <div className="text-sm text-white/40 mt-1">Sign in to your account</div>
          </div>

          {err && (
            <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center gap-2">
              <span>⚠</span>{err}
            </div>
          )}

          {/* Google */}
          <button onClick={handleGoogle} disabled={googleLoading || loading}
            className="w-full h-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center gap-3 text-sm font-medium text-white/80 hover:bg-white/8 transition mb-3 disabled:opacity-50">
            {googleLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-[11px] text-white/25">or with email</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              className={inputCls} placeholder="Email" type="email" autoComplete="email" required />
            <div className="relative">
              <input value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputCls} placeholder="Password"
                type={showPw ? "text" : "password"} autoComplete="current-password" required />
              <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-white/30 hover:text-white/60 transition">
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition font-bold text-sm text-white shadow-lg shadow-blue-600/25">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  Signing in…
                </span>
              ) : "Sign in"}
            </button>
          </form>

          <div className="text-center text-xs text-white/30 mt-3">
            <Link href="/forgot-password" className="hover:text-white/60 transition">Forgot password?</Link>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Onboarding Page ─────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [checking, setChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const isLast = current === slides.length - 1;
  const slide = slides[current];

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setChecking(false);
      if (u) router.replace("/dashboard");
    });
    return () => unsub();
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#05070B]">
        <div className="flex flex-col items-center gap-4">
          <div className="text-2xl font-extrabold text-white">Stat<span className="text-blue-400">2</span>Win</div>
          <span className="w-5 h-5 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin inline-block" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[#05070B] flex flex-col relative overflow-hidden"
        style={{fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif"}}>

        {/* Background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-blue-600/15 blur-[100px]" />
        </div>

        {/* Safe area top */}
        <div style={{height:"env(safe-area-inset-top)"}} />

        {/* Skip */}
        {!isLast && (
          <div className="absolute right-4 z-10" style={{top:"calc(env(safe-area-inset-top) + 16px)"}}>
            <button onClick={() => setCurrent(slides.length - 1)}
              className="rounded-full border border-white/10 bg-white/6 px-4 py-1.5 text-xs text-white/45 hover:text-white/70 transition">
              Skip
            </button>
          </div>
        )}

        {/* Logo */}
        {/* Content — swipeable */}
<div
  className="flex-1 flex flex-col px-6 pt-4 overflow-hidden relative"
  onTouchStart={(e) => {
    const touch = e.touches[0];
    (e.currentTarget as any)._touchStartX = touch.clientX;
  }}
  onTouchEnd={(e) => {
    const startX = (e.currentTarget as any)._touchStartX;
    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && current < slides.length - 1) {
        setCurrent(c => c + 1); // swipe left = next
      } else if (diff < 0 && current > 0) {
        setCurrent(c => c - 1); // swipe right = back
      }
    }
  }}
>
          <div className="text-[22px] font-black tracking-tight text-white">
            Stat<span className="text-blue-400">2</span>Win
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-6 pt-4 overflow-hidden relative">
          <div className="flex justify-center mb-3">
            <div className="rounded-full border border-blue-500/22 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-300">
              {slide.badge}
            </div>
          </div>
          <div className="text-center mb-4 flex-shrink-0">
            <h1 className="text-[28px] font-black text-white leading-tight" style={{whiteSpace:"pre-line"}}>
              {slide.title}
            </h1>
            <p className="text-[13px] text-white/42 mt-2 leading-relaxed">{slide.sub}</p>
          </div>
          <div className="flex-1 overflow-auto pb-2">{slide.visual}</div>
        </div>

        {/* Bottom */}
        <div className="px-6 flex-shrink-0 relative" style={{paddingBottom:"calc(env(safe-area-inset-bottom) + 24px)",paddingTop:12}}>
          {/* Dots */}
          <div className="flex justify-center gap-1.5 mb-4">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{width: i === current ? 24 : 6, background: i === current ? "#3b82f6" : "rgba(255,255,255,0.18)"}} />
            ))}
          </div>

          {isLast ? (
            <div className="flex flex-col gap-3">
              <button onClick={() => router.push("/signup")}
                className="w-full h-13 rounded-2xl bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-500 active:scale-[0.99] transition shadow-lg shadow-blue-600/30"
                style={{height:52}}>
                Create account — free
              </button>
              <button onClick={() => setShowLogin(true)}
                className="w-full rounded-2xl border border-white/10 bg-white/6 text-white/65 font-semibold text-[14px] hover:bg-white/10 hover:text-white transition"
                style={{height:48}}>
                Sign in
              </button>
            </div>
          ) : (
            <button onClick={() => setCurrent(c => c + 1)}
              className="w-full rounded-2xl bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-500 active:scale-[0.99] transition shadow-lg shadow-blue-600/28 flex items-center justify-center gap-2"
              style={{height:52}}>
              Continue <span className="text-lg">→</span>
            </button>
          )}

          <div className="text-center text-[11px] text-white/18 mt-3">
            No gambling · No odds · Skill-based
          </div>
        </div>
      </div>

      {/* Login Bottom Sheet */}
      {showLogin && <LoginSheet onClose={() => setShowLogin(false)} />}
    </>
  );
}
