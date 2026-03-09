import { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const PARTIES = {
  NDP: { label: "BC NDP",           color: "#F4821F", short: "NDP" },
  CON: { label: "BC Conservatives", color: "#1A5FB4", short: "CON" },
  GRN: { label: "BC Greens",        color: "#3D9970", short: "GRN" },
  OTH: { label: "Other",            color: "#94a3b8", short: "OTH" },
};

const SEED_POLLS = [
  { date: "2024-10-19", firm: "Election Result",    NDP: 46.4, CON: 43.6, GRN: 8.4,  OTH: 1.6,  n: null, method: "actual",    url: "" },
  { date: "2024-11-15", firm: "Research Co.",        NDP: 43,   CON: 41,   GRN: 10,   OTH: 6,    n: 800,  method: "online",    url: "" },
  { date: "2024-12-10", firm: "Angus Reid",          NDP: 44,   CON: 39,   GRN: 10,   OTH: 7,    n: 1047, method: "online",    url: "" },
  { date: "2025-01-20", firm: "Leger",               NDP: 46,   CON: 37,   GRN: 10,   OTH: 7,    n: 1000, method: "online",    url: "" },
  { date: "2025-02-18", firm: "Pallas Data",         NDP: 49,   CON: 41,   GRN: 8,    OTH: 2,    n: 900,  method: "IVR",       url: "https://pallas-data.ca/2025/02/18/" },
  { date: "2025-03-21", firm: "Ipsos",               NDP: 47,   CON: 35,   GRN: 11,   OTH: 7,    n: 900,  method: "online",    url: "" },
  { date: "2025-04-10", firm: "Angus Reid",          NDP: 46,   CON: 36,   GRN: 11,   OTH: 7,    n: 1050, method: "online",    url: "" },
  { date: "2025-05-04", firm: "Liaison Strategies",  NDP: 45,   CON: 47,   GRN: 7,    OTH: 1,    n: 800,  method: "IVR",       url: "https://press.liaisonstrategies.ca/bc-conservatives-lead-ndp-47-to-45/" },
  { date: "2025-05-22", firm: "Mainstreet Research", NDP: 42,   CON: 40,   GRN: 9,    OTH: 9,    n: 1200, method: "IVR",       url: "" },
  { date: "2025-08-05", firm: "Ipsos",               NDP: 46,   CON: 41,   GRN: 10,   OTH: 3,    n: 900,  method: "online",    url: "" },
  { date: "2025-10-07", firm: "Cardinal Research",   NDP: 34,   CON: 33,   GRN: 8,    OTH: 5,    n: 1088, method: "IVR",       url: "" },
  { date: "2025-12-13", firm: "Pallas Data",         NDP: 44,   CON: 39,   GRN: 9,    OTH: 8,    n: 923,  method: "IVR",       url: "https://pallas-data.ca/2025/12/22/" },
  { date: "2025-12-22", firm: "Mainstreet Research", NDP: 44,   CON: 38,   GRN: 10,   OTH: 8,    n: 1100, method: "IVR",       url: "" },
  { date: "2026-01-14", firm: "Angus Reid",          NDP: 44,   CON: 38,   GRN: 11,   OTH: 7,    n: 1035, method: "online",    url: "" },
  { date: "2026-02-03", firm: "Leger",               NDP: 44,   CON: 38,   GRN: 11,   OTH: 7,    n: 1003, method: "online",    url: "" },
  { date: "2026-02-13", firm: "Pallas Data",         NDP: 42,   CON: 37,   GRN: 13,   OTH: 8,    n: 988,  method: "IVR",       url: "https://pallas-data.ca/2026/02/19/" },
  { date: "2026-02-26", firm: "Pallas Data",         NDP: 42,   CON: 40,   GRN: 11,   OTH: 7,    n: 1256, method: "IVR",       url: "https://pallas-data.ca/2026/03/02/" },
];

function getAverage(polls, party) {
  const recent = polls.filter(p => p.method !== "actual").slice(-5);
  if (!recent.length) return "—";
  return (recent.reduce((a, p) => a + (p[party] || 0), 0) / recent.length).toFixed(1);
}
function formatDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}
const METHOD_STYLE = {
  online:    { label: "Online",   bg: "#0f2a44", c: "#60a5fa" },
  IVR:       { label: "IVR",      bg: "#2d1a4a", c: "#c084fc" },
  aggregate: { label: "Model",    bg: "#0f2d22", c: "#4ade80" },
  actual:    { label: "Election", bg: "#3a1a0a", c: "#fb923c" },
  telephone: { label: "Phone",    bg: "#1a2a0f", c: "#a3e635" },
  mixed:     { label: "Mixed",    bg: "#1a1a2d", c: "#818cf8" },
};
function MethodBadge({ method }) {
  const s = METHOD_STYLE[method] || { label: method, bg: "#222", c: "#aaa" };
  return <span style={{ background: s.bg, color: s.c, borderRadius: 4, fontSize: 11, padding: "2px 7px", fontFamily: "monospace", letterSpacing: 1, border: `1px solid ${s.c}44`, whiteSpace: "nowrap" }}>{s.label}</span>;
}
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: "#0c1520", border: "1px solid #2a3a4a", borderRadius: 8, padding: "12px 16px", fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#94a3b8", fontSize: 12 }}>{d?.firm}</div>
      <div style={{ color: "#4a6a8a", fontSize: 11, marginBottom: 8 }}>{d?.fullDate}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{PARTIES[p.dataKey]?.label}:</span>
          <span style={{ fontWeight: 700, color: "#f8fafc" }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

export default function App() {
  const [polls, setPolls] = useState(SEED_POLLS);
  const [loading, setLoading] = useState(true);
  const [activeParties, setActiveParties] = useState({ NDP: true, CON: true, GRN: true, OTH: false });
  const [sortDesc, setSortDesc] = useState(true);
  const [filterFirm, setFilterFirm] = useState("All");

  useEffect(() => {
    fetch("/polls.json")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data) && data.length > 0) setPolls(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const firms = useMemo(() => ["All", ...Array.from(new Set(polls.map(p => p.firm)))], [polls]);
  const filtered = useMemo(() => {
    let p = filterFirm === "All" ? polls : polls.filter(p => p.firm === filterFirm);
    return sortDesc ? [...p].reverse() : p;
  }, [polls, filterFirm, sortDesc]);

  const recentPolls = polls.filter(p => p.method !== "actual");
  const avgNDP = getAverage(recentPolls, "NDP");
  const avgCON = getAverage(recentPolls, "CON");
  const avgGRN = getAverage(recentPolls, "GRN");

  const chartData = useMemo(() => polls.map(p => ({
    date: new Date(p.date + "T00:00:00").toLocaleDateString("en-CA", { month: "short", year: "2-digit" }),
    fullDate: formatDate(p.date), firm: p.firm,
    isElection: p.method === "actual",
    NDP: p.NDP, CON: p.CON, GRN: p.GRN, OTH: p.OTH,
  })), [polls]);

  const electionTick = chartData.find(d => d.isElection)?.date;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #06101a 0%, #0c1a2e 50%, #06101a 100%)", color: "#e2e8f0", fontFamily: "'Georgia', serif" }}>
      <div style={{ borderBottom: "1px solid #162840", padding: "28px 40px 20px", background: "linear-gradient(to bottom, #091624 0%, transparent 100%)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 4, color: "#3a7bc8", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 5 }}>British Columbia · Provincial Politics</div>
              <h1 style={{ margin: 0, fontSize: "clamp(26px,5vw,42px)", fontWeight: 900, letterSpacing: -1, color: "#f8fafc", lineHeight: 1.1 }}>BC Poll Tracker</h1>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: "#3a7bc8", fontFamily: "monospace" }}>
              {loading ? <span style={{ color: "#4a6a8a" }}>Fetching…</span> : <>
                <div>Last updated</div>
                <div style={{ fontSize: 13, color: "#60a5fa", fontWeight: 700 }}>{formatDate(polls[polls.length - 1]?.date || "")}</div>
              </>}
            </div>
          </div>
          <p style={{ margin: 0, color: "#475569", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
            Aggregating polls from 9 firms · auto-updated daily
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 40px" }}>
        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 36 }}>
          {[
            { party: "NDP", avg: avgNDP, delta: (avgNDP - 46.4).toFixed(1) },
            { party: "CON", avg: avgCON, delta: (avgCON - 43.6).toFixed(1) },
            { party: "GRN", avg: avgGRN, delta: (avgGRN - 8.4).toFixed(1) },
          ].map(({ party, avg, delta }) => {
            const p = PARTIES[party]; const up = parseFloat(delta) >= 0;
            return (
              <div key={party} style={{ background: `linear-gradient(135deg,${p.color}12 0%,#0c1520 100%)`, border: `1px solid ${p.color}30`, borderRadius: 12, padding: "18px 22px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: `radial-gradient(circle at top right,${p.color}1a 0%,transparent 70%)` }} />
                <div style={{ fontSize: 10, letterSpacing: 3, color: p.color, fontFamily: "monospace", textTransform: "uppercase", marginBottom: 3 }}>{p.label}</div>
                <div style={{ fontSize: 44, fontWeight: 900, color: "#f8fafc", lineHeight: 1, marginBottom: 6 }}>{avg}<span style={{ fontSize: 18, color: "#475569" }}>%</span></div>
                <div style={{ fontSize: 11, color: up ? "#22c55e" : "#ef4444", fontFamily: "monospace" }}>{up ? "▲" : "▼"} {Math.abs(delta)}% vs. 2024 result</div>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div style={{ background: "#0a1520", border: "1px solid #162840", borderRadius: 16, padding: "24px 20px 12px", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#64748b", fontFamily: "system-ui, sans-serif" }}>Voting Intentions, 2024–2026</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(PARTIES).map(([key, val]) => (
                <button key={key} onClick={() => setActiveParties(prev => ({ ...prev, [key]: !prev[key] }))} style={{ display: "flex", alignItems: "center", gap: 5, background: activeParties[key] ? `${val.color}1a` : "#0c1520", border: `1px solid ${activeParties[key] ? val.color : "#1e3a5a"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: activeParties[key] ? val.color : "#334155", fontSize: 11, fontFamily: "monospace", transition: "all .15s" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: activeParties[key] ? val.color : "#334155" }} />
                  {val.short}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#162840" />
              <XAxis dataKey="date" tick={{ fill: "#334155", fontSize: 10, fontFamily: "monospace" }} />
              <YAxis domain={[0, 60]} tick={{ fill: "#334155", fontSize: 10, fontFamily: "monospace" }} />
              <Tooltip content={<CustomTooltip />} />
              {electionTick && <ReferenceLine x={electionTick} stroke="#F4821F" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "Election", fill: "#F4821F", fontSize: 9, fontFamily: "monospace" }} />}
              {Object.entries(PARTIES).map(([key, val]) => activeParties[key] ? <Line key={key} type="monotone" dataKey={key} stroke={val.color} strokeWidth={2.5} dot={{ r: 3, fill: val.color }} activeDot={{ r: 5 }} connectNulls /> : null)}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div style={{ background: "#0a1520", border: "1px solid #162840", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #162840", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#64748b", fontFamily: "system-ui, sans-serif", marginRight: "auto" }}>
              All Polls <span style={{ fontSize: 11, color: "#334155", fontWeight: 400 }}>({polls.length})</span>
            </div>
            <select value={filterFirm} onChange={e => setFilterFirm(e.target.value)} style={{ background: "#0c1520", border: "1px solid #1e3a5a", color: "#94a3b8", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>
              {firms.map(f => <option key={f}>{f}</option>)}
            </select>
            <button onClick={() => setSortDesc(v => !v)} style={{ background: "#0c1520", border: "1px solid #1e3a5a", color: "#64748b", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>
              {sortDesc ? "↓ Newest" : "↑ Oldest"}
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #162840" }}>
                  {["Date","Firm","Method","NDP","CON","GRN","OTH","n"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: ["NDP","CON","GRN","OTH","n"].includes(h) ? "center" : "left", color: "#334155", fontWeight: 600, fontFamily: "monospace", letterSpacing: 1, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((poll, i) => (
                  <tr key={i}
                    style={{ borderBottom: "1px solid #0d1a2a", background: poll.method === "actual" ? "#1a0f00" : i % 2 === 0 ? "transparent" : "#0a1218", transition: "background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#111e2e"}
                    onMouseLeave={e => e.currentTarget.style.background = poll.method === "actual" ? "#1a0f00" : i % 2 === 0 ? "transparent" : "#0a1218"}
                  >
                    <td style={{ padding: "9px 14px", color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap", fontSize: 12 }}>{formatDate(poll.date)}</td>
                    <td style={{ padding: "9px 14px", color: "#e2e8f0", fontWeight: 600 }}>
                      {poll.url ? <a href={poll.url} target="_blank" rel="noopener noreferrer" style={{ color: "#e2e8f0", textDecoration: "none" }} onMouseEnter={e => e.target.style.color="#60a5fa"} onMouseLeave={e => e.target.style.color="#e2e8f0"}>{poll.firm}</a> : poll.firm}
                    </td>
                    <td style={{ padding: "9px 14px" }}><MethodBadge method={poll.method} /></td>
                    {["NDP","CON","GRN","OTH"].map(p => (
                      <td key={p} style={{ padding: "9px 14px", textAlign: "center", color: PARTIES[p].color, fontWeight: 700, fontFamily: "monospace" }}>
                        {poll[p] != null ? `${poll[p]}%` : "—"}
                      </td>
                    ))}
                    <td style={{ padding: "9px 14px", textAlign: "center", color: "#334155", fontFamily: "monospace" }}>{poll.n ? poll.n.toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 28, padding: "16px 0", borderTop: "1px solid #162840", fontSize: 11, color: "#1e3a5a", fontFamily: "system-ui, sans-serif", lineHeight: 1.8 }}>
          <span style={{ color: "#334155", fontWeight: 600 }}>Sources:</span> 338Canada · Pallas Data · Liaison Strategies · Leger · Angus Reid · Ipsos · Mainstreet · Research Co. · Cardinal Research<br />
          Rolling average uses the 5 most recent polls. Baseline: 2024 result NDP 46.4%, CON 43.6%, GRN 8.4%. Auto-updated daily via GitHub Actions.
        </div>
      </div>
    </div>
  );
}
