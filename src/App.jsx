import { useState, useMemo, useEffect, useRef } from "react";

// ── VDOT計算（Daniels式） ──────────────────────────────────────────────────────
function calcVDOT(distM, timeSec) {
  const v = distM / (timeSec / 60);
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * (timeSec / 60)) + 0.2989558 * Math.exp(-0.1932605 * (timeSec / 60));
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  return Math.round((vo2 / pct) * 10) / 10;
}

function getTrainingPaces(vdot) {
  const vMax = 29.54 + 5.000663 * vdot - 0.007546 * vdot * vdot;
  const spk = (p) => Math.round(60000 / (vMax * p));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return {
    easy: `${fmt(spk(0.65))}〜${fmt(spk(0.74))}`,
    marathon: fmt(spk(0.82)),
    threshold: fmt(spk(0.85)),
    interval: fmt(spk(0.975)),
    repetition: fmt(spk(1.1)),
  };
}

// ── 14カテゴリー ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "elem4",  label: "小学4年生",  short: "小4",  color: "#34d399", group: "小学生" },
  { id: "elem5",  label: "小学5年生",  short: "小5",  color: "#10b981", group: "小学生" },
  { id: "elem6",  label: "小学6年生",  short: "小6",  color: "#059669", group: "小学生" },
  { id: "jhs1",   label: "中学1年生",  short: "中1",  color: "#60a5fa", group: "中学生" },
  { id: "jhs2",   label: "中学2年生",  short: "中2",  color: "3b82f6", group: "中学生" },
  { id: "jhs3",   label: "中学3年生",  short: "中3",  color: "#2563eb", group: "中学生" },
  { id: "hs",     label: "高校生",     short: "高校", color: "#a78bfa", group: "高校生" },
  { id: "univ",   label: "大学生",     short: "大学", color: "#c084fc", group: "大学生" },
  { id: "age20s", label: "20歳代",     short: "20代", color: "#f472b6", group: "マスターズ" },
  { id: "age30s", label: "30歳代",     short: "30代", color: "#f97316", group: "マスターズ" },
  { id: "age40s", label: "40歳代",     short: "40代", color: "#ef4444", group: "マスターズ" },
  { id: "age50s", label: "50歳代",     short: "50代", color: "#dc2626", group: "マスターズ" },
  { id: "age60s", label: "60歳代",     short: "60代", color: "#b91c1c", group: "マスターズ" },
  { id: "age70s", label: "70歳代以上", short: "70代", color: "#991b1b", group: "マスターズ" },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const CAT_GROUPS = ["小学生", "中学生", "高校生", "大学生", "マスターズ"];

// ── 種目 ──────────────────────────────────────────────────────────────────────
const DISTANCES = {
  "1000m": 1000, "1500m": 1500, "1マイル": 1609, "3000m": 3000,
  "5000m": 5000, "10000m": 10000, "ハーフマラソン": 21097.5, "マラソン": 42195,
};
const DIST_KEYS = Object.keys(DISTANCES);

// ── ユーティリティ ────────────────────────────────────────────────────────────
const toSec = (h, m, s) => parseInt(h || 0) * 3600 + parseInt(m || 0) * 60 + parseInt(s || 0);
const fmtTime = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};
const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};
const uid = () => Math.random().toString(36).slice(2);
const todayStr = () => new Date().toISOString().slice(0, 10);

const vdotColor = (v) => {
  if (v >= 70) return "#f59e0b";
  if (v >= 60) return "#f97316";
  if (v >= 50) return "#ef4444";
  if (v >= 40) return "#06b6d4";
  return "#6b7280";
};
const vdotRankLabel = (v) => {
  if (v >= 75) return "エリート";
  if (v >= 65) return "上級";
  if (v >= 55) return "中上級";
  if (v >= 45) return "中級";
  if (v >= 35) return "初中級";
  return "ビギナー";
};

// ── localStorage ──────────────────────────────────────────────────────────────
const LS_KEY = "vamosrc_v1";

function loadMembers() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(enrich);
    }
  } catch (e) { /* ignore */ }
  return null;
}

function saveMembers(members) {
  try {
    const toSave = members.map(({ vdot: _v, bestTrial: _b, rank: _r, ...rest }) => rest);
    localStorage.setItem(LS_KEY, JSON.stringify(toSave));
  } catch (e) { /* ignore */ }
}

// ── シードデータ ──────────────────────────────────────────────────────────────
const mkT = (dist, h, m, s, date) => {
  const time = toSec(h, m, s);
  return { id: uid(), distance: dist, time, date, vdot: calcVDOT(DISTANCES[dist], time) };
};
const SEED = [
  { id: 1, name: "田中 健",   category: "age30s", trials: [mkT("マラソン", 3, 12, 0, "2023-04-15"), mkT("マラソン", 3, 5, 30, "2023-10-22"), mkT("ハーフマラソン", 1, 26, 44, "2024-02-11"), mkT("マラソン", 2, 58, 0, "2024-11-03")] },
  { id: 2, name: "佐藤 美咲", category: "age20s", trials: [mkT("10000m", 0, 45, 20, "2023-06-10"), mkT("ハーフマラソン", 1, 35, 0, "2023-09-17"), mkT("ハーフマラソン", 1, 31, 10, "2024-03-03"), mkT("ハーフマラソン", 1, 28, 30, "2024-10-14")] },
  { id: 3, name: "鈴木 拓也", category: "hs",     trials: [mkT("5000m", 0, 19, 30, "2023-05-20"), mkT("5000m", 0, 18, 55, "2023-11-04"), mkT("5000m", 0, 18, 10, "2024-04-27"), mkT("5000m", 0, 17, 45, "2024-09-08")] },
  { id: 4, name: "山田 花子", category: "age40s", trials: [mkT("10000m", 0, 44, 10, "2023-07-01"), mkT("10000m", 0, 42, 55, "2024-01-20"), mkT("10000m", 0, 41, 20, "2024-08-18")] },
  { id: 5, name: "伊藤 誠",   category: "age50s", trials: [mkT("マラソン", 3, 48, 0, "2023-03-12"), mkT("マラソン", 3, 38, 20, "2023-11-26"), mkT("マラソン", 3, 25, 0, "2024-10-06")] },
  { id: 6, name: "中村 蒼",   category: "jhs2",   trials: [mkT("3000m", 0, 10, 20, "2024-05-12"), mkT("3000m", 0, 9, 45, "2024-10-08")] },
  { id: 7, name: "松本 葵",   category: "univ",   trials: [mkT("5000m", 0, 16, 30, "2023-09-02"), mkT("5000m", 0, 15, 55, "2024-03-17"), mkT("10000m", 0, 33, 20, "2024-09-22")] },
  { id: 8, name: "高橋 浩一", category: "age60s", trials: [mkT("マラソン", 4, 10, 0, "2023-06-04"), mkT("マラソン", 3, 58, 30, "2024-04-14")] },
  { id: 9, name: "林 さくら", category: "jhs3",   trials: [mkT("1500m", 0, 5, 10, "2024-06-01"), mkT("3000m", 0, 10, 40, "2024-09-15")] },
  { id: 10, name: "渡辺 大輝", category: "elem6", trials: [mkT("1000m", 0, 3, 45, "2024-05-20"), mkT("1000m", 0, 3, 30, "2024-10-12")] },
];

function enrich(m) {
  if (!m.trials.length) return { ...m, vdot: 0, bestTrial: null };
  const best = m.trials.reduce((a, b) => (b.vdot > a.vdot ? b : a), m.trials[0]);
  return { ...m, vdot: best.vdot, bestTrial: best };
}

// ── アニメーション付き数値 ────────────────────────────────────────────────────
function AnimatedNumber({ value, decimals = 1 }) {
  const [disp, setDisp] = useState(0);
  const raf = useRef(), st = useRef(), from = useRef(0);
  useEffect(() => {
    const target = parseFloat(value), sv = from.current;
    from.current = target; st.current = null; cancelAnimationFrame(raf.current);
    const step = (ts) => {
      if (!st.current) st.current = ts;
      const p = Math.min((ts - st.current) / 800, 1);
      setDisp(sv + (target - sv) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <>{disp.toFixed(decimals)}</>;
}

// ── リップルエフェクト ─────────────────────────────────────────────────────────
function useRipple() {
  const [ripples, setRipples] = useState([]);
  const add = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX || r.left + r.width / 2) - r.left;
    const y = (e.clientY || r.top + r.height / 2) - r.top;
    const id = Date.now();
    setRipples((p) => [...p, { id, x, y }]);
    setTimeout(() => setRipples((p) => p.filter((rr) => rr.id !== id)), 700);
  };
  const render = () => ripples.map((r) => <span key={r.id} className="ripple" style={{ left: r.x, top: r.y }} />);
  return [add, render];
}

// ── 推移グラフ ────────────────────────────────────────────────────────────────
function TrialChart({ trials, color }) {
  if (trials.length < 2) return null;
  const W = Math.max(320, trials.length * 90), CH = 72, PT = 30, PB = 60, TOTAL = PT + CH + PB;
  const vdots = trials.map((t) => t.vdot);
  const minV = Math.min(...vdots) - 1.5, maxV = Math.max(...vdots) + 1.5;
  const cx = (i) => 32 + (i / (trials.length - 1)) * (W - 64);
  const cy = (v) => PT + CH - ((v - minV) / (maxV - minV)) * CH;
  const line = trials.map((t, i) => `${cx(i)},${cy(t.vdot)}`).join(" ");
  const area = `M${cx(0)},${cy(trials[0].vdot)} ` + trials.map((t, i) => `L${cx(i)},${cy(t.vdot)}`).join(" ") + ` L${cx(trials.length - 1)},${PT + CH} L${cx(0)},${PT + CH} Z`;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={TOTAL} viewBox={`0 0 ${W} ${TOTAL}`} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={area} fill="url(#cg)" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />
        {trials.map((t, i) => {
          const x = cx(i), y = cy(t.vdot);
          const dist = t.distance.replace("ハーフマラソン", "HM").replace("マラソン", "フル");
          return (
            <g key={t.id}>
              <circle cx={x} cy={y} r="7" fill="transparent" stroke={color} strokeWidth="1.5" strokeOpacity="0.3" />
              <circle cx={x} cy={y} r="4.5" fill={color} stroke="#0d0d0d" strokeWidth="2" filter="url(#glow)" />
              <text x={x} y={y - 13} textAnchor="middle" fill={color} fontSize="10.5" fontFamily="'Barlow Condensed',sans-serif" fontWeight="700">{t.vdot.toFixed(1)}</text>
              <line x1={x} y1={PT + CH + 4} x2={x} y2={PT + CH + 10} stroke="#333" strokeWidth="1" />
              <text x={x} y={PT + CH + 22} textAnchor="middle" fill="#d0d0e8" fontSize="10.5" fontFamily="'Barlow Condensed',sans-serif" fontWeight="600">{fmtTime(t.time)}</text>
              <text x={x} y={PT + CH + 35} textAnchor="middle" fill="#555" fontSize="9" fontFamily="'Noto Sans JP',sans-serif">{dist}</text>
              <text x={x} y={PT + CH + 50} textAnchor="middle" fill="#3a3a5a" fontSize="9" fontFamily="'Barlow Condensed',sans-serif">{fmtDate(t.date).slice(5)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700;1,900&family=Noto+Sans+JP:wght@300;400;500;700&display=swap');
:root {
  --bg:#0d0d0d; --s1:#141414; --s2:#1a1a1a;
  --b1:#252525; --b2:#2e2e2e;
  --tx:#f0f0f0; --t2:#888; --t3:#444;
  --acc:#ff4d00; --acc2:#ff6b35;
  --r:4px; --rl:8px;
}
.fd { font-family:'Barlow Condensed',sans-serif; }
.fj { font-family:'Noto Sans JP',sans-serif; }
.vn { font-family:'Barlow Condensed',sans-serif; font-weight:900; letter-spacing:-.02em; line-height:1; font-style:italic; }

.card { background:var(--s1); border:1px solid var(--b1); border-radius:var(--rl); position:relative; overflow:hidden; }
.card::before { content:''; position:absolute; inset:0; background:linear-gradient(135deg,rgba(255,255,255,.02) 0%,transparent 60%); pointer-events:none; }

.mc { background:var(--s1); border:1px solid var(--b1); border-radius:var(--rl); cursor:pointer; position:relative; overflow:hidden;
  transition:border-color .25s, transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .25s; -webkit-tap-highlight-color:transparent; }
.mc:hover { border-color:var(--b2); transform:translateY(-3px) scale(1.007); box-shadow:0 16px 40px rgba(0,0,0,.6),0 0 0 1px rgba(255,77,0,.08); }
.mc:active { transform:translateY(-1px) scale(1.002); transition-duration:.08s; }

.btn { display:inline-flex; align-items:center; justify-content:center; border:none; cursor:pointer; font-weight:700;
  letter-spacing:.04em; -webkit-tap-highlight-color:transparent; transition:all .2s; }
.btn-acc { background:var(--acc); color:#fff; border-radius:var(--r); padding:10px 22px; font-size:14px;
  font-family:'Noto Sans JP',sans-serif; position:relative; overflow:hidden; }
.btn-acc::before { content:''; position:absolute; inset:0; background:linear-gradient(135deg,rgba(255,255,255,.15),transparent); pointer-events:none; }
.btn-acc:hover { background:var(--acc2); transform:translateY(-2px); box-shadow:0 8px 24px rgba(255,77,0,.35); }
.btn-acc:active { transform:translateY(0); transition-duration:.08s; }
.btn-ghost { background:transparent; color:var(--t2); border:1px solid var(--b2); border-radius:var(--r); padding:10px 20px;
  font-size:14px; font-family:'Noto Sans JP',sans-serif; }
.btn-ghost:hover { border-color:#555; color:var(--tx); }
.btn-del { background:transparent; color:#ef4444; border:1px solid rgba(239,68,68,.2); border-radius:var(--r); padding:6px 12px;
  font-size:12px; font-family:'Noto Sans JP',sans-serif; font-weight:600; cursor:pointer; transition:all .2s; }
.btn-del:hover { background:rgba(239,68,68,.1); border-color:rgba(239,68,68,.5); }

.tab-bar { display:flex; border-bottom:1px solid var(--b1); overflow-x:auto; -ms-overflow-style:none; scrollbar-width:none; }
.tab-bar::-webkit-scrollbar { display:none; }
.tab-item { background:none; border:none; cursor:pointer; font-family:'Noto Sans JP',sans-serif; font-size:13px; font-weight:700;
  letter-spacing:.04em; color:var(--t3); padding:12px 16px; position:relative; transition:color .2s; white-space:nowrap; flex-shrink:0; }
.tab-item.on { color:var(--tx); }
.tab-item.on::after { content:''; position:absolute; bottom:-1px; left:0; right:0; height:2px; background:var(--acc); }
.tab-item:not(.on):hover { color:var(--t2); }

.inp { background:#0a0a0a; border:1px solid var(--b2); border-radius:var(--r); color:var(--tx); padding:11px 14px; font-size:14px;
  font-family:'Noto Sans JP',sans-serif; width:100%; outline:none; transition:border-color .2s, box-shadow .2s; }
.inp:focus { border-color:var(--acc); box-shadow:0 0 0 3px rgba(255,77,0,.12); }
select.inp option { background:#141414; }

.overlay { position:fixed; inset:0; background:rgba(0,0,0,.82); display:flex; align-items:flex-end; justify-content:center; z-index:300; backdrop-filter:blur(8px); }
@media(min-width:540px) { .overlay { align-items:center; } }
.modal { background:var(--s1); border:1px solid var(--b2); border-radius:12px 12px 0 0; padding:28px 24px 40px;
  width:100%; max-width:480px; max-height:92vh; overflow-y:auto; animation:modalIn .32s cubic-bezier(.34,1.4,.64,1) both; }
@media(min-width:540px) { .modal { border-radius:12px; } }
@keyframes modalIn { from{opacity:0;transform:translateY(32px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }

.trow { display:flex; align-items:center; gap:12px; padding:13px 16px; border-radius:var(--rl); background:var(--s2); border:1px solid var(--b1);
  margin-bottom:8px; transition:border-color .2s, transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .2s; }
.trow:hover { border-color:var(--b2); transform:translateX(4px); box-shadow:0 4px 16px rgba(0,0,0,.4); }
.trow.pb-row { border-color:rgba(245,158,11,.3); background:rgba(245,158,11,.04); }

.bar-bg { height:3px; background:#1e1e1e; border-radius:2px; overflow:hidden; margin-top:12px; }
.bar-fill { height:100%; border-radius:2px; transition:width 1s cubic-bezier(.25,1,.5,1); }

.ripple-host { position:relative; overflow:hidden; }
@keyframes ripple { from{transform:scale(0);opacity:.4} to{transform:scale(4);opacity:0} }
.ripple { position:absolute; border-radius:50%; background:rgba(255,255,255,.14); width:80px; height:80px; margin-left:-40px; margin-top:-40px; animation:ripple .6s ease-out forwards; pointer-events:none; }

@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
.fade-up { animation:fadeUp .35s cubic-bezier(.25,1,.5,1) both; }
@keyframes pageIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
.page-in { animation:pageIn .28s cubic-bezier(.25,1,.5,1) both; }

.cat-pill { font-family:'Noto Sans JP',sans-serif; font-size:10px; font-weight:700; padding:2px 7px; border-radius:3px; }
.cat-btn { background:var(--s2); border:1px solid var(--b2); color:var(--t3); border-radius:var(--r); padding:7px 10px;
  font-family:'Noto Sans JP',sans-serif; font-size:12px; font-weight:600; cursor:pointer; transition:all .2s; text-align:center; }
.cat-btn:hover { border-color:var(--t3); color:var(--t2); }
.cat-btn.sel { border-color:currentColor; }
.cat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(60px,1fr)); gap:6px; }

.site-header { background:rgba(13,13,13,.95); border-bottom:1px solid var(--b1); backdrop-filter:blur(12px); position:sticky; top:0; z-index:50; }

.pace-card { background:var(--s2); border:1px solid var(--b1); border-radius:var(--rl); padding:14px 16px;
  transition:border-color .2s, transform .2s cubic-bezier(.34,1.56,.64,1); }
.pace-card:hover { border-color:var(--b2); transform:translateY(-2px); }

.time-wrap { display:flex; gap:8px; align-items:flex-start; }
.time-field { flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; }
.time-sep { color:var(--b2); font-size:20px; font-weight:300; line-height:1; margin-top:12px; flex-shrink:0; }
.tbox { background:#0a0a0a; border:1px solid var(--b2); border-radius:var(--r); color:var(--tx); padding:11px 6px; font-size:18px;
  font-family:'Barlow Condensed',sans-serif; font-weight:600; text-align:center; outline:none; width:100%; transition:border-color .2s, box-shadow .2s; }
.tbox:focus { border-color:var(--acc); box-shadow:0 0 0 3px rgba(255,77,0,.12); }

.cr-row { display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--rl); background:var(--s2); border:1px solid var(--b1);
  margin-bottom:7px; transition:border-color .2s, transform .25s cubic-bezier(.34,1.56,.64,1); }
.cr-row:hover { border-color:var(--b2); transform:translateX(3px); }
.cr-row.top1 { border-color:rgba(245,158,11,.35); background:rgba(245,158,11,.04); }

.rec-card { background:var(--s2); border:1px solid var(--b1); border-radius:var(--rl); padding:14px 16px;
  transition:border-color .2s, transform .2s cubic-bezier(.34,1.56,.64,1); }
.rec-card:hover { border-color:var(--b2); transform:translateY(-2px); }

@keyframes toastIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
@keyframes toastOut { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(8px)} }
.toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); background:#1e1e1e; border:1px solid #2e2e2e;
  border-radius:20px; padding:9px 20px; font-family:'Noto Sans JP',sans-serif; font-size:13px; font-weight:600;
  color:#aaa; z-index:999; white-space:nowrap; pointer-events:none; }
.toast.in { animation:toastIn .25s ease both; }
.toast.out { animation:toastOut .3s ease both; }
`;

// ── 保存トースト ──────────────────────────────────────────────────────────────
function SaveToast({ show }) {
  const [phase, setPhase] = useState("hidden");
  useEffect(() => {
    if (!show) return;
    setPhase("in");
    const t1 = setTimeout(() => setPhase("out"), 1800);
    const t2 = setTimeout(() => setPhase("hidden"), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [show]);
  if (phase === "hidden") return null;
  return <div className={`toast ${phase}`}>✓ 保存しました</div>;
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [members, setMembers] = useState(() => loadMembers() ?? SEED.map(enrich));
  const [page, setPage] = useState("ranking");
  const [activeId, setActiveId] = useState(null);
  const [mainTab, setMainTab] = useState("ranking");
  const [catTab, setCatTab] = useState("ranking");
  const [selectedCat, setSelectedCat] = useState("age30s");
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddTrial, setShowAddTrial] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saveFlash, setSaveFlash] = useState(0);
  const [mForm, setMF] = useState({ name: "", category: "age30s", distance: "マラソン", h: "", m: "", s: "", date: todayStr() });
  const [tForm, setTF] = useState({ distance: "マラソン", h: "", m: "", s: "", date: todayStr() });

  useEffect(() => { saveMembers(members); }, [members]);

  const sorted = useMemo(() => [...members].sort((a, b) => b.vdot - a.vdot).map((m, i) => ({ ...m, rank: i + 1 })), [members]);
  const activeMember = useMemo(() => sorted.find((m) => m.id === activeId) || null, [sorted, activeId]);
  const catMembers = useMemo(() => sorted.filter((m) => m.category === selectedCat), [sorted, selectedCat]);
  const allTimeByDist = useMemo(() => {
    const map = {};
    members.forEach((m) => m.trials.forEach((t) => {
      if (!map[t.distance] || t.vdot > map[t.distance].vdot)
        map[t.distance] = { ...t, memberName: m.name, category: m.category };
    }));
    return map;
  }, [members]);
  const catRecordsByDist = useMemo(() => {
    const map = {};
    members.filter((m) => m.category === selectedCat).forEach((m) => m.trials.forEach((t) => {
      if (!map[t.distance] || t.vdot > map[t.distance].vdot)
        map[t.distance] = { ...t, memberName: m.name };
    }));
    return map;
  }, [members, selectedCat]);

  const avg = members.length ? (members.reduce((a, b) => a + b.vdot, 0) / members.length).toFixed(1) : "—";
  const max = members.length ? Math.max(...members.map((m) => m.vdot)).toFixed(1) : "—";

  function mutate(fn) { setMembers((prev) => fn(prev)); setSaveFlash((n) => n + 1); }
  function openMember(id) { setActiveId(id); setPage("member"); }
  function goBack() { setPage("ranking"); setActiveId(null); }

  function handleAddMember() {
    const time = toSec(mForm.h, mForm.m, mForm.s);
    if (!mForm.name.trim() || time === 0) return;
    const trial = { id: uid(), distance: mForm.distance, time, date: mForm.date, vdot: calcVDOT(DISTANCES[mForm.distance], time) };
    mutate((prev) => [...prev, enrich({ id: Date.now(), name: mForm.name.trim(), category: mForm.category, trials: [trial] })]);
    setMF({ name: "", category: "age30s", distance: "マラソン", h: "", m: "", s: "", date: todayStr() });
    setShowAddMember(false);
  }
  function handleAddTrial() {
    const time = toSec(tForm.h, tForm.m, tForm.s);
    if (time === 0) return;
    const trial = { id: uid(), distance: tForm.distance, time, date: tForm.date, vdot: calcVDOT(DISTANCES[tForm.distance], time) };
    mutate((prev) => prev.map((m) => m.id !== activeId ? m : enrich({ ...m, trials: [...m.trials, trial].sort((a, b) => a.date.localeCompare(b.date)) })));
    setTF({ distance: "マラソン", h: "", m: "", s: "", date: todayStr() });
    setShowAddTrial(false);
  }
  function handleDeleteTrial(tid) { mutate((prev) => prev.map((m) => m.id !== activeId ? m : enrich({ ...m, trials: m.trials.filter((t) => t.id !== tid) }))); }
  function handleDeleteMember(id) { mutate((prev) => prev.filter((m) => m.id !== id)); goBack(); }
  function handleReset() { mutate(() => SEED.map(enrich)); setShowResetConfirm(false); }

  const selCatObj = CAT_MAP[selectedCat];

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#f0f0f0" }}>
      <style>{CSS}</style>
      <SaveToast show={saveFlash} key={saveFlash} />

      {/* ══ メンバー詳細ページ ══════════════════════════════════════════════ */}
      {page === "member" && activeMember && (
        <MemberPage member={activeMember} onBack={goBack}
          onAddTrial={() => setShowAddTrial(true)}
          onDeleteTrial={handleDeleteTrial}
          onDeleteMember={() => handleDeleteMember(activeMember.id)} />
      )}

      {/* ══ メインページ ════════════════════════════════════════════════════ */}
      {page === "ranking" && (
        <>
          {/* ヘッダー */}
          <header className="site-header">
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span className="vn" style={{ fontSize: 26, color: "#fff", letterSpacing: ".02em" }}>
                    VAMOS<span style={{ color: "var(--acc)" }}>RC</span>
                  </span>
                  <span className="fj" style={{ fontSize: 10, color: "var(--t3)", letterSpacing: ".1em" }}>ランニングクラブ</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-ghost fj" style={{ fontSize: 12, padding: "7px 12px" }} onClick={() => setShowResetConfirm(true)}>リセット</button>
                  <button className="btn btn-acc ripple-host fj" style={{ fontSize: 13, padding: "9px 16px" }} onClick={() => setShowAddMember(true)}>＋ 追加</button>
                </div>
              </div>
            </div>
            {/* タブ */}
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
              <div className="tab-bar">
                <button className={`tab-item fj ${mainTab === "ranking" ? "on" : ""}`} onClick={() => setMainTab("ranking")}>総合ランキング</button>
                <button className={`tab-item fj ${mainTab === "categories" ? "on" : ""}`} onClick={() => setMainTab("categories")}>カテゴリー別</button>
                <button className={`tab-item fj ${mainTab === "records" ? "on" : ""}`} onClick={() => setMainTab("records")}>歴代記録</button>
              </div>
            </div>
          </header>

          {/* 統計バー */}
          <div style={{ borderBottom: "1px solid #1a1a1a", background: "#111" }}>
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px", display: "flex" }}>
              {[{ l: "メンバー", v: `${members.length}名` }, { l: "平均VDOT", v: avg }, { l: "最高VDOT", v: max, accent: true }].map((s, i) => (
                <div key={i} style={{ flex: 1, padding: "12px 0", borderRight: i < 2 ? "1px solid #1a1a1a" : "none", paddingLeft: i > 0 ? 16 : 0 }}>
                  <div className="fj" style={{ fontSize: 9, color: "var(--t3)", letterSpacing: ".08em", marginBottom: 3 }}>{s.l}</div>
                  <div className="vn" style={{ fontSize: 20, color: s.accent ? "var(--acc)" : "#ddd" }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>

            {/* ── 総合ランキング ── */}
            {mainTab === "ranking" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sorted.map((m, idx) => <MemberCard key={m.id} member={m} idx={idx} onClick={() => openMember(m.id)} />)}
                {!members.length && <EmptyState label="メンバーがいません" />}
              </div>
            )}

            {/* ── カテゴリー別 ── */}
            {mainTab === "categories" && (
              <div className="page-in">
                {/* カテゴリー選択 */}
                <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}>
                  {CAT_GROUPS.map((group) => (
                    <div key={group} style={{ marginBottom: 14 }}>
                      <div className="fj" style={{ fontSize: 9, color: "var(--t3)", letterSpacing: ".1em", marginBottom: 8 }}>{group}</div>
                      <div className="cat-grid">
                        {CATEGORIES.filter((c) => c.group === group).map((c) => (
                          <button key={c.id} className={`cat-btn ${selectedCat === c.id ? "sel" : ""}`}
                            style={selectedCat === c.id ? { color: c.color, borderColor: c.color, background: `${c.color}14` } : {}}
                            onClick={() => setSelectedCat(c.id)}>{c.short}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* カテゴリー内サブタブ */}
                <div className="tab-bar" style={{ borderRadius: "var(--rl) var(--rl) 0 0", background: "var(--s1)", border: "1px solid var(--b1)", borderBottom: "none", padding: "0 4px" }}>
                  <button className={`tab-item fj ${catTab === "ranking" ? "on" : ""}`} onClick={() => setCatTab("ranking")}>ランキング</button>
                  <button className={`tab-item fj ${catTab === "records" ? "on" : ""}`} onClick={() => setCatTab("records")}>カテゴリー記録</button>
                </div>

                <div className="card" style={{ borderRadius: "0 0 var(--rl) var(--rl)", padding: "16px" }}>
                  {/* カテゴリーヘッダー */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid var(--b1)" }}>
                    <div style={{ width: 4, height: 36, background: selCatObj.color, borderRadius: 2, flexShrink: 0 }} />
                    <div>
                      <div className="vn" style={{ fontSize: 22, color: selCatObj.color }}>{selCatObj.label}</div>
                      <div className="fj" style={{ fontSize: 11, color: "var(--t3)" }}>
                        {catMembers.length}名 · {Object.keys(catRecordsByDist).length}種目記録あり
                      </div>
                    </div>
                  </div>

                  {/* カテゴリーランキング */}
                  {catTab === "ranking" && (
                    <div>
                      {catMembers.length === 0 && <EmptyState label="このカテゴリーにメンバーがいません" />}
                      {catMembers.map((m, i) => (
                        <div key={m.id} className={`cr-row fade-up ${i === 0 ? "top1" : ""}`}
                          style={{ animationDelay: `${i * 35}ms`, cursor: "pointer" }} onClick={() => openMember(m.id)}>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 15, width: 28, textAlign: "center", flexShrink: 0, color: i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : i === 2 ? "#cd7c32" : "var(--t3)" }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="fj" style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{m.name}</div>
                            <div className="fj" style={{ fontSize: 11, color: "var(--t3)" }}>
                              {m.bestTrial?.distance}&nbsp;<span style={{ color: "var(--t2)" }}>{m.bestTrial ? fmtTime(m.bestTrial.time) : ""}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div className="vn" style={{ fontSize: 28, color: vdotColor(m.vdot) }}>{m.vdot.toFixed(1)}</div>
                            <div className="fj" style={{ fontSize: 9, color: "var(--t3)" }}>VDOT</div>
                          </div>
                          <span style={{ color: "#333", fontSize: 16, flexShrink: 0 }}>›</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* カテゴリー記録 */}
                  {catTab === "records" && (
                    <div>
                      {Object.keys(catRecordsByDist).length === 0 && <EmptyState label="記録がありません" />}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {DIST_KEYS.filter((d) => catRecordsByDist[d]).map((dist, i) => {
                          const rec = catRecordsByDist[dist], c = vdotColor(rec.vdot);
                          return (
                            <div key={dist} className="rec-card fade-up" style={{ animationDelay: `${i * 35}ms` }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <div>
                                  <div className="fj" style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3 }}>{dist}</div>
                                  <div className="fj" style={{ fontWeight: 600, fontSize: 14 }}>{rec.memberName}</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div className="vn" style={{ fontSize: 24, color: c }}>{rec.vdot.toFixed(1)}</div>
                                  <div className="fj" style={{ fontSize: 9, color: "var(--t3)" }}>VDOT</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div className="vn" style={{ fontSize: 20, color: "#ddd" }}>{fmtTime(rec.time)}</div>
                                <div className="fj" style={{ fontSize: 11, color: "var(--t3)" }}>{fmtDate(rec.date)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 歴代記録 ── */}
            {mainTab === "records" && (
              <div className="page-in">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div style={{ width: 3, height: 18, background: "var(--acc)", borderRadius: 2 }} />
                  <span className="fj" style={{ fontSize: 12, color: "var(--t3)" }}>全カテゴリー · 種目別最高VDOT</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {DIST_KEYS.filter((d) => allTimeByDist[d]).map((dist, i) => {
                    const rec = allTimeByDist[dist], c = vdotColor(rec.vdot), cat = CAT_MAP[rec.category];
                    return (
                      <div key={dist} className="card fade-up" style={{ padding: "18px 20px", animationDelay: `${i * 40}ms` }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                          <div>
                            <div className="fj" style={{ fontSize: 10, color: "var(--t3)", marginBottom: 4 }}>{dist}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="fj" style={{ fontWeight: 700, fontSize: 16 }}>{rec.memberName}</span>
                              {cat && <span className="cat-pill" style={{ background: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}28` }}>{cat.short}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div className="vn" style={{ fontSize: 32, color: c, lineHeight: 1 }}>{rec.vdot.toFixed(1)}</div>
                            <div className="fj" style={{ fontSize: 9, color: "var(--t3)" }}>VDOT</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--b1)" }}>
                          <div className="vn" style={{ fontSize: 22, color: "#ddd" }}>{fmtTime(rec.time)}</div>
                          <div className="fj" style={{ fontSize: 11, color: "var(--t3)" }}>{fmtDate(rec.date)}</div>
                        </div>
                        <div className="bar-bg" style={{ marginTop: 10 }}>
                          <div className="bar-fill" style={{ width: `${Math.min(100, ((rec.vdot - 20) / 65) * 100)}%`, background: `linear-gradient(90deg,${c}88,${c})` }} />
                        </div>
                      </div>
                    );
                  })}
                  {!Object.keys(allTimeByDist).length && <EmptyState label="まだ記録がありません" />}
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {/* ══ モーダル：メンバー追加 ════════════════════════════════════════════ */}
      {showAddMember && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowAddMember(false)}>
          <div className="modal">
            <div style={{ marginBottom: 22 }}>
              <div style={{ width: 28, height: 3, background: "var(--acc)", borderRadius: 2, marginBottom: 8 }} />
              <div className="vn" style={{ fontSize: 22, color: "#fff" }}>メンバーを追加</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <FormField label="名前"><input className="inp fj" placeholder="例：田中 健" value={mForm.name} onChange={(e) => setMF((f) => ({ ...f, name: e.target.value }))} /></FormField>
              <FormField label="カテゴリー">
                <div style={{ marginTop: 2 }}>
                  {CAT_GROUPS.map((group) => (
                    <div key={group} style={{ marginBottom: 12 }}>
                      <div className="fj" style={{ fontSize: 9, color: "var(--t3)", marginBottom: 6 }}>{group}</div>
                      <div className="cat-grid">
                        {CATEGORIES.filter((c) => c.group === group).map((c) => (
                          <button key={c.id} className={`cat-btn ${mForm.category === c.id ? "sel" : ""}`}
                            style={mForm.category === c.id ? { color: c.color, borderColor: c.color, background: `${c.color}14` } : {}}
                            onClick={() => setMF((f) => ({ ...f, category: c.id }))}>{c.short}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </FormField>
              <FormField label="種目"><select className="inp fj" value={mForm.distance} onChange={(e) => setMF((f) => ({ ...f, distance: e.target.value }))}>{DIST_KEYS.map((d) => <option key={d}>{d}</option>)}</select></FormField>
              <FormField label="タイム"><TimeInput vals={mForm} onChange={(k, v) => setMF((f) => ({ ...f, [k]: v }))} /></FormField>
              <FormField label="日付"><input className="inp" type="date" value={mForm.date} onChange={(e) => setMF((f) => ({ ...f, date: e.target.value }))} /></FormField>
              <VdotPreview distance={mForm.distance} h={mForm.h} m={mForm.m} s={mForm.s} />
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button className="btn btn-ghost fj" style={{ flex: 1 }} onClick={() => setShowAddMember(false)}>キャンセル</button>
                <button className="btn btn-acc fj" style={{ flex: 2 }} onClick={handleAddMember}>追加する</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ モーダル：記録追加 ════════════════════════════════════════════════ */}
      {showAddTrial && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowAddTrial(false)}>
          <div className="modal">
            <div style={{ marginBottom: 22 }}>
              <div style={{ width: 28, height: 3, background: "var(--acc)", borderRadius: 2, marginBottom: 8 }} />
              <div className="vn" style={{ fontSize: 22, color: "#fff" }}>タイムを記録</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <FormField label="種目"><select className="inp fj" value={tForm.distance} onChange={(e) => setTF((f) => ({ ...f, distance: e.target.value }))}>{DIST_KEYS.map((d) => <option key={d}>{d}</option>)}</select></FormField>
              <FormField label="タイム"><TimeInput vals={tForm} onChange={(k, v) => setTF((f) => ({ ...f, [k]: v }))} /></FormField>
              <FormField label="日付"><input className="inp" type="date" value={tForm.date} onChange={(e) => setTF((f) => ({ ...f, date: e.target.value }))} /></FormField>
              <VdotPreview distance={tForm.distance} h={tForm.h} m={tForm.m} s={tForm.s} />
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button className="btn btn-ghost fj" style={{ flex: 1 }} onClick={() => setShowAddTrial(false)}>キャンセル</button>
                <button className="btn btn-acc fj" style={{ flex: 2 }} onClick={handleAddTrial}>記録する</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ モーダル：リセット確認 ════════════════════════════════════════════ */}
      {showResetConfirm && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowResetConfirm(false)}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ width: 28, height: 3, background: "#ef4444", borderRadius: 2, marginBottom: 8 }} />
              <div className="vn" style={{ fontSize: 20, color: "#fff" }}>データをリセット</div>
            </div>
            <div className="fj" style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.7, marginBottom: 24 }}>
              全データが削除され、サンプルデータに戻ります。この操作は元に戻せません。
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost fj" style={{ flex: 1 }} onClick={() => setShowResetConfirm(false)}>キャンセル</button>
              <button className="btn fj" style={{ flex: 1, background: "#ef4444", color: "#fff", borderRadius: "var(--r)", fontSize: 14, border: "none", cursor: "pointer" }} onClick={handleReset}>リセット</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── メンバー詳細ページ ────────────────────────────────────────────────────────
function MemberPage({ member, onBack, onAddTrial, onDeleteTrial, onDeleteMember }) {
  const [tab, setTab] = useState("history");
  const [addRipple, renderRipples] = useRipple();
  const color = vdotColor(member.vdot), rank = vdotRankLabel(member.vdot), paces = getTrainingPaces(member.vdot), cat = CAT_MAP[member.category];
  const chrono = [...member.trials].sort((a, b) => a.date.localeCompare(b.date));
  const display = [...member.trials].sort((a, b) => b.date.localeCompare(a.date));
  const pbVdot = member.trials.length ? Math.max(...member.trials.map((t) => t.vdot)) : 0;
  const improvement = chrono.length >= 2 ? (chrono[chrono.length - 1].vdot - chrono[0].vdot).toFixed(1) : null;
  const paceItems = [
    { label: "イージー走", sub: "回復・有酸素基盤", val: paces.easy, color: "#22c55e" },
    { label: "マラソンペース", sub: "目標レースペース", val: paces.marathon, color: "#3b82f6" },
    { label: "閾値ペース", sub: "乳酸閾値向上", val: paces.threshold, color: "#f97316" },
    { label: "インターバル", sub: "VO₂max向上", val: paces.interval, color: "#ec4899" },
    { label: "レペティション", sub: "神経系・エコノミー", val: paces.repetition, color: "#a855f7" },
  ];
  return (
    <>
      <header className="site-header">
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, height: 60 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--t2)", cursor: "pointer", fontSize: 28, lineHeight: 1, padding: "0 4px", transition: "color .15s" }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#fff"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--t2)"}>‹</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span className="fj" style={{ fontWeight: 700, fontSize: 17 }}>{member.name}</span>
                {cat && <span className="cat-pill" style={{ background: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}28` }}>{cat.short}</span>}
              </div>
              <div className="fj" style={{ fontSize: 10, color: "var(--t3)" }}>#{member.rank}位 · {rank}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div className="vn" style={{ fontSize: 34, color, lineHeight: 1 }}><AnimatedNumber value={member.vdot} /></div>
              <div className="fj" style={{ fontSize: 9, color: "var(--t3)" }}>VDOT</div>
            </div>
          </div>
          <div className="tab-bar">
            <button className={`tab-item fj ${tab === "history" ? "on" : ""}`} onClick={() => setTab("history")}>記録履歴</button>
            <button className={`tab-item fj ${tab === "paces" ? "on" : ""}`} onClick={() => setTab("paces")}>トレーニングペース</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
        {tab === "history" && (
          <div className="page-in">
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              {[
                { l: "自己ベストVDOT", v: pbVdot.toFixed(1), c: color },
                { l: "記録回数", v: `${member.trials.length}回` },
                improvement !== null ? { l: "通算成長", v: (Number(improvement) > 0 ? "+" : "") + improvement, c: Number(improvement) > 0 ? "#22c55e" : "#ef4444" } : null,
              ].filter(Boolean).map((s, i) => (
                <div key={i} className="card" style={{ flex: 1, padding: "13px 14px" }}>
                  <div className="fj" style={{ fontSize: 9, color: "var(--t3)", marginBottom: 5 }}>{s.l}</div>
                  <div className="vn" style={{ fontSize: 24, color: s.c || "#ddd" }}>{s.v}</div>
                </div>
              ))}
            </div>

            {chrono.length >= 2 && (
              <div className="card" style={{ padding: "20px", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 3, height: 14, background: "var(--acc)", borderRadius: 2 }} />
                  <span className="fj" style={{ fontSize: 11, color: "var(--t3)" }}>VDOT・タイム推移</span>
                </div>
                <TrialChart trials={chrono} color={color} />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button className="btn btn-acc ripple-host fj" style={{ fontSize: 13, padding: "9px 18px" }}
                onClick={(e) => { addRipple(e); onAddTrial(); }}>
                {renderRipples()}＋ タイムを記録
              </button>
            </div>

            {display.map((t, i) => {
              const isPB = t.vdot === pbVdot, tColor = vdotColor(t.vdot);
              return (
                <div key={t.id} className={`trow fade-up ${isPB ? "pb-row" : ""}`} style={{ animationDelay: `${i * 30}ms` }}>
                  <div style={{ flexShrink: 0, minWidth: 78 }}>
                    <div className="fj" style={{ fontSize: 11, color: "var(--t2)" }}>{fmtDate(t.date)}</div>
                    {t.id === display[0].id && <div className="fj" style={{ fontSize: 9, color: "var(--acc)", marginTop: 2 }}>最新</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fj" style={{ fontSize: 10, color: "var(--t3)", marginBottom: 2 }}>{t.distance}</div>
                    <div className="vn" style={{ fontSize: 20, color: "#e0e0e0" }}>{fmtTime(t.time)}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginRight: 6 }}>
                    <div className="vn" style={{ fontSize: 24, color: tColor }}>{t.vdot.toFixed(1)}</div>
                    <div className="fj" style={{ fontSize: 9, color: "var(--t3)" }}>VDOT</div>
                  </div>
                  {isPB && <span className="fj" style={{ fontSize: 10, fontWeight: 700, background: "rgba(245,158,11,.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.25)", borderRadius: 3, padding: "3px 7px", flexShrink: 0 }}>PB</span>}
                  <button className="btn-del" onClick={() => onDeleteTrial(t.id)}>✕</button>
                </div>
              );
            })}
            {!member.trials.length && <EmptyState label="まだ記録がありません" />}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 32 }}>
              <button className="btn-del" onClick={onDeleteMember}>メンバーを削除</button>
            </div>
          </div>
        )}

        {tab === "paces" && (
          <div className="page-in">
            <div className="card" style={{ padding: "24px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="fj" style={{ fontSize: 9, color: "var(--t3)", marginBottom: 6 }}>現在のVDOT</div>
                <div className="vn" style={{ fontSize: 54, color, lineHeight: 1 }}><AnimatedNumber value={member.vdot} /></div>
              </div>
              <div style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 4, padding: "10px 18px" }}>
                <div className="fj" style={{ fontSize: 13, color, fontWeight: 700 }}>{rank}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {paceItems.map((p, i) => (
                <div key={p.label} className="pace-card fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="fj" style={{ fontSize: 9, color: "var(--t3)", marginBottom: 6 }}>{p.label}</div>
                  <div className="vn" style={{ fontSize: 22, color: p.color, marginBottom: 4 }}>
                    {p.val}<span style={{ fontSize: 12, color: "var(--t3)", fontStyle: "normal" }}>/km</span>
                  </div>
                  <div className="fj" style={{ fontSize: 10, color: "var(--t3)" }}>{p.sub}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 3, height: 14, background: "var(--acc)", borderRadius: 2 }} />
                <span className="fj" style={{ fontSize: 11, color: "var(--t3)" }}>ペース活用ガイド</span>
              </div>
              {[
                ["イージー走", "週の60〜70%。有酸素基盤構築。会話できるペース。"],
                ["マラソンペース", "目標ペース。ロング走後半やMLRに活用。"],
                ["閾値ペース", "乳酸閾値向上。20〜30分連続またはクルーズインターバル。"],
                ["インターバル", "VO₂max向上。3〜5分×5本が目安。"],
                ["レペティション", "神経系・エコノミー改善。200〜400m短本数で。"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 14, marginBottom: 10, alignItems: "flex-start" }}>
                  <span className="fj" style={{ fontSize: 11, color: "var(--acc)", minWidth: 100, flexShrink: 0, marginTop: 1, fontWeight: 600 }}>{k}</span>
                  <span className="fj" style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.6 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

// ── メンバーカード ────────────────────────────────────────────────────────────
function MemberCard({ member: m, idx, onClick }) {
  const [addRipple, renderRipples] = useRipple();
  const color = vdotColor(m.vdot), cat = CAT_MAP[m.category];
  const barW = Math.min(100, Math.max(3, ((m.vdot - 20) / 65) * 100));
  return (
    <div className="mc ripple-host fade-up" style={{ padding: "16px 18px", animationDelay: `${idx * 40}ms` }} onClick={(e) => { addRipple(e); onClick(); }}>
      {renderRipples()}
      {m.rank <= 3 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: ["#f59e0b", "#9ca3af", "#cd7c32"][m.rank - 1], borderRadius: "8px 0 0 8px" }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "var(--r)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: m.rank <= 3 ? 15 : 12,
          background: m.rank <= 3 ? ["rgba(245,158,11,.12)", "rgba(156,163,175,.1)", "rgba(205,124,50,.1)"][m.rank - 1] : "rgba(255,255,255,.03)",
          color: m.rank <= 3 ? ["#f59e0b", "#9ca3af", "#cd7c32"][m.rank - 1] : "var(--t3)",
          border: `1px solid ${m.rank <= 3 ? ["rgba(245,158,11,.25)", "rgba(156,163,175,.2)", "rgba(205,124,50,.2)"][m.rank - 1] : "var(--b1)"}`,
        }}>
          {m.rank <= 3 ? ["🥇", "🥈", "🥉"][m.rank - 1] : m.rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span className="fj" style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</span>
            {cat && <span className="cat-pill" style={{ background: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}28` }}>{cat.short}</span>}
          </div>
          <div className="fj" style={{ fontSize: 12, color: "var(--t3)" }}>
            {m.bestTrial?.distance}&nbsp;<span style={{ color: "var(--t2)" }}>{m.bestTrial ? fmtTime(m.bestTrial.time) : ""}</span>
            <span style={{ marginLeft: 12, color: "#333" }}>{m.trials.length}件</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="vn" style={{ fontSize: 30, color }}>{m.vdot.toFixed(1)}</div>
          <div className="fj" style={{ fontSize: 9, color: "var(--t3)" }}>VDOT</div>
        </div>
        <span style={{ color: "#333", fontSize: 18, flexShrink: 0 }}>›</span>
      </div>
      <div className="bar-bg"><div className="bar-fill" style={{ width: `${barW}%`, background: `linear-gradient(90deg,${color}88,${color})` }} /></div>
    </div>
  );
}

// ── 小コンポーネント ──────────────────────────────────────────────────────────
function FormField({ label, children }) {
  return (
    <div>
      <div className="fj" style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}
function TimeInput({ vals, onChange }) {
  return (
    <div className="time-wrap">
      {[["h", "時間"], ["m", "分"], ["s", "秒"]].map(([key, lbl], i) => (
        <div key={key} style={{ display: "contents" }}>
          {i > 0 && <span className="time-sep">:</span>}
          <div className="time-field">
            <input className="tbox" placeholder={key === "h" ? "0" : "00"} maxLength={2}
              value={vals[key]} onChange={(e) => onChange(key, e.target.value.replace(/\D/g, ""))} />
            <span className="fj" style={{ fontSize: 9, color: "var(--t3)" }}>{lbl}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
function VdotPreview({ distance, h, m, s }) {
  const sec = toSec(h, m, s);
  if (!sec) return null;
  const v = calcVDOT(DISTANCES[distance], sec), color = vdotColor(v);
  return (
    <div style={{ background: `${color}0d`, border: `1px solid ${color}25`, borderRadius: 6, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div className="fj" style={{ fontSize: 9, color: "var(--t3)", marginBottom: 2 }}>推定VDOT</div>
        <div className="fj" style={{ fontSize: 11, color: "var(--t2)" }}>{vdotRankLabel(v)}</div>
      </div>
      <div className="vn" style={{ fontSize: 36, color }}>{v.toFixed(1)}</div>
    </div>
  );
}
function EmptyState({ label }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 20px", color: "var(--t3)" }}>
      <div className="vn" style={{ fontSize: 48, color: "#1a1a1a", marginBottom: 10 }}>—</div>
      <div className="fj" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}
