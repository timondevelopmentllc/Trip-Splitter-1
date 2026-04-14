import { useState, useEffect, useMemo, useCallback } from "react";

const COLORS = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8","#F7DC6F","#BB8FCE","#85C1E9"];
const API_KEY = "$2a$10$wNAoTowmnzwMmc1cUQ0aqur6BdHGi9gLMtpsVWq8Ys/idD43KPZ3m";
const BIN_NAME = "trip-splitter-live";
const POLL_INTERVAL = 5000;

const fmt = (n) => `$${Math.abs(n).toFixed(2)}`;
const tsNow = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const defaultData = () => ({ people: [], expenses: [], lastUpdated: Date.now() });

async function getBinId() {
  const stored = "69dd886536566621a8ade512";
  if (stored) return stored;
  const res = await fetch("https://api.jsonbin.io/v3/b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Master-Key": API_KEY, "X-Bin-Name": BIN_NAME },
    body: JSON.stringify(defaultData()),
  });
  const data = await res.json();
  const id = data.metadata.id;
  localStorage.setItem("jsonbin-id", id);
  return id;
}

async function readBin(binId) {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
    headers: { "X-Master-Key": API_KEY },
  });
  const data = await res.json();
  return data.record;
}

async function writeBin(binId, payload) {
  await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Master-Key": API_KEY },
    body: JSON.stringify({ ...payload, lastUpdated: Date.now() }),
  });
}

export default function App() {
  const [binId, setBinId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [myName, setMyName] = useState(() => localStorage.getItem("trip-my-name") || "");
  const [nameInput, setNameInput] = useState("");
  const [tab, setTab] = useState("expenses");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ desc: "", amount: "", paidBy: "", splitWith: [], note: "" });
  const [newPerson, setNewPerson] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState(null);

  const color = (name) => {
    if (!data) return COLORS[0];
    const idx = data.people.findIndex(p => p === name);
    return COLORS[idx >= 0 ? idx % COLORS.length : 0];
  };

  const load = useCallback(async (id, silent = false) => {
    try {
      const record = await readBin(id);
      setData(record);
      setError(null);
    } catch (e) {
      if (!silent) setError("Couldn't connect. Check your internet.");
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (newData) => {
    if (!binId) return;
    setSyncing(true);
    try {
      await writeBin(binId, newData);
      setData({ ...newData, lastUpdated: Date.now() });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch {
      setError("Save failed. Try again.");
    } finally {
      setSyncing(false);
    }
  }, [binId]);

  useEffect(() => {
    getBinId().then(id => {
      setBinId(id);
      load(id, false);
    }).catch(() => setError("Couldn't initialize. Check API key."));
  }, [load]);

  useEffect(() => {
    if (!binId) return;
    const interval = setInterval(() => load(binId, true), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [binId, load]);

  const joinTrip = () => {
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem("trip-my-name", n);
    setMyName(n);
    if (data && !data.people.includes(n)) {
      save({ ...data, people: [...data.people, n] });
    }
  };

  const addPerson = () => {
    const n = newPerson.trim();
    if (!n || !data || data.people.includes(n)) return;
    save({ ...data, people: [...data.people, n] });
    setNewPerson("");
  };

  const removePerson = (name) => {
    if (!data) return;
    save({
      ...data,
      people: data.people.filter(p => p !== name),
      expenses: data.expenses
        .filter(e => e.paidBy !== name)
        .map(e => ({ ...e, splitWith: e.splitWith.filter(p => p !== name) })),
    });
    if (myName === name) {
      setMyName("");
      localStorage.removeItem("trip-my-name");
    }
  };

  const openForm = (exp = null) => {
    if (!data) return;
    if (exp) {
      setForm({ desc: exp.desc, amount: exp.amount, paidBy: exp.paidBy, splitWith: [...exp.splitWith], note: exp.note || "" });
      setEditId(exp.id);
    } else {
      setForm({ desc: "", amount: "", paidBy: myName || data.people[0] || "", splitWith: [...data.people], note: "" });
      setEditId(null);
    }
    setShowForm(true);
  };

  const saveExpense = () => {
    if (!form.desc || !form.amount || !form.paidBy || form.splitWith.length === 0 || !data) return;
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) return;
    const newExpenses = editId
      ? data.expenses.map(e => e.id === editId ? { ...e, ...form, amount: amt, editedAt: tsNow() } : e)
      : [...data.expenses, { id: Date.now().toString(), ...form, amount: amt, addedBy: myName, addedAt: tsNow() }];
    save({ ...data, expenses: newExpenses });
    setShowForm(false);
  };

  const deleteExpense = (id) => {
    if (!data) return;
    save({ ...data, expenses: data.expenses.filter(e => e.id !== id) });
    setConfirmDelete(null);
  };

  const toggleSplit = (name) => {
    setForm(f => ({
      ...f,
      splitWith: f.splitWith.includes(name) ? f.splitWith.filter(p => p !== name) : [...f.splitWith, name],
    }));
  };

  const resetTrip = () => {
    save(defaultData());
    setMyName("");
    localStorage.removeItem("trip-my-name");
  };

  const balances = useMemo(() => {
    if (!data) return {};
    const bal = {};
    data.people.forEach(p => bal[p] = 0);
    data.expenses.forEach(({ amount, paidBy, splitWith }) => {
      if (!splitWith.length) return;
      const share = amount / splitWith.length;
      splitWith.forEach(p => { if (bal[p] !== undefined) bal[p] -= share; });
      if (bal[paidBy] !== undefined) bal[paidBy] += amount;
    });
    return bal;
  }, [data]);

  const settlements = useMemo(() => {
    const d = [], c = [];
    Object.entries(balances).forEach(([name, bal]) => {
      if (bal < -0.01) d.push({ name, amount: -bal });
      else if (bal > 0.01) c.push({ name, amount: bal });
    });
    d.sort((a, b) => b.amount - a.amount);
    c.sort((a, b) => b.amount - a.amount);
    const txns = [], dd = d.map(x => ({ ...x })), cc = c.map(x => ({ ...x }));
    let i = 0, j = 0;
    while (i < dd.length && j < cc.length) {
      const amt = Math.min(dd[i].amount, cc[j].amount);
      txns.push({ from: dd[i].name, to: cc[j].name, amount: amt });
      dd[i].amount -= amt; cc[j].amount -= amt;
      if (dd[i].amount < 0.01) i++;
      if (cc[j].amount < 0.01) j++;
    }
    return txns;
  }, [balances]);

  const totalSpent = data ? data.expenses.reduce((s, e) => s + e.amount, 0) : 0;

  const inputStyle = {
    width: "100%", marginTop: 6, background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
    padding: "11px 13px", color: "#fff", fontSize: 15,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  // LOADING
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a14", color: "#fff", fontFamily: "Georgia, serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✈️</div>
        <div style={{ color: "#555" }}>Loading trip...</div>
      </div>
    </div>
  );

  // ERROR
  if (error && !data) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a14", color: "#fff", fontFamily: "Georgia, serif", padding: 20 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "#e94560", fontSize: 16 }}>{error}</div>
        <button onClick={() => binId && load(binId)} style={{ marginTop: 16, background: "#e94560", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>Retry</button>
      </div>
    </div>
  );

  // JOIN SCREEN
  if (!myName) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0a0a14 0%, #111827 60%, #0d1f2d 100%)", fontFamily: "Georgia, serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✈️</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Trip Splitter</div>
        <div style={{ fontSize: 13, color: "#e94560", letterSpacing: 3, textTransform: "uppercase", marginBottom: 32 }}>Live · Shared · Free</div>
        {data && data.people.length > 0 && (
          <div style={{ background: "rgba(78,205,196,0.08)", border: "1px solid rgba(78,205,196,0.2)", borderRadius: 12, padding: "14px 16px", marginBottom: 20, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "#4ECDC4", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Active Trip · {data.people.length} travelers</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.people.map(p => (
                <span key={p} style={{ fontSize: 13, padding: "4px 10px", borderRadius: 20, background: `${color(p)}22`, color: color(p), fontWeight: 600 }}>{p}</span>
              ))}
            </div>
          </div>
        )}
        <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && joinTrip()} placeholder="Enter your name to join..." style={{ ...inputStyle, textAlign: "center", marginBottom: 10 }} />
        <button onClick={joinTrip} style={{ width: "100%", padding: 14, background: "linear-gradient(135deg, #e94560, #c62a47)", border: "none", borderRadius: 10, color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
          {data && data.people.includes(nameInput.trim()) ? "Rejoin Trip" : "Join Trip"}
        </button>
        <div style={{ marginTop: 16, fontSize: 12, color: "#333", lineHeight: 1.7 }}>Share this URL with your group.<br />Everyone sees the same live data.</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a14 0%, #111827 60%, #0d1f2d 100%)", fontFamily: "Georgia, serif", color: "#e8e0d0" }}>
      {/* Header */}
      <div style={{ background: "rgba(10,10,20,0.95)", borderBottom: "1px solid rgba(233,69,96,0.3)", padding: "14px 16px", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>✈️</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Trip Splitter</div>
                <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>
                  {syncing ? "⟳ Syncing..." : justSaved ? "✓ Saved" : `● Live · ${data.people.length} travelers`}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#4ECDC4" }}>{fmt(totalSpent)}</div>
                <div style={{ fontSize: 10, color: "#555" }}>total spent</div>
              </div>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${color(myName)}33`, border: `2px solid ${color(myName)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: color(myName) }}>{myName[0]?.toUpperCase()}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["expenses","people","settle"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 7, background: tab === t ? "#e94560" : "rgba(255,255,255,0.05)", color: tab === t ? "#fff" : "#666", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.8 }}>
                {t === "expenses" ? "💳 Expenses" : t === "people" ? "👥 People" : "⚡ Settle"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 14px 100px" }}>

        {/* EXPENSES TAB */}
        {tab === "expenses" && (
          <div>
            {data.people.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 20px", background: "rgba(233,69,96,0.06)", border: "1px solid rgba(233,69,96,0.15)", borderRadius: 10, marginBottom: 14, color: "#e94560", fontSize: 13 }}>
                Go to 👥 People first and add your group
              </div>
            )}
            {data.expenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: "#444" }}>
                <div style={{ fontSize: 44 }}>🧾</div>
                <div style={{ fontSize: 15, marginTop: 10, color: "#555" }}>No expenses yet</div>
              </div>
            ) : [...data.expenses].reverse().map(exp => {
              const share = exp.splitWith.length ? exp.amount / exp.splitWith.length : 0;
              return (
                <div key={exp.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderLeft: `3px solid ${color(exp.paidBy)}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>{exp.desc}</div>
                      {exp.note && <div style={{ fontSize: 12, color: "#666", marginTop: 2, fontStyle: "italic" }}>{exp.note}</div>}
                      <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                        <span style={{ color: color(exp.paidBy) }}>{exp.paidBy}</span>{" paid · "}{exp.splitWith.length} ways · {fmt(share)}/person
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                        {exp.splitWith.map(p => (
                          <span key={p} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, background: `${color(p)}1a`, color: color(p), fontWeight: 600 }}>{p}</span>
                        ))}
                      </div>
                      {exp.addedAt && <div style={{ fontSize: 10, color: "#333", marginTop: 5 }}>Added by {exp.addedBy || "?"} · {exp.addedAt}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 19, fontWeight: 700, color: "#4ECDC4" }}>{fmt(exp.amount)}</div>
                      {confirmDelete !== exp.id ? (
                        <div style={{ display: "flex", gap: 5, marginTop: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => openForm(exp)} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#999", borderRadius: 5, padding: "4px 7px", cursor: "pointer", fontSize: 11 }}>✏️</button>
                          <button onClick={() => setConfirmDelete(exp.id)} style={{ background: "rgba(233,69,96,0.1)", border: "none", color: "#e94560", borderRadius: 5, padding: "4px 7px", cursor: "pointer", fontSize: 11 }}>🗑</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 5, marginTop: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => deleteExpense(exp.id)} style={{ background: "#e94560", border: "none", color: "#fff", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Delete</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#888", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>Cancel</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PEOPLE TAB */}
        {tab === "people" && (
          <div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Add Traveler</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newPerson} onChange={e => setNewPerson(e.target.value)} onKeyDown={e => e.key === "Enter" && addPerson()} placeholder="Name..." style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none" }} />
                <button onClick={addPerson} style={{ background: "#e94560", border: "none", color: "#fff", borderRadius: 8, padding: "10px 16px", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Add</button>
              </div>
            </div>
            {data.people.map(p => (
              <div key={p} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderLeft: `3px solid ${color(p)}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${color(p)}22`, border: `2px solid ${color(p)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: color(p) }}>{p[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{p} {p === myName && <span style={{ fontSize: 10, color: "#555" }}>(you)</span>}</div>
                    <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{data.expenses.filter(e => e.paidBy === p).length} expenses paid</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: (balances[p] || 0) >= 0 ? "#4ECDC4" : "#e94560" }}>
                      {(balances[p] || 0) >= 0 ? "+" : "-"}{fmt(balances[p] || 0)}
                    </div>
                    <div style={{ fontSize: 10, color: "#444" }}>{(balances[p] || 0) >= 0 ? "gets back" : "owes"}</div>
                  </div>
                  <button onClick={() => removePerson(p)} style={{ background: "rgba(233,69,96,0.1)", border: "none", color: "#e94560", borderRadius: 6, padding: "5px 9px", cursor: "pointer", fontSize: 13 }}>✕</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16 }}>
              <button onClick={() => { if (window.confirm("Reset the entire trip? This deletes everything.")) resetTrip(); }} style={{ width: "100%", padding: 11, background: "rgba(233,69,96,0.08)", border: "1px solid rgba(233,69,96,0.2)", borderRadius: 9, color: "#e94560", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                🗑 Reset Entire Trip
              </button>
            </div>
          </div>
        )}

        {/* SETTLE TAB */}
        {tab === "settle" && (
          <div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Balances</div>
              {data.people.map(p => (
                <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${color(p)}22`, border: `2px solid ${color(p)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: color(p), flexShrink: 0 }}>{p[0].toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "#ccc" }}>{p}{p === myName ? " (you)" : ""}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: (balances[p] || 0) >= 0 ? "#4ECDC4" : "#e94560" }}>
                        {(balances[p] || 0) >= 0 ? "+" : ""}{(balances[p] || 0).toFixed(2)}
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,0.05)" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, (Math.abs(balances[p] || 0) / (totalSpent / (data.people.length || 1) || 1)) * 50)}%`, background: (balances[p] || 0) >= 0 ? "#4ECDC4" : "#e94560", borderRadius: 3 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Suggested Payments</div>
            {settlements.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 20px", background: "rgba(78,205,196,0.06)", border: "1px solid rgba(78,205,196,0.15)", borderRadius: 10, color: "#4ECDC4" }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>All settled up!</div>
              </div>
            ) : settlements.map((s, i) => (
              <div key={i} style={{ background: s.from === myName ? "rgba(233,69,96,0.07)" : s.to === myName ? "rgba(78,205,196,0.07)" : "rgba(255,255,255,0.03)", border: s.from === myName ? "1px solid rgba(233,69,96,0.2)" : s.to === myName ? "1px solid rgba(78,205,196,0.2)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${color(s.from)}22`, border: `2px solid ${color(s.from)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: color(s.from) }}>{s.from[0]}</div>
                <div style={{ flex: 1, fontSize: 14 }}>
                  <span style={{ color: color(s.from), fontWeight: 600 }}>{s.from === myName ? "You" : s.from}</span>
                  <span style={{ color: "#444", margin: "0 6px" }}>→</span>
                  <span style={{ color: color(s.to), fontWeight: 600 }}>{s.to === myName ? "You" : s.to}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: s.from === myName ? "#e94560" : "#4ECDC4", background: s.from === myName ? "rgba(233,69,96,0.1)" : "rgba(78,205,196,0.1)", padding: "4px 10px", borderRadius: 20 }}>{fmt(s.amount)}</div>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${color(s.to)}22`, border: `2px solid ${color(s.to)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: color(s.to) }}>{s.to[0]}</div>
              </div>
            ))}

            {myName && balances[myName] !== undefined && (
              <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, fontSize: 13 }}>
                <span style={{ color: "#555" }}>Your balance: </span>
                <span style={{ fontWeight: 700, color: (balances[myName] || 0) >= 0 ? "#4ECDC4" : "#e94560" }}>
                  {(balances[myName] || 0) >= 0 ? `You're owed ${fmt(balances[myName])}` : `You owe ${fmt(balances[myName])}`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      {tab === "expenses" && data.people.length > 0 && (
        <button onClick={() => openForm()} style={{ position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #e94560, #c62a47)", border: "none", color: "#fff", fontSize: 26, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(233,69,96,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>+</button>
      )}

      {/* MODAL */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", zIndex: 300, backdropFilter: "blur(6px)" }} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{ background: "linear-gradient(180deg, #141420, #0a0a14)", border: "1px solid rgba(255,255,255,0.08)", borderTop: "2px solid #e94560", borderRadius: "18px 18px 0 0", padding: "22px 18px 40px", width: "100%", maxWidth: 640, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>{editId ? "Edit Expense" : "Add Expense"}</div>
              <button onClick={() => setShowForm(false)} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#888", fontSize: 18, cursor: "pointer", borderRadius: 6, padding: "4px 9px" }}>✕</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Description</label>
              <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Hotel, Dinner, Gas..." style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Amount ($)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Note (optional)</label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Any extra detail..." style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Paid By</label>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7 }}>
                {data.people.map(p => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, paidBy: p }))} style={{ padding: "7px 13px", borderRadius: 20, border: `2px solid ${form.paidBy === p ? color(p) : "rgba(255,255,255,0.08)"}`, background: form.paidBy === p ? `${color(p)}1a` : "rgba(255,255,255,0.03)", color: form.paidBy === p ? color(p) : "#666", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Split With</label>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7 }}>
                {data.people.map(p => (
                  <button key={p} onClick={() => toggleSplit(p)} style={{ padding: "7px 13px", borderRadius: 20, border: `2px solid ${form.splitWith.includes(p) ? color(p) : "rgba(255,255,255,0.08)"}`, background: form.splitWith.includes(p) ? `${color(p)}1a` : "rgba(255,255,255,0.03)", color: form.splitWith.includes(p) ? color(p) : "#666", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{form.splitWith.includes(p) ? "✓ " : ""}{p}</button>
                ))}
              </div>
              {form.splitWith.length > 0 && form.amount && (
                <div style={{ fontSize: 11, color: "#444", marginTop: 7 }}>{fmt(parseFloat(form.amount) / form.splitWith.length)} per person</div>
              )}
            </div>
            <button onClick={saveExpense} style={{ width: "100%", padding: 13, background: "linear-gradient(135deg, #e94560, #c62a47)", border: "none", borderRadius: 9, color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
              {editId ? "Save Changes" : "Add Expense"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
