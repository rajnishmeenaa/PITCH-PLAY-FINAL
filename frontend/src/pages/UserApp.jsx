import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { Baseball as CricketBall, SignOut, Wallet, Trophy, Ticket, Clock, ArrowSquareOut, UploadSimple, CurrencyInr, Copy, DeviceMobile, WhatsappLogo } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { ScreenshotViewer } from "./AdminApp";
import { useNavigate } from "react-router-dom";

const StatusBadge = ({ status }) => {
  const map = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    won: "bg-orange-100 text-orange-800",
    paid: "bg-emerald-100 text-emerald-800",
    open: "bg-emerald-100 text-emerald-800",
    closed: "bg-zinc-200 text-zinc-700",
    completed: "bg-zinc-200 text-zinc-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${map[status] || "bg-zinc-100 text-zinc-700"}`} data-testid={`status-${status}`}>
      {status}
    </span>
  );
};

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function UserApp() {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const [contests, setContests] = useState([]);
  const [entries, setEntries] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [history, setHistory] = useState([]);
  const [winners, setWinners] = useState([]);
  const [config, setConfig] = useState({ admin_upi_id: "" });
  const [joinContest, setJoinContest] = useState(null);
  const [wdOpen, setWdOpen] = useState(false);

  const loadAll = async () => {
    try {
      const [c, e, w, cfg, me, h, win] = await Promise.all([
        api.get("/contests"),
        api.get("/entries/mine"),
        api.get("/withdrawals/mine"),
        api.get("/wallet/config"),
        api.get("/auth/me"),
        api.get("/wallet/history"),
        api.get("/winners"),
      ]);
      setContests(c.data);
      setEntries(e.data);
      setWithdrawals(w.data);
      setConfig(cfg.data);
      setUser(me.data);
      setHistory(h.data);
      setWinners(win.data);
    } catch (err) {
      toast.error("Failed to load data");
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  const doLogout = () => { logout(); navigate("/"); };

  return (
    <div className="min-h-screen bg-zinc-100" data-testid="user-app">
      <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-heading font-extrabold text-lg text-zinc-950">
            <CricketBall weight="fill" className="text-emerald-600" size={26} />
            PitchPlay
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full" data-testid="wallet-pill">
              <Wallet size={18} weight="duotone" className="text-emerald-700" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Wallet</span>
              <span className="font-heading font-extrabold text-emerald-900 tabular">{money(user?.wallet_balance)}</span>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-sm font-bold text-zinc-950">{user?.name}</div>
              <div className="text-xs text-zinc-500 tabular">{user?.mobile}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={doLogout} className="text-zinc-600 hover:text-red-600" data-testid="logout-btn">
              <SignOut size={18} /> <span className="ml-1 hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tighter text-zinc-950">
            Hey {user?.name?.split(" ")[0]}, ready to play?
          </h1>
          <p className="text-zinc-500 mt-1">Browse the live contests, pay & get admin approval, then hit the pitch.</p>
        </div>

        <Tabs defaultValue="contests" className="w-full">
          <TabsList className="bg-white border border-zinc-200 rounded-full p-1 h-auto" data-testid="tabs-list">
            <TabsTrigger value="contests" className="rounded-full data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-5 py-2 font-bold" data-testid="tab-contests">
              <Ticket size={16} className="mr-1.5" /> Contests
            </TabsTrigger>
            <TabsTrigger value="entries" className="rounded-full data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-5 py-2 font-bold" data-testid="tab-entries">
              <Trophy size={16} className="mr-1.5" /> My Entries
            </TabsTrigger>
            <TabsTrigger value="wallet" className="rounded-full data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-5 py-2 font-bold" data-testid="tab-wallet">
              <Wallet size={16} className="mr-1.5" /> Wallet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contests" className="mt-6">
            <WinnersBoard winners={winners} />
            {contests.length === 0 ? (
              <EmptyState title="No contests yet" body="The admin hasn't dropped any contest. Check back soon." />
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {contests.map((c) => (
                  <ContestCard key={c.id} contest={c} onJoin={() => setJoinContest(c)} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="entries" className="mt-6">
            {entries.length === 0 ? (
              <EmptyState title="No entries yet" body="Join a contest to see it here." />
            ) : (
              <div className="space-y-3">
                {entries.map((e) => (
                  <div key={e.id} className="bg-white border border-zinc-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-testid={`entry-row-${e.id}`}>
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="font-heading font-bold text-zinc-950">{e.contest_title}</div>
                        <StatusBadge status={e.status} />
                      </div>
                      <div className="text-sm text-zinc-500 mt-1 tabular">Entry: {money(e.entry_fee)} · UTR: {e.utr || "—"}</div>
                      {e.status === "won" && (
                        <div className="text-sm font-bold text-orange-700 mt-1 tabular">🏆 Prize: {money(e.winner_prize)}</div>
                      )}
                    </div>
                    {e.status === "approved" && e.external_link && (
                      <a
                        href={e.external_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-md active:scale-95 transition-transform"
                        data-testid={`play-link-${e.id}`}
                      >
                        <ArrowSquareOut size={16} weight="bold" /> Open contest
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="wallet" className="mt-6">
            <div className="grid md:grid-cols-3 gap-5">
              <div className="md:col-span-1 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white rounded-lg p-6 border border-emerald-700">
                <div className="text-xs font-bold uppercase tracking-widest opacity-80">Wallet balance</div>
                <div className="font-heading text-5xl font-extrabold tabular tracking-tighter mt-2" data-testid="wallet-balance">
                  {money(user?.wallet_balance)}
                </div>
                <Button
                  disabled={(user?.wallet_balance || 0) <= 0}
                  onClick={() => setWdOpen(true)}
                  className="mt-6 w-full bg-white text-emerald-800 hover:bg-emerald-50 font-bold rounded-md active:scale-95"
                  data-testid="request-withdrawal-btn"
                >
                  <CurrencyInr size={18} weight="bold" className="mr-1" /> Request withdrawal
                </Button>
              </div>
              <div className="md:col-span-2 space-y-5">
                <WalletHistory items={history} />
                <div className="bg-white border border-zinc-200 rounded-lg">
                <div className="p-5 border-b border-zinc-100">
                  <div className="font-heading font-bold text-zinc-950">Withdrawal history</div>
                </div>
                {withdrawals.length === 0 ? (
                  <div className="p-10 text-center text-zinc-500 text-sm">No withdrawals yet</div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {withdrawals.map((w) => (
                      <div key={w.id} className="p-5 flex items-center justify-between" data-testid={`withdrawal-row-${w.id}`}>
                        <div>
                          <div className="font-heading font-bold text-zinc-950 tabular">{money(w.amount)}</div>
                          <div className="text-xs text-zinc-500 mt-0.5">to {w.upi_id} · {new Date(w.created_at).toLocaleString()}</div>
                        </div>
                        <StatusBadge status={w.status} />
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <JoinDialog contest={joinContest} onClose={() => setJoinContest(null)} config={config} onDone={loadAll} />
      <WithdrawDialog open={wdOpen} onClose={() => setWdOpen(false)} balance={user?.wallet_balance || 0} onDone={loadAll} />
    </div>
  );
}

function useCountdown(iso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!iso) return null;
  const diff = new Date(iso).getTime() - now;
  if (isNaN(diff)) return null;
  if (diff <= 0) return { over: true, text: "Match started" };
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return { over: false, urgent: diff < 3600000, text: d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s)}` };
}

function ContestCard({ contest, onJoin }) {
  const cd = useCountdown(contest.match_time);
  const closed = contest.status !== "open" || (cd && cd.over);
  const share = () => {
    const text = `🏏 Join "${contest.title}" on PitchPlay!\nEntry ₹${contest.entry_fee} · Prize pool ₹${contest.prize_pool}\n${window.location.origin}/?contest=${contest.id}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  return (
    <div className="group bg-white border border-zinc-200 rounded-lg p-6 hover:border-emerald-400 hover:-translate-y-1 transition-all duration-200" data-testid={`contest-card-${contest.id}`}>
      <div className="flex items-start justify-between">
        <div>
          <StatusBadge status={contest.status} />
          <h3 className="font-heading text-xl font-bold text-zinc-950 mt-3 group-hover:text-emerald-700 transition-colors">
            {contest.title}
          </h3>
          {contest.description && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{contest.description}</p>}
        </div>
        <button type="button" onClick={share} className="p-2 rounded-full text-emerald-700 hover:bg-emerald-50" title="Share on WhatsApp" data-testid={`share-btn-${contest.id}`}>
          <WhatsappLogo size={22} weight="fill" />
        </button>
      </div>
      {cd && (
        <div className={`mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-bold tabular ${cd.over ? "bg-zinc-100 text-zinc-600" : cd.urgent ? "bg-red-50 text-red-700 border border-red-200" : "bg-orange-50 text-orange-800 border border-orange-100"}`} data-testid={`countdown-${contest.id}`}>
          <Clock size={16} weight="bold" /> {cd.over ? cd.text : `Entries close in ${cd.text}`}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="bg-zinc-50 border border-zinc-100 rounded p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Entry fee</div>
          <div className="font-heading text-xl font-extrabold text-zinc-950 tabular mt-1">{money(contest.entry_fee)}</div>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-orange-700">Prize pool</div>
          <div className="font-heading text-xl font-extrabold text-orange-700 tabular mt-1">{money(contest.prize_pool)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-zinc-100">
        <div className="text-xs text-zinc-500 tabular">
          {contest.participants_count}/{contest.max_participants} joined
        </div>
        <Button
          disabled={closed}
          onClick={onJoin}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700 font-bold active:scale-95"
          data-testid={`join-btn-${contest.id}`}
        >
          Join contest
        </Button>
      </div>
    </div>
  );
}

function JoinDialog({ contest, onClose, config, onDone }) {
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setUtr(""); setFile(null); }, [contest]);

  if (!contest) return null;

  const upiLink = `upi://pay?pa=${encodeURIComponent(config.admin_upi_id || "")}&pn=${encodeURIComponent(config.payee_name || "Admin")}&am=${contest.entry_fee}&cu=INR&tn=${encodeURIComponent(contest.title)}`;
  const copyUpi = () => { navigator.clipboard?.writeText(config.admin_upi_id || ""); toast.success("UPI ID copied"); };

  const submit = async () => {
    if (!file) { toast.error("Upload payment screenshot"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("contest_id", contest.id);
      fd.append("utr", utr);
      fd.append("screenshot", file);
      await api.post("/entries", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Entry submitted. Waiting for admin approval.");
      onClose();
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to submit entry");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!contest} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="join-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-extrabold tracking-tight">Join {contest.title}</DialogTitle>
          <DialogDescription>Pay <span className="font-bold text-emerald-700 tabular">{money(contest.entry_fee)}</span> to the admin UPI below, then upload the payment screenshot.</DialogDescription>
        </DialogHeader>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-4 items-center">
          <div className="bg-white p-2 rounded-md border border-emerald-200 shrink-0 w-[126px]">
            {config.qr_path ? <ScreenshotViewer path={config.qr_path} testId="upi-qr-image" className="w-full rounded" /> : <QRCodeSVG value={upiLink} size={110} data-testid="upi-qr" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-800">Pay to UPI ID</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="font-heading text-xl font-extrabold text-emerald-900 tabular truncate select-all" data-testid="admin-upi-display">{config.admin_upi_id || "—"}</div>
              <button type="button" onClick={copyUpi} className="p-1.5 rounded hover:bg-emerald-100 text-emerald-800" title="Copy" data-testid="copy-upi-btn"><Copy size={16} weight="bold" /></button>
            </div>
            {config.payee_name && <div className="text-xs text-emerald-800">{config.payee_name}</div>}
            <a href={upiLink} className="mt-2 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-md" data-testid="pay-upi-link">
              <DeviceMobile size={14} weight="bold" /> Pay {money(contest.entry_fee)} in UPI app
            </a>
          </div>
        </div>
        {config.instructions && <p className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2" data-testid="payment-instructions">{config.instructions}</p>}
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">UTR / Ref no. (optional)</Label>
            <Input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="12-digit UTR" className="mt-2 tabular" data-testid="input-utr" />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Payment screenshot</Label>
            <label className="mt-2 flex items-center justify-center gap-2 h-24 border-2 border-dashed border-zinc-300 hover:border-emerald-500 rounded-md cursor-pointer transition-colors" data-testid="upload-zone">
              <UploadSimple size={22} weight="bold" className="text-zinc-500" />
              <span className="text-sm text-zinc-600 font-semibold">{file ? file.name : "Click to upload (PNG/JPG, ≤5MB)"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="file-input" />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="cancel-join">Cancel</Button>
          <Button disabled={busy} onClick={submit} className="bg-emerald-600 hover:bg-emerald-700 font-bold" data-testid="submit-entry-btn">
            {busy ? "Submitting..." : "Submit entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({ open, onClose, balance, onDone }) {
  const [amt, setAmt] = useState("");
  const [upi, setUpi] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = parseFloat(amt);
    if (!n || n <= 0) { toast.error("Enter a valid amount"); return; }
    if (!upi.trim()) { toast.error("Enter your UPI ID"); return; }
    setBusy(true);
    try {
      await api.post("/withdrawals", { amount: n, upi_id: upi.trim() });
      toast.success("Withdrawal requested. Admin will process shortly.");
      setAmt(""); setUpi("");
      onClose(); onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="withdraw-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-extrabold">Request withdrawal</DialogTitle>
          <DialogDescription>Available balance: <span className="font-bold text-emerald-700 tabular">{money(balance)}</span></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Amount (₹)</Label>
            <Input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" className="mt-2 tabular" data-testid="input-amount" />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Your UPI ID</Label>
            <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="you@upi" className="mt-2" data-testid="input-upi" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={submit} className="bg-orange-600 hover:bg-orange-700 font-bold" data-testid="submit-withdrawal-btn">
            {busy ? "Requesting..." : "Request payout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WinnersBoard({ winners }) {
  if (!winners.length) return null;
  return (
    <div className="mb-6 bg-zinc-950 text-white rounded-lg p-5 border border-zinc-800" data-testid="winners-board">
      <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-widest">
        <Trophy size={16} weight="fill" /> Recent winners
      </div>
      <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {winners.slice(0, 6).map((w) => (
          <div key={w.id} className="bg-zinc-900 border border-zinc-800 rounded-md px-4 py-3 flex items-center justify-between" data-testid={`winner-${w.id}`}>
            <div className="min-w-0">
              <div className="font-heading font-bold truncate">{w.user_name}</div>
              <div className="text-xs text-zinc-400 truncate">{w.contest_title}</div>
            </div>
            <div className="font-heading font-extrabold text-orange-400 tabular ml-3">{money(w.winner_prize)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WalletHistory({ items }) {
  const color = { prize: "text-orange-700", credit: "text-emerald-700", debit: "text-red-600", payout: "text-red-600" };
  return (
    <div className="bg-white border border-zinc-200 rounded-lg" data-testid="wallet-history">
      <div className="p-5 border-b border-zinc-100 font-heading font-bold text-zinc-950">Wallet history</div>
      {items.length === 0 ? (
        <div className="p-10 text-center text-zinc-500 text-sm">No transactions yet</div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {items.map((t) => (
            <div key={t.id} className="px-5 py-3 flex items-center justify-between" data-testid={`wallet-tx-${t.id}`}>
              <div>
                <div className="text-sm font-semibold text-zinc-900">{t.note}</div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">{t.type} · {new Date(t.created_at).toLocaleString()}</div>
              </div>
              <div className={`font-heading font-extrabold tabular ${color[t.type]}`}>{t.amount > 0 ? "+" : "−"}{money(Math.abs(t.amount))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="bg-white border border-dashed border-zinc-300 rounded-lg p-16 text-center">
      <Clock size={40} weight="duotone" className="text-zinc-400 mx-auto" />
      <div className="font-heading font-bold text-zinc-800 text-lg mt-3">{title}</div>
      <div className="text-sm text-zinc-500 mt-1">{body}</div>
    </div>
  );
}
