import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { api, API, getToken } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { toast } from "sonner";
import { Baseball as CricketBall, SignOut, Users, Ticket, Receipt, CurrencyInr, Plus, Trash, Check, X, Trophy, Eye, ChartBar, Gear } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${map[status] || "bg-zinc-100 text-zinc-700"}`}>{status}</span>
  );
};

const sections = [
  { key: "stats", label: "Overview", icon: ChartBar },
  { key: "contests", label: "Contests", icon: Ticket },
  { key: "entries", label: "Payments", icon: Receipt },
  { key: "withdrawals", label: "Withdrawals", icon: CurrencyInr },
  { key: "users", label: "Users", icon: Users },
  { key: "payment", label: "Payment settings", icon: Gear },
];

export default function AdminApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState("stats");

  const doLogout = () => { logout(); navigate("/"); };

  return (
    <div className="min-h-screen bg-zinc-100 flex" data-testid="admin-app">
      <aside className="w-60 bg-white border-r border-zinc-200 sticky top-0 h-screen flex flex-col">
        <div className="p-5 border-b border-zinc-100">
          <div className="flex items-center gap-2 font-heading font-extrabold text-lg text-zinc-950">
            <CricketBall weight="fill" className="text-emerald-600" size={24} />
            PitchPlay
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-orange-600">Admin console</div>
        </div>
        <nav className="p-3 flex-1">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors ${active === key ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "text-zinc-600 hover:bg-zinc-50 border border-transparent"}`}
              data-testid={`admin-nav-${key}`}
            >
              <Icon size={18} weight={active === key ? "duotone" : "regular"} />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-zinc-100">
          <div className="px-2 py-2 text-xs">
            <div className="font-bold text-zinc-950">{user?.name}</div>
            <div className="text-zinc-500 tabular">{user?.mobile}</div>
          </div>
          <Button variant="ghost" onClick={doLogout} className="w-full justify-start text-red-600 hover:bg-red-50" data-testid="admin-logout-btn">
            <SignOut size={16} className="mr-2" /> Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-6 lg:p-10">
        {active === "stats" && <StatsPanel />}
        {active === "contests" && <ContestsPanel />}
        {active === "entries" && <EntriesPanel />}
        {active === "withdrawals" && <WithdrawalsPanel />}
        {active === "users" && <UsersPanel />}
        {active === "payment" && <PaymentSettingsPanel />}
      </main>
    </div>
  );
}

function StatsPanel() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/admin/stats").then(r => setStats(r.data)); }, []);
  const cards = [
    { label: "Total users", value: stats?.total_users ?? "—", color: "emerald", icon: Users },
    { label: "Total contests", value: stats?.total_contests ?? "—", color: "orange", icon: Ticket },
    { label: "Pending payments", value: stats?.pending_entries ?? "—", color: "yellow", icon: Receipt },
    { label: "Pending withdrawals", value: stats?.pending_withdrawals ?? "—", color: "red", icon: CurrencyInr },
  ];
  return (
    <div>
      <h1 className="font-heading text-3xl font-extrabold tracking-tighter text-zinc-950">Overview</h1>
      <p className="text-zinc-500 mt-1">Live activity across the platform.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">
        {cards.map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white border border-zinc-200 rounded-lg p-6" data-testid={`stat-${label}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</div>
              <Icon size={20} weight="duotone" className={`text-${color}-600`} />
            </div>
            <div className="font-heading text-4xl font-extrabold tracking-tighter text-zinc-950 tabular mt-3">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContestsPanel() {
  const [contests, setContests] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", external_link: "", entry_fee: "", prize_pool: "", max_participants: "100", match_time: "" });

  const load = () => api.get("/contests").then(r => setContests(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/contests", {
        title: form.title.trim(),
        description: form.description.trim(),
        external_link: form.external_link.trim(),
        entry_fee: parseFloat(form.entry_fee || "0"),
        prize_pool: parseFloat(form.prize_pool || "0"),
        max_participants: parseInt(form.max_participants || "100"),
        match_time: form.match_time || null,
      });
      toast.success("Contest created");
      setOpen(false);
      setForm({ title: "", description: "", external_link: "", entry_fee: "", prize_pool: "", max_participants: "100", match_time: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const toggle = async (c, status) => {
    await api.patch(`/contests/${c.id}`, { status });
    toast.success(`Contest ${status}`);
    load();
  };

  const del = async (c) => {
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    await api.delete(`/contests/${c.id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tighter text-zinc-950">Contests</h1>
          <p className="text-zinc-500 mt-1">Create contests with any external play link.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 font-bold rounded-md" data-testid="new-contest-btn">
          <Plus size={16} weight="bold" className="mr-1" /> New contest
        </Button>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg mt-6 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50">
              <TableHead className="font-bold text-zinc-700">Title</TableHead>
              <TableHead className="font-bold text-zinc-700">Entry / Prize</TableHead>
              <TableHead className="font-bold text-zinc-700">Participants</TableHead>
              <TableHead className="font-bold text-zinc-700">Status</TableHead>
              <TableHead className="font-bold text-zinc-700 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contests.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-zinc-500">No contests yet</TableCell></TableRow>
            ) : contests.map((c) => (
              <TableRow key={c.id} className="even:bg-zinc-50/40" data-testid={`admin-contest-row-${c.id}`}>
                <TableCell>
                  <div className="font-bold text-zinc-950">{c.title}</div>
                  <div className="text-xs text-zinc-500 truncate max-w-xs">{c.external_link}</div>
                </TableCell>
                <TableCell className="tabular"><span className="font-bold">{money(c.entry_fee)}</span> / <span className="text-orange-700 font-bold">{money(c.prize_pool)}</span></TableCell>
                <TableCell className="tabular">{c.participants_count}/{c.max_participants}</TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {c.status === "open" ? (
                      <Button size="sm" variant="outline" onClick={() => toggle(c, "closed")} data-testid={`close-contest-${c.id}`}>Close</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => toggle(c, "open")} data-testid={`open-contest-${c.id}`}>Reopen</Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => del(c)} data-testid={`delete-contest-${c.id}`}>
                      <Trash size={16} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="new-contest-dialog">
          <DialogHeader><DialogTitle className="font-heading font-extrabold">Create contest</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="contest-title-input" /></Field>
            <Field label="External play link"><Input value={form.external_link} onChange={(e) => setForm({ ...form, external_link: e.target.value })} placeholder="https://..." data-testid="contest-link-input" /></Field>
            <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="contest-desc-input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entry fee (₹)"><Input inputMode="decimal" value={form.entry_fee} onChange={(e) => setForm({ ...form, entry_fee: e.target.value })} data-testid="contest-fee-input" /></Field>
              <Field label="Prize pool (₹)"><Input inputMode="decimal" value={form.prize_pool} onChange={(e) => setForm({ ...form, prize_pool: e.target.value })} data-testid="contest-prize-input" /></Field>
            </div>
            <Field label="Max participants"><Input inputMode="numeric" value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} data-testid="contest-max-input" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} className="bg-emerald-600 hover:bg-emerald-700 font-bold" data-testid="create-contest-submit">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function EntriesPanel() {
  const [entries, setEntries] = useState([]);
  const [preview, setPreview] = useState(null);
  const [winnerFor, setWinnerFor] = useState(null);
  const [prize, setPrize] = useState("");

  const load = () => api.get("/entries").then(r => setEntries(r.data));
  useEffect(() => { load(); }, []);

  const decide = async (e, action) => {
    try {
      await api.post(`/entries/${e.id}/decision`, { action });
      toast.success(action === "approve" ? "Approved" : "Rejected");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const declare = async () => {
    const n = parseFloat(prize);
    if (!n || n <= 0) { toast.error("Enter prize amount"); return; }
    try {
      await api.post(`/entries/${winnerFor.id}/declare-winner`, { entry_id: winnerFor.id, prize_amount: n });
      toast.success("Winner declared, wallet credited");
      setWinnerFor(null); setPrize("");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <h1 className="font-heading text-3xl font-extrabold tracking-tighter text-zinc-950">Payment approvals</h1>
      <p className="text-zinc-500 mt-1">Review UPI screenshots, approve to unlock the play link, declare winners.</p>

      <div className="bg-white border border-zinc-200 rounded-lg mt-6 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50">
              <TableHead className="font-bold text-zinc-700">User</TableHead>
              <TableHead className="font-bold text-zinc-700">Contest</TableHead>
              <TableHead className="font-bold text-zinc-700">Fee / UTR</TableHead>
              <TableHead className="font-bold text-zinc-700">Status</TableHead>
              <TableHead className="font-bold text-zinc-700 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-zinc-500">No entries yet</TableCell></TableRow>
            ) : entries.map((e) => (
              <TableRow key={e.id} data-testid={`admin-entry-row-${e.id}`}>
                <TableCell>
                  <div className="font-bold text-zinc-950">{e.user_name}</div>
                  <div className="text-xs text-zinc-500 tabular">{e.user_mobile}</div>
                </TableCell>
                <TableCell><div className="font-semibold text-zinc-800">{e.contest_title}</div></TableCell>
                <TableCell className="tabular">
                  <div className="font-bold">{money(e.entry_fee)}</div>
                  <div className="text-xs text-zinc-500">UTR: {e.utr || "—"}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={e.status} />
                  {e.status === "won" && <div className="text-xs text-orange-700 font-bold mt-1 tabular">🏆 {money(e.winner_prize)}</div>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setPreview(e)} data-testid={`view-screenshot-${e.id}`}><Eye size={14} /></Button>
                    {e.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => decide(e, "approve")} className="bg-emerald-600 hover:bg-emerald-700" data-testid={`approve-entry-${e.id}`}><Check size={14} /></Button>
                        <Button size="sm" variant="destructive" onClick={() => decide(e, "reject")} data-testid={`reject-entry-${e.id}`}><X size={14} /></Button>
                      </>
                    )}
                    {e.status === "approved" && (
                      <Button size="sm" onClick={() => setWinnerFor(e)} className="bg-orange-600 hover:bg-orange-700" data-testid={`declare-winner-${e.id}`}>
                        <Trophy size={14} className="mr-1" /> Winner
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-lg" data-testid="screenshot-preview">
          <DialogHeader><DialogTitle className="font-heading font-extrabold">Payment screenshot</DialogTitle></DialogHeader>
          {preview && <ScreenshotViewer path={preview.screenshot_path} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!winnerFor} onOpenChange={(v) => !v && setWinnerFor(null)}>
        <DialogContent className="max-w-sm" data-testid="winner-dialog">
          <DialogHeader><DialogTitle className="font-heading font-extrabold">Declare winner</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600">Credit prize to <b>{winnerFor?.user_name}</b> for <b>{winnerFor?.contest_title}</b>.</p>
          <Field label="Prize (₹)"><Input value={prize} onChange={(e) => setPrize(e.target.value)} inputMode="decimal" data-testid="prize-input" /></Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWinnerFor(null)}>Cancel</Button>
            <Button onClick={declare} className="bg-orange-600 hover:bg-orange-700 font-bold" data-testid="declare-submit">Credit & declare</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScreenshotViewer({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl;
    (async () => {
      const res = await fetch(`${API}/files?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  if (!url) return <div className="p-8 text-center text-zinc-500 text-sm">Loading...</div>;
  return <img src={url} alt="Screenshot" className="w-full rounded-md border border-zinc-200" data-testid="screenshot-img" />;
}

function WithdrawalsPanel() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/withdrawals").then(r => setItems(r.data));
  useEffect(() => { load(); }, []);
  const decide = async (w, action) => {
    try {
      await api.post(`/withdrawals/${w.id}/decision`, { action });
      toast.success(action === "approve" ? "Marked paid" : "Rejected & refunded");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <div>
      <h1 className="font-heading text-3xl font-extrabold tracking-tighter text-zinc-950">Withdrawals</h1>
      <p className="text-zinc-500 mt-1">Pay the UPI, then mark as paid. Rejecting refunds the user's wallet.</p>
      <div className="bg-white border border-zinc-200 rounded-lg mt-6 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50">
              <TableHead className="font-bold">User</TableHead>
              <TableHead className="font-bold">Amount</TableHead>
              <TableHead className="font-bold">UPI ID</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="font-bold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-zinc-500">No withdrawals</TableCell></TableRow>
            ) : items.map((w) => (
              <TableRow key={w.id} data-testid={`admin-wd-row-${w.id}`}>
                <TableCell>
                  <div className="font-bold text-zinc-950">{w.user_name}</div>
                  <div className="text-xs text-zinc-500 tabular">{w.user_mobile}</div>
                </TableCell>
                <TableCell className="font-heading font-extrabold tabular">{money(w.amount)}</TableCell>
                <TableCell className="tabular">{w.upi_id}</TableCell>
                <TableCell><StatusBadge status={w.status} /></TableCell>
                <TableCell className="text-right">
                  {w.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => decide(w, "approve")} className="bg-emerald-600 hover:bg-emerald-700" data-testid={`approve-wd-${w.id}`}><Check size={14} className="mr-1" />Paid</Button>
                      <Button size="sm" variant="destructive" onClick={() => decide(w, "reject")} data-testid={`reject-wd-${w.id}`}><X size={14} /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [walletFor, setWalletFor] = useState(null);
  const load = () => api.get("/admin/users").then(r => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const del = async (u) => {
    if (!window.confirm(`Remove "${u.name}" (${u.mobile})? All their entries & withdrawals will be deleted.`)) return;
    try { await api.delete(`/admin/users/${u.id}`); toast.success("User removed"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const block = async (u) => {
    try { await api.post(`/admin/users/${u.id}/block`, { blocked: !u.blocked }); toast.success(u.blocked ? "Unblocked" : "Blocked"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tighter text-zinc-950">Users</h1>
          <p className="text-zinc-500 mt-1">Mobile numbers are visible only to you (admin). Add, block or remove users.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 font-bold rounded-md" data-testid="add-user-btn">
          <Plus size={16} weight="bold" className="mr-1" /> Add user
        </Button>
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg mt-6 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50">
              <TableHead className="font-bold">Name</TableHead>
              <TableHead className="font-bold">Mobile</TableHead>
              <TableHead className="font-bold">Entries</TableHead>
              <TableHead className="font-bold">Wallet</TableHead>
              <TableHead className="font-bold">Total won</TableHead>
              <TableHead className="font-bold">Joined</TableHead>
              <TableHead className="font-bold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-zinc-500">No users yet</TableCell></TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id} className={u.blocked ? "opacity-60" : ""} data-testid={`admin-user-row-${u.id}`}>
                <TableCell className="font-bold text-zinc-950">
                  {u.name}
                  {u.blocked && <span className="ml-2 text-[10px] font-bold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded" data-testid={`blocked-badge-${u.id}`}>blocked</span>}
                </TableCell>
                <TableCell className="tabular font-mono">{u.mobile}</TableCell>
                <TableCell className="tabular">{u.entries_count}</TableCell>
                <TableCell className="tabular font-bold text-emerald-700">{money(u.wallet_balance)}</TableCell>
                <TableCell className="tabular font-bold text-orange-700">{money(u.total_won)}</TableCell>
                <TableCell className="text-xs text-zinc-500">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setWalletFor(u)} data-testid={`wallet-user-${u.id}`}><CurrencyInr size={14} className="mr-1" />Wallet</Button>
                    <Button size="sm" variant="outline" onClick={() => block(u)} data-testid={`block-user-${u.id}`}>{u.blocked ? "Unblock" : "Block"}</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => del(u)} data-testid={`delete-user-${u.id}`}><Trash size={16} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} onDone={load} />
      <WalletDialog user={walletFor} onClose={() => setWalletFor(null)} onDone={load} />
    </div>
  );
}

function AddUserDialog({ open, onClose, onDone }) {
  const [form, setForm] = useState({ name: "", mobile: "", password: "", wallet_balance: "0" });
  const submit = async () => {
    try {
      await api.post("/admin/users", { ...form, wallet_balance: parseFloat(form.wallet_balance || "0") });
      toast.success("User added");
      setForm({ name: "", mobile: "", password: "", wallet_balance: "0" });
      onClose(); onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="add-user-dialog">
        <DialogHeader><DialogTitle className="font-heading font-extrabold">Add user</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="add-user-name" /></Field>
          <Field label="Mobile"><Input inputMode="numeric" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} data-testid="add-user-mobile" /></Field>
          <Field label="Password"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="add-user-password" /></Field>
          <Field label="Opening wallet (₹)"><Input inputMode="decimal" value={form.wallet_balance} onChange={(e) => setForm({ ...form, wallet_balance: e.target.value })} data-testid="add-user-wallet" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700 font-bold" data-testid="add-user-submit">Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WalletDialog({ user, onClose, onDone }) {
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const adjust = async (sign) => {
    const n = parseFloat(amt);
    if (!n || n <= 0) { toast.error("Enter amount"); return; }
    try {
      await api.post(`/admin/users/${user.id}/wallet`, { amount: sign * n, note });
      toast.success(sign > 0 ? "Wallet credited" : "Wallet debited");
      setAmt(""); setNote(""); onClose(); onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="wallet-dialog">
        <DialogHeader><DialogTitle className="font-heading font-extrabold">Adjust wallet</DialogTitle></DialogHeader>
        <p className="text-sm text-zinc-600"><b>{user?.name}</b> · current balance <b className="text-emerald-700 tabular">{money(user?.wallet_balance)}</b></p>
        <Field label="Amount (₹)"><Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} data-testid="wallet-amount" /></Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} data-testid="wallet-note" /></Field>
        <DialogFooter>
          <Button variant="destructive" onClick={() => adjust(-1)} data-testid="wallet-debit">Debit</Button>
          <Button onClick={() => adjust(1)} className="bg-emerald-600 hover:bg-emerald-700 font-bold" data-testid="wallet-credit">Credit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentSettingsPanel() {
  const [form, setForm] = useState({ upi_id: "", payee_name: "", instructions: "" });
  useEffect(() => { api.get("/admin/payment-settings").then(r => setForm({ upi_id: r.data.upi_id || "", payee_name: r.data.payee_name || "", instructions: r.data.instructions || "" })); }, []);
  const save = async () => {
    try { await api.put("/admin/payment-settings", form); toast.success("Payment settings saved"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const upiLink = `upi://pay?pa=${encodeURIComponent(form.upi_id)}&pn=${encodeURIComponent(form.payee_name || "Admin")}&cu=INR`;
  return (
    <div>
      <h1 className="font-heading text-3xl font-extrabold tracking-tighter text-zinc-950">Payment settings</h1>
      <p className="text-zinc-500 mt-1">Users pay entry fees to this UPI ID. A QR code is generated automatically.</p>
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white border border-zinc-200 rounded-lg p-6 grid gap-4">
          <Field label="UPI ID"><Input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="yourname@upi" data-testid="settings-upi-input" /></Field>
          <Field label="Payee name"><Input value={form.payee_name} onChange={(e) => setForm({ ...form, payee_name: e.target.value })} data-testid="settings-payee-input" /></Field>
          <Field label="Instructions for users"><Textarea rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="e.g. Add your mobile number in payment remark" data-testid="settings-instructions-input" /></Field>
          <Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700 font-bold w-fit" data-testid="settings-save-btn">Save settings</Button>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-6 flex flex-col items-center justify-center gap-3">
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">QR preview</div>
          {form.upi_id ? <QRCodeSVG value={upiLink} size={180} data-testid="settings-qr" /> : <div className="text-sm text-zinc-400">Enter UPI ID</div>}
          <div className="font-heading font-extrabold text-emerald-800 tabular" data-testid="settings-upi-preview">{form.upi_id || "—"}</div>
        </div>
      </div>
    </div>
  );
}
