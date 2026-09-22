import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Baseball as CricketBall, ArrowRight, ShieldCheck, Lightning, Trophy } from "@phosphor-icons/react";

const HERO = "https://images.pexels.com/photos/36741131/pexels-photo-36741131.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Landing() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", mobile: "", password: "" });
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate(user.role === "admin" ? "/admin" : "/app", { replace: true });
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = mode === "login"
        ? await login(form.mobile.trim(), form.password)
        : await signup(form.name.trim(), form.mobile.trim(), form.password);
      toast.success(`Welcome ${u.name}`);
      navigate(u.role === "admin" ? "/admin" : "/app", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100" data-testid="landing-page">
      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-heading font-extrabold text-lg text-zinc-950" data-testid="brand-logo">
            <CricketBall weight="fill" className="text-emerald-600" size={28} />
            <span>PitchPlay</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMode("login")}
              className="text-sm font-semibold text-zinc-700 hover:text-emerald-600 transition-colors"
              data-testid="nav-login-btn"
            >
              Login
            </button>
            <Button
              onClick={() => setMode("signup")}
              className="rounded-full bg-emerald-600 hover:bg-emerald-700 font-bold active:scale-95 transition-transform"
              data-testid="nav-signup-btn"
            >
              Sign up
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero + Auth */}
      <section className="max-w-7xl mx-auto px-6 pt-10 pb-16 grid lg:grid-cols-5 gap-10 items-start">
        <div className="lg:col-span-3">
          <div className="relative rounded-2xl overflow-hidden border border-zinc-200">
            <img src={HERO} alt="Stadium" className="w-full h-[420px] object-cover" />
            <div className="absolute inset-0 bg-zinc-950/55" />
            <div className="grain absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none" />
            <div className="absolute inset-0 p-10 flex flex-col justify-end">
              <span className="inline-flex items-center gap-2 self-start bg-orange-600 text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                <Lightning weight="fill" size={12} /> Private Contests
              </span>
              <h1 className="mt-4 font-heading text-white text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tighter leading-[1.05]">
                Private cricket contests.<br />
                <span className="text-emerald-300">Play the pitch, win the pot.</span>
              </h1>
              <p className="mt-4 text-zinc-200 text-base max-w-lg leading-relaxed">
                Admin drops a contest link, you pay the entry, we open the gate. Winners get paid straight to their UPI.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-6">
            {[
              { icon: ShieldCheck, title: "Admin-verified", body: "Every payment reviewed before entry approval." },
              { icon: Lightning, title: "Any game link", body: "Cricket fantasy, quiz, external apps — admin's choice." },
              { icon: Trophy, title: "Direct payouts", body: "Winners withdraw to UPI, admin approves & pays." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white border border-zinc-200 rounded-lg p-5 hover:border-zinc-300 hover:-translate-y-0.5 transition-transform">
                <Icon size={22} weight="duotone" className="text-emerald-600" />
                <div className="font-heading font-bold text-zinc-950 mt-3">{title}</div>
                <div className="text-sm text-zinc-500 mt-1 leading-relaxed">{body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white border border-zinc-200 rounded-2xl p-8" data-testid="auth-card">
            <div className="flex items-center gap-6 border-b border-zinc-100 pb-4">
              <button
                onClick={() => setMode("login")}
                className={`font-heading text-lg font-bold pb-2 transition-colors ${mode === "login" ? "text-emerald-600 border-b-2 border-emerald-600 -mb-[17px]" : "text-zinc-400"}`}
                data-testid="tab-login"
              >
                Login
              </button>
              <button
                onClick={() => setMode("signup")}
                className={`font-heading text-lg font-bold pb-2 transition-colors ${mode === "signup" ? "text-emerald-600 border-b-2 border-emerald-600 -mb-[17px]" : "text-zinc-400"}`}
                data-testid="tab-signup"
              >
                Sign up
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={submit}>
              {mode === "signup" && (
                <div>
                  <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-zinc-500">Full name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Virat K."
                    className="mt-2 border-zinc-200 focus-visible:ring-emerald-500"
                    data-testid="input-name"
                    required
                  />
                </div>
              )}
              <div>
                <Label htmlFor="mobile" className="text-xs font-bold uppercase tracking-widest text-zinc-500">Mobile number</Label>
                <Input
                  id="mobile"
                  inputMode="numeric"
                  pattern="[0-9]{6,15}"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  placeholder="9876543210"
                  className="mt-2 border-zinc-200 focus-visible:ring-emerald-500 tabular"
                  data-testid="input-mobile"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-zinc-500">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimum 4 characters"
                  className="mt-2 border-zinc-200 focus-visible:ring-emerald-500"
                  data-testid="input-password"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 font-bold text-base rounded-md active:scale-[0.98] transition-transform"
                data-testid="auth-submit-btn"
              >
                {busy ? "Please wait..." : mode === "login" ? "Enter contest lobby" : "Create my account"}
                <ArrowRight size={18} weight="bold" className="ml-2" />
              </Button>
              <p className="text-xs text-zinc-500 text-center">
                Only your mobile is stored. Visible only to the admin.
              </p>
            </form>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between text-sm text-zinc-500">
          <span>© PitchPlay — Private contest lounge</span>
          <span className="font-mono">v1.0</span>
        </div>
      </footer>
    </div>
  );
}
