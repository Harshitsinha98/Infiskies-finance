/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, LockKeyhole, Settings, ShieldCheck, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import Workspace from "./Workspace";

type Role = "owner" | "co_admin" | "employee";

function Brand() {
  return <div className="brand"><div className="brand-mark"><span /><span /><span /><span /></div><div><strong>infiskies</strong><small>FINANCE</small></div></div>;
}
function GoogleMark() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" className="google-mark"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.72 7.18l7.62 5.91c4.45-4.11 7.14-10.16 7.14-17.56z" /><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.12.75-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.11 1.41-4.81 2.25-8.28 2.25-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>;
}
function Login({ error, onLogin }: { error: string; onLogin: () => void }) {
  return <main className="login-page"><div className="login-decoration decor-one" /><div className="login-decoration decor-two" /><div className="login-left"><Brand /><div className="login-copy"><span className="eyebrow"><Sparkles size={14} /> CLARITY FOR EVERY PROJECT</span><h1>Good work deserves<br /><span>good numbers.</span></h1><p>Projects, expenses, team shares and payouts in one private workspace, connected to live database records.</p><div className="login-proof"><div className="login-card-icon compact-proof"><ShieldCheck size={19} /></div><div><b>One source of truth.</b><small>Live records and access controls.</small></div></div></div><div className="login-footer">© 2026 Infiskies Finance <span>Private workspace · Secure access</span></div></div><div className="login-right"><div className="login-card"><div className="login-card-icon"><LockKeyhole size={22} /></div><span className="eyebrow muted">WELCOME BACK</span><h2>Sign in to your workspace</h2><p>Use your authorized Google account to continue.</p><button className="google-button" onClick={onLogin} disabled={!isSupabaseConfigured}><GoogleMark /> Continue with Google <ArrowRight size={17} /></button>{!isSupabaseConfigured && <div className="setup-notice"><Settings size={16} /><span>Supabase URL or publishable key is missing.</span></div>}{error && <div className="error-notice">{error}</div>}<div className="login-divider"><span /> ACCESS CONTROL <span /></div><div className="secure-points"><div><ShieldCheck size={16} /> Admin-approved accounts only</div><div><BadgeCheck size={16} /> Role-based workspace permissions</div></div><small className="login-terms">Signing in does not automatically grant access. Your Google email must have an active workspace profile.</small></div><div className="login-right-bottom"><span>BUILT FOR ACCOUNTABILITY</span><span>PRIVACY FIRST <LockKeyhole size={12} /></span></div></div></main>;
}
function Loading({ text }: { text: string }) {
  return <div className="loading-screen"><Brand /><div className="loading-bar" /><span>{text}</span></div>;
}
function AccessDenied({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return <main className="denied-page"><div className="denied-card"><div className="denied-icon"><ShieldCheck size={27} /></div><span className="eyebrow muted">PRIVATE WORKSPACE</span><h1>Access is by invitation.</h1><p><b>{email}</b> is signed in, but this account has not been added to the Infiskies Finance team yet.</p><p>Ask the workspace owner to invite this exact Google email. If your account was just activated, sign out and sign in again.</p><button className="button button-primary full" onClick={onSignOut}><LockKeyhole size={17} /> Sign out</button></div></main>;
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState<Role>("employee");
  const [authorized, setAuthorized] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!supabase) { setAuthChecked(true); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) { setSession(next); setAuthChecked(true); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    async function check() {
      setAuthorized(false);
      setProfileChecked(false);
      if (!session || !supabase) { setProfileChecked(true); return; }
      let { data, error } = await (supabase as any).from("infiskies_profiles").select("role,status,email").eq("id", session.user.id).maybeSingle();
      if (!active) return;
      if (!error && !data) {
        // The RPC activates only a valid, unexpired invitation matching this authenticated user's JWT email.
        const { data: invitationAccepted } = await (supabase as any).rpc("infiskies_accept_my_invitation");
        if (!active) return;
        if (invitationAccepted) {
          const retry = await (supabase as any).from("infiskies_profiles").select("role,status,email").eq("id", session.user.id).maybeSingle();
          data = retry.data;
          error = retry.error;
        }
      }
      const emailMatches = String(data?.email || "").toLowerCase() === String(session.user.email || "").toLowerCase();
      if (error || !data || data.status !== "active" || !emailMatches) {
        setAuthorized(false);
        setProfileChecked(true);
        return;
      }
      setRole(data.role as Role);
      setAuthorized(true);
      setProfileChecked(true);
    }
    void check();
    return () => { active = false; };
  }, [session]);

  const signIn = async () => {
    if (!supabase) return;
    setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } } });
    if (error) setAuthError(error.message);
  };
  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setAuthorized(false);
    setProfileChecked(true);
  };
  if (!authChecked) return <Loading text="Preparing your workspace…" />;
  if (!session) return <Login error={authError} onLogin={() => void signIn()} />;
  if (!profileChecked) return <Loading text="Checking workspace access…" />;
  if (!authorized) return <AccessDenied email={session.user.email || "This account"} onSignOut={() => void signOut()} />;
  return <Workspace session={session} role={role} onSignOut={() => void signOut()} />;
}
