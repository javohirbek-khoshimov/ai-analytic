// utils.js — UTC-safe + helpers
window.Utils = (() => {
  const toDay = (d) => {
    const x = new Date(d);
    const ms = Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
    return new Date(ms).toISOString().slice(0, 10);
  };
  const lastNDaysLabels = (days) => {
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const start = new Date(today); start.setUTCDate(start.getUTCDate() - (days - 1));
    const out = [], cur = new Date(start);
    while (cur.getTime() <= today) { out.push(toDay(cur)); cur.setUTCDate(cur.getUTCDate() + 1); }
    return out;
  };
  const inLastNDays = (iso, days) => {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const start = new Date(today); start.setUTCDate(start.getUTCDate() - (days - 1));
    return d >= start && d <= new Date(today);
  };
  const countBy = (arr, keyFn) => {
    const m = new Map();
    for (const x of arr){ const k = keyFn(x); if(!k && k!==0) continue; m.set(k, (m.get(k)||0)+1); }
    return [...m.entries()].sort((a,b)=>b[1]-a[1]);
  };
  const binAges = (users) => {
    const bins = {'<20':0,'20-40':0,'40-60':0,'60+':0};
    for (const u of users){
      const n = parseInt(String(u.age||'').replace(/[^0-9]/g,''),10);
      if (isNaN(n)) continue;
      if (n<20) bins['<20']++; else if (n<=40) bins['20-40']++; else if (n<=60) bins['40-60']++; else bins['60+']++;
    }
    return bins;
  };
  return { toDay, lastNDaysLabels, inLastNDays, countBy, binAges };
})();