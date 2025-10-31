// app.js — SupaDash (Blue) · ECharts + Supabase + Live Monitoring
// ==============================================================
(function () {
  const Api = window.Api;
  const U   = window.Utils;
  const E   = echarts;

  const rangeSelect = document.getElementById('rangeSelect');
  const refreshBtn  = document.getElementById('refreshBtn');

// --- universal kategoriya aniqlash (fallback uchun, lekin TG-first) ---
function mapToCategory(row) {
  const tgMap = {
    "Reproductive":   "Erkaklar va ayollar jinsiy muammolari",
    "Digestive":      "Oshqozon ichak",
    "Headache":       "Bosh og'rig'i va aylanishi",
    "Dermatology":    "Teri, terlash",
    "ENT":            "Burun, tomoq, quloq",
    "Respiratory":    "O'pka",
    "Allergy":        "Allergiya",
    "Cardio":         "Yurak qon tomirlar va qon bosimi",
    "Joint":          "Bo‘g‘imlar (oyoq, yelka, qo'l, bel)",
    "Finger":         "Barmoq (qo'l va oyoq barmoqlari)",
    "Neurology":      "Asab, stress, uyqu",
    "Dental":         "Tish",
    "Hair":           "Soch va tuklar",
    "Face":           "Yuz (husnbuzar, ugri)",
    "Ophthalmology":  "Ko‘z",
    "Unclear":        "Aniq emas",
    "":               "Aniq emas"
  };

  // 1) TG bo‘lsa – faqat TG mapping
  if (row?._src === "tg") {
    const g = (row.group || "").trim();
    return tgMap[g] || "Aniq emas";
  }

  // 2) boshqa (app…) — hozircha umumiy label
  return "APP – nomalum";
}

  // ------- helpers -------
  const debounce = (fn, ms=500) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const normGender = (g) => {
    const v = (g||'').toString().toLowerCase().trim();
    if (['m','male','erkak','мужской'].includes(v))   return 'Erkak';
    if (['f','female','ayol','женский'].includes(v))  return 'Ayol';
    return 'unknown';
  };
  function getNumericRating(row){
    const v = Number(
      row?.average ?? row?.avg ?? row?.rating ?? row?.stars ?? row?.last_rating ?? row?.lastRating
    );
    if (Number.isFinite(v) && v >= 0 && v <= 5) return v;
    return null;
  }

  const baseGrid = { left: 55, right: 20, top: 20, bottom: 56 };
  const baseAxis = { axisLabel:{ color:'#94a3b8', hideOverlap:true, interval:'auto' } };
  const baseAnim = { animationDuration: 200, animationDurationUpdate: 300 };

  const charts = {};
  const mount = (id, option) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) charts[id].dispose();
    const inst = E.init(el, null, { renderer:'canvas' });
    inst.setOption(option, true);
    charts[id] = inst;
  };

  const areaSeries = (name, data)=>({ name, type:'line', data, smooth:true, areaStyle:{}, symbol:'none' });
  const barSeries  = (name, data, stack=null)=>({ name, type:'bar', data, ...(stack?{stack}: {}) });
  const pieOption  = (title, pairs)=>({
    ...baseAnim,
    title:{text:title,left:'center',textStyle:{color:'#cfe1ff',fontSize:14}},
    tooltip:{trigger:'item'},
    legend:{bottom:0,textStyle:{color:'#cbd5e1'},type:'scroll'},
    series:[{type:'pie',radius:['35%','70%'],avoidLabelOverlap:true,
             data:(pairs||[]).map(([n,v])=>({name:n,value:v}))}]
  });

  // ------- main loader -------
  async function load(silent=false){
    const days = Number(rangeSelect.value);

    const [users, aisumAll, ratings, totalUsers, totalAIMsgs] = await Promise.all([
      Api.fetchUsersAll(),
      Api.fetchAisumAll(),     // APP + TG aralash
      Api.fetchRatingsAll(),
      Api.countUsersExact(),
      Api.countAIMsgExact()
    ]);

    // umumiy aisum (app+tg) — buni barcha grafiklar ishlatadi
    const aisum = (aisumAll||[]).filter(r => r.created_at && U.inLastNDays(r.created_at, days));

    // KPIs
    let votes=0, weighted=0;
    (ratings||[]).forEach(r => { const v=Number(r.rating_all)||0; const a=Number(r.average)||0; votes+=v; weighted+=v*a; });
    const avgRating   = votes ? (weighted/votes).toFixed(2) : '—';
    const activeUsers = new Set(aisum.map(x => x.chat_id)).size;

    document.getElementById('kpiAvgRating')   .textContent = String(avgRating);
    document.getElementById('kpiRatingVotes') .textContent = `${votes} votes`;
    document.getElementById('kpiUsers')       .textContent = String(totalUsers ?? 0);
    document.getElementById('kpiActiveUsers') .textContent = String(activeUsers);
    document.getElementById('kpiActiveRange') .textContent = `last ${days}d`;
    document.getElementById('kpiAIMsgs')      .textContent = String(totalAIMsgs ?? 0);

    // DB-based msg/min (last 60s)
    {
      const now = Date.now();
      const rpmFromDB = (aisum||[]).filter(r=>{
        const t = new Date(r.created_at).getTime();
        return (now - t) <= 60*1000 && r.ai_message && String(r.ai_message).trim()!=='';
      }).length;
      const rpmEl = document.getElementById('kpiRpm');
      if (rpmEl) rpmEl.textContent = String(rpmFromDB);
    }

    // labels
    const labels = U.lastNDaysLabels(days);

    // Users → DAU
    const dauMap = Object.fromEntries(labels.map(d=>[d,new Set()]));
    aisum.forEach(r => { const k = U.toDay(r.created_at); if (k in dauMap) dauMap[k].add(r.chat_id); });
    const dau = labels.map(d => dauMap[d].size);
    mount('u_active_ts', {
      ...baseAnim, tooltip:{trigger:'axis'},
      xAxis:{ type:'category', data:labels, ...baseAxis, axisLabel:{...baseAxis.axisLabel, rotate:45} },
      yAxis:{ type:'value', ...baseAxis },
      grid: baseGrid,
      series:[areaSeries('Active users', dau)]
    });

    // Gender
    const genderPairs = U.countBy(users, u => normGender(u.gender));
    mount('u_gender_pie', pieOption('Gender', genderPairs));

    // Language
    const langPairs = U.countBy(users, u => (u.lan||'unknown'));
    mount('u_lang_pie', pieOption('Language', langPairs));

    // Place top-10
    const placeTop = U.countBy(users, u => (u.place||'unknown')).slice(0,10).reverse();
    mount('u_place_bar', {
      ...baseAnim, tooltip:{},
      grid:{ ...baseGrid, left: 120 },
      xAxis:{ type:'value', ...baseAxis },
      yAxis:{ type:'category', data: placeTop.map(x=>x[0]), ...baseAxis },
      series:[barSeries('Users', placeTop.map(x=>x[1]))]
    });

    // Age groups
    const ages = U.binAges(users); const ageLabels = Object.keys(ages); const ageVals = ageLabels.map(k=>ages[k]);
    mount('u_age_bar', {
      ...baseAnim, tooltip:{}, grid: baseGrid,
      xAxis:{ type:'category', data: ageLabels, ...baseAxis },
      yAxis:{ type:'value', ...baseAxis },
      series:[barSeries('Users', ageVals)]
    });

    // ===================== RATING (SATISFACTION & ENGAGEMENT) =====================
    const ratedUsers   = (ratings||[]).length;
    let totalChats     = 0, totalVotes=0, totalWeighted=0;
    (ratings||[]).forEach(r => {
      const c = Number(r.chat_count)||0;
      const a = Number(r.average)||0;
      const v = Number(r.rating_all)||0;
      totalChats     += c;
      totalVotes     += v;
      totalWeighted  += v*a;
    });
    const avgRatingWeighted = totalVotes ? (totalWeighted/totalVotes) : NaN;

    // Avg chat length / session – faqat aisum'dan
    let avgLen = 0;
    {
      const bySession = new Map();
      for (const row of (aisum || [])) {
        if (!row?.chat_id) continue;
        const hasMsg = row.ai_message && String(row.ai_message).trim() !== '';
        if (!hasMsg) continue;
        const d = new Date(row.created_at);
        const key = `${row.chat_id}__${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
        bySession.set(key, (bySession.get(key) || 0) + 1);
      }
      const lens = [...bySession.values()];
      avgLen = lens.length ? (lens.reduce((a,b)=>a+b,0) / lens.length) : 0;
    }

    // KPI DOM
    const setTxt = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=String(v); };
    setTxt('r_kpi_total_chats', totalChats);
    setTxt('r_kpi_users', ratedUsers);
    setTxt('r_kpi_avg_len', avgLen ? avgLen.toFixed(1) : '—');
    setTxt('r_kpi_avg_rating', isNaN(avgRatingWeighted)?'—':avgRatingWeighted.toFixed(2));

    // Trend (30 kun)
    (()=>{
      const lab30 = U.lastNDaysLabels(30);
      const vals  = lab30.map(_ => isNaN(avgRatingWeighted) ? 0 : +avgRatingWeighted.toFixed(2));
      mount('r_avg_trend', {
        ...baseAnim, tooltip:{trigger:'axis'},
        xAxis:{ type:'category', data:lab30, ...baseAxis, axisLabel:{...baseAxis.axisLabel, rotate:45} },
        yAxis:{ type:'value', min:0, max:5, ...baseAxis }, grid: baseGrid,
        series:[areaSeries('Avg rating', vals)]
      });
    })();

    // Ratings histogram — 1..5
    {
      const vals = (ratings || [])
        .map(r => Number(r?.average))
        .filter(v => Number.isFinite(v) && v > 0);

      const counts = { 1:0, 2:0, 3:0, 4:0, 5:0 };
      vals.forEach(v => {
        let k = Math.round(v);
        if (k < 1) k = 1;
        if (k > 5) k = 5;
        counts[k] += 1;
      });

      const labelsH = ['1','2','3','4','5'];
      const data    = labelsH.map(k => counts[Number(k)]);

      mount('r_hist', {
        ...baseAnim, tooltip:{},
        grid: baseGrid,
        xAxis:{ type:'category', data: labelsH, ...baseAxis, boundaryGap:true },
        yAxis:{ type:'value', ...baseAxis },
        series:[{ name:'Users', type:'bar', data, barMaxWidth: 28 }]
      });
    }

    // Top engaged
    {
      const engaged = [...(ratings||[])].sort((a,b)=>(b.chat_count||0)-(a.chat_count||0)).slice(0,10).reverse();
      mount('r_top_chatters', {
        ...baseAnim, tooltip:{}, grid:{ ...baseGrid, left: 150 },
        xAxis:{ type:'value', ...baseAxis },
        yAxis:{ type:'category', data: engaged.map(r=>r.name||'user'), ...baseAxis },
        series:[barSeries('Chats', engaged.map(r=>r.chat_count||0))]
      });
    }

    // Jadval
    (() => {
      const tbody = document.querySelector('#r_users_table tbody');
      if (!tbody) return;
      const rows = [...(ratings||[])].sort((a,b)=>(b.chat_count||0)-(a.chat_count||0));
      tbody.innerHTML = rows.slice(0,100).map((r,i)=>(
        `<tr style="border-bottom:1px solid rgba(255,255,255,.06)">
           <td style="padding:8px">${i+1}</td>
           <td style="padding:8px">${(r.name||'user')}</td>
           <td style="padding:8px">${r.chat_count||0}</td>
           <td style="padding:8px">${isNaN(r.average)?'—':Number(r.average).toFixed(2)}</td>
         </tr>`
      )).join('');
    })();

    // =================== /RATING ===================

    // AISum → AI messages / day (umumiy)
    const aiPerDay = Object.fromEntries(labels.map(d => [d, 0]));
    (aisum || []).forEach(r => {
      if (r?.ai_message && String(r.ai_message).trim() !== '') {
        const k = U.toDay(r.created_at);
        if (k in aiPerDay) aiPerDay[k] += 1;
      }
    });
    mount('a_msgs_ts', {
      ...baseAnim,
      tooltip:{ trigger:'axis' },
      grid: baseGrid,
      xAxis:{ type:'category', data: labels, ...baseAxis,
              axisLabel:{ ...baseAxis.axisLabel, rotate:45 } },
      yAxis:{ type:'value', ...baseAxis },
      series:[ areaSeries('AI msg/day', labels.map(d => aiPerDay[d])) ]
    });

    // Topic stacked (Top 7) — hamon app+tg
    (()=>{
      const topicRows = (aisum || []).filter(r => r?.topic);
      const topicPairs = U.countBy(topicRows, r => r.topic)
                           .sort((a,b)=>b[1]-a[1])
                           .slice(0,7);
      const keys = topicPairs.map(p => p[0]);

      const perTopicPerDay = new Map(keys.map(k => [k, Object.fromEntries(labels.map(d=>[d,0]))]));
      topicRows.forEach(r => {
        if (!keys.includes(r.topic)) return;
        const d = U.toDay(r.created_at);
        if (d in (perTopicPerDay.get(r.topic) || {})) {
          perTopicPerDay.get(r.topic)[d] += 1;
        }
      });

      const series = keys.map(k => barSeries(k, labels.map(d => perTopicPerDay.get(k)[d]), 'topic'));
      mount('a_topic_stack', {
        ...baseAnim,
        tooltip:{ trigger:'axis' },
        legend:{ bottom:0, textStyle:{ color:'#cbd5e1' }, type:'scroll' },
        grid: baseGrid,
        xAxis:{ type:'category', data: labels, ...baseAxis,
                axisLabel:{ ...baseAxis.axisLabel, rotate:45 } },
        yAxis:{ type:'value', ...baseAxis },
        series
      });
    })();


// --- Kasallik Kategoriyalari (pie; faqat aisum_tgbot) ---
(()=>{
  const catCount = new Map();

  // faqat TG va tanlangan davr ichida
  const tgRows = (aisumAll || [])
    .filter(r => r._src === 'tg')
    .filter(r => r.created_at && U.inLastNDays(r.created_at, days));

  // Supabase dagi group → chiroyli nom
  const gm = {
    "Reproductive":   "Erkaklar va ayollar jinsiy muammolari",
    "Digestive":      "Oshqozon ichak",
    "Headache":       "Bosh og'rig'i va aylanishi",
    "Dermatology":    "Teri, terlash",
    "ENT":            "Burun, tomoq, quloq",
    "Respiratory":    "O'pka",
    "Allergy":        "Allergiya",
    "Cardio":         "Yurak qon tomirlar va qon bosimi",
    "Joint":          "Bo‘g‘imlar (oyoq, yelka, qo'l, bel)",
    "Finger":         "Barmoq (qo'l va oyoq barmoqlari)",
    "Neurology":      "Asab, stress, uyqu",
    "Dental":         "Tish",
    "Hair":           "Soch va tuklar",
    "Face":           "Yuz (husnbuzar, ugri)",
    "Ophthalmology":  "Ko‘z",
    "Unclear":        "Aniq emas"
  };

  tgRows.forEach(r => {
    const raw = (r.group || "").trim();
    if (!raw) return;
    const name = gm[raw] || null;
    if (!name) return;
    catCount.set(name, (catCount.get(name) || 0) + 1);
  });

  const entries = [...catCount.entries()].sort((a,b)=>b[1]-a[1]);

  mount('a_topic_pie', {
    ...baseAnim,
    title:{
      text:'Kasallik Kategoriyalari (TG)',
      left:16,
      top:12,
      textStyle:{ color:'#cfe1ff', fontSize:16 }
    },
    tooltip:{
      trigger:'item',
      backgroundColor:'rgba(15,23,42,0.9)',
      borderColor:'rgba(148,163,184,0.2)',
      borderWidth:1,
      padding:[8,10],
      textStyle:{ color:'#f1f5f9', fontSize:12 },
      formatter: p => `${p.name}<br>${p.value} ta (${p.percent}%)`
    },
    legend:{
      orient:'vertical',
      right:-20,          // ⬅️ yana o‘ngroqqa
      top:'middle',
      type:'scroll',
      height:300,
      itemWidth:14,
      itemHeight:10,
      itemGap:8,
      textStyle:{ color:'#cbd5e1', fontSize:11 },
      pageIconColor:'#94a3b8',
      pageTextStyle:{ color:'#94a3b8' }
    },
    series:[{
      type:'pie',
      radius:['38%','72%'],
      center:['38%','53%'],
      avoidLabelOverlap:true,
      minShowLabelAngle:4,

      // ekranda doimiy label yo‘q
      label:{ show:false },
      labelLine:{ show:false },

      // hoverda faqat bo‘lak kattalashadi, label chiqmaydi
      emphasis:{
        scale:true,
        scaleSize:12,
        label:{ show:false }
      },

      data: entries.map(([name, value]) => ({ name, value }))
    }]
  });
})();
    // Doctor bar (Oilaviy shifokor → Terapevt)
    (()=>{
      function normDoctor(name) {
        if (!name) return null;
        const s = name.toString().trim().toLowerCase();
        if (
          s.includes('oilaviy') ||
          s.includes('oila shifokor') ||
          s.includes('oila shifokori') ||
          s.includes('семейный') ||
          s.includes('uchastk') ||
          s.includes('участков')
        ) {
          return 'Terapevt';
        }
        if (s.includes('terapevt') || s.includes('терапевт')) {
          return 'Terapevt';
        }
        return name.charAt(0).toUpperCase() + name.slice(1);
      }

      const doctorNorm = (aisum || [])
        .filter(r => r?.doctor)
        .map(r => ({ ...r, doctor: normDoctor(r.doctor) }));

      const top = U.countBy(doctorNorm, r => r.doctor)
                    .slice(0,10).reverse();

      mount('a_doctor_bar', {
        ...baseAnim, tooltip:{},
        grid:{ ...baseGrid, left:150 },
        xAxis:{ type:'value', ...baseAxis },
        yAxis:{ type:'category', data: top.map(x=>x[0]), ...baseAxis },
        series:[ barSeries('Messages', top.map(x=>x[1])) ]
      });
    })();

    // Peak hours (UTC)
    (()=>{
      const hours = Array.from({length:24}, (_,h)=>h);
      const cnt = Array(24).fill(0);
      (aisum||[]).forEach(r => {
        const h = new Date(r.created_at).getUTCHours();
        if (Number.isFinite(h)) cnt[h] += 1;
      });
      mount('a_peak_hours', {
        ...baseAnim, tooltip:{}, grid: baseGrid,
        xAxis:{ type:'category', data: hours.map(h => `${h}:00`), ...baseAxis },
        yAxis:{ type:'value', ...baseAxis },
        series:[ barSeries('Msgs', cnt) ]
      });
    })();

    if (!silent) console.log('[dash] refreshed');
  }

  // ---- LIVE (Realtime + polling + focus) ----
  let stopRealtime = null, pollTimer = null;

  function startRealtime() {
    try {
      if (stopRealtime) stopRealtime();
      const unsub =
        (window.Api.subscribeRealtimeStrong ?
          window.Api.subscribeRealtimeStrong(() => load(true)) :
          window.Api.subscribeRealtimeAll(() => load(true)));
      stopRealtime = () => { try { unsub && unsub(); } catch(_) {} };
    } catch (e) { console.warn('Realtime unavailable:', e); }
  }
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => load(true), 30000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });

  refreshBtn.addEventListener('click', () => load(true));
  rangeSelect.addEventListener('change', () => load(true));

  // initial load
  load().then(()=>{ startRealtime(); startPolling(); })
        .catch(err => { console.error('[dash] initial load failed:', err); alert('Initial load failed: ' + (err?.message || err)); });

  // window resize
  window.addEventListener('resize', () => {
    Object.values(charts).forEach(c=>{ try{ c.resize(); }catch(_){} });
    Object.values(Mon.charts).forEach(c=>{ try{ c.resize(); }catch(_){} });
  });

  // Tab switching
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const active = document.getElementById('tab-' + tab);
      active.classList.add('active');
      setTimeout(() => {
        Object.values(charts).forEach(c=>{ try{ c.resize(); }catch(_){} });
        Object.values(Mon.charts).forEach(c=>{ try{ c.resize(); }catch(_){} });
      }, 0);
    });
  });
})();


// ==== Monitoring (live, /metrics_json, with 1m/1h/1d aggregation) =================
const Mon = (() => {
  const E = echarts;
  const charts = {};
  const raw = [];

  const baseAxis = { axisLabel:{ color:'#94a3b8', hideOverlap:true }};
  const baseGrid = { left:48, right:18, top:26, bottom:36 };

  const mkmount = (id, opt) => {
    const el = document.getElementById(id);
    if(!el) return null;
    if(charts[id]) charts[id].dispose();
    const c = E.init(el, null, {renderer:'canvas'});
    c.setOption(opt, true);
    charts[id] = c;
    return c;
  };

  const line = (title, labels, series) => ({
    title:{text:title,left:'center',textStyle:{color:'#cfe1ff',fontSize:14}},
    tooltip:{trigger:'axis'},
    grid:baseGrid,
    xAxis:{type:'category',data:labels,...baseAxis},
    yAxis:{type:'value',...baseAxis},
    series: series.map(s=>({ ...s, type:'line', symbol:'none', smooth:true, areaStyle:{} }))
  });

  const bucketKey = (ts, mode) => {
    const d = new Date(ts);
    if (mode === '1d') return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
    if (mode === '1h') return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCHours()}:00`;
    return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
  };

  function aggregate(mode){
    const map = new Map();
    raw.forEach(p => {
      const k = bucketKey(p.t, mode);
      if (!map.has(k)) map.set(k, {n:0, p50:0,p95:0,err:0,rpm:0,cpu:0,ram:0,tokens:0,cost:0});
      const a = map.get(k);
      a.n++; a.p50+=p.p50; a.p95+=p.p95; a.err+=p.err; a.rpm+=p.rpm; a.cpu+=p.cpu; a.ram+=p.ram; a.tokens+=p.tokens; a.cost+=p.cost;
    });
    const labels = [...map.keys()];
    const avg = f => labels.map(k => {
      const a = map.get(k);
      return a.n ? +(a[f]/a.n).toFixed(f==='cost'?4:2) : 0;
    });
    return {
      labels,
      p50: avg('p50'), p95: avg('p95'), err: avg('err'), rpm: avg('rpm'),
      cpu: avg('cpu'), ram: avg('ram'), tokens: avg('tokens'), cost: avg('cost')
    };
  }

  async function tick(){
    try{
      const res = await fetch(window.METRICS_URL, { cache:'no-store' });
      if(!res.ok) throw new Error('metrics_json HTTP ' + res.status);
      const m = await res.json();

      raw.push({
        t: new Date(m.time).getTime(),
        p50: m.latency_ms_p50, p95: m.latency_ms_p95,
        err: m.error_rate*100, rpm: m.req_per_min,
        cpu: m.cpu_percent, ram: m.ram_percent,
        tokens: m.ai_tokens_avg, cost: m.ai_cost_usd
      });
      if (raw.length > 24*60) raw.shift();

      render();
    }catch(e){
      console.warn('metrics_json tick error:', e.message);
      ['m_latency','m_error_rate','m_rpm','m_cpu_ram','m_tokens_cost'].forEach(id=>{
        if(!charts[id]) mkmount(id, {title:{text:''}});
      });
    }
  }

  function render(){
    const mode = (document.getElementById('monRes')?.value) || '1m';
    const A = aggregate(mode);

    mkmount('m_latency',     line('Latency (ms)',     A.labels, [{name:'p50', data:A.p50},{name:'p95', data:A.p95}]));
    mkmount('m_error_rate',  line('Error Rate (%)',   A.labels, [{name:'error %', data:A.err}]));
    mkmount('m_rpm',         line('Requests / min',   A.labels, [{name:'rpm', data:A.rpm}]));
    mkmount('m_cpu_ram',     line('CPU / RAM (%)',    A.labels, [{name:'CPU %', data:A.cpu},{name:'RAM %', data:A.ram}]));
    mkmount('m_tokens_cost', line('AI Tokens / Cost', A.labels, [{name:'Avg tokens', data:A.tokens},{name:'Cost (USD/min)', data:A.cost}]));
  }

  function start(){
    tick();
    setInterval(tick, 5000);
    const sel = document.getElementById('monRes');
    sel && sel.addEventListener('change', render);
  }

  return { start, charts };
})();

document.addEventListener('DOMContentLoaded', () => {
  Mon.start();
});