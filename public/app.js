// app.js — SupaDash (Blue) · ECharts + Supabase + Live Monitoring
// ==============================================================
(function () {
  const Api = window.Api;
  const U   = window.Utils;
  const E   = echarts;

  const rangeSelect = document.getElementById('rangeSelect');
  const refreshBtn  = document.getElementById('refreshBtn');

  // ---- Topic → Kasallik kategoriya xaritasi ----
  const categoryMap = [
    { cat:"Erkaklar va ayollar jinsiy muammolari", re:/(prostat|prostata|prostatit|impot|ereksiya|frigid|jinsiy|libido|androlog|ginekolog|oylik|hayz|menstru|pcos|pcod|endometr|mastit|laktats)/i },
    { cat:"Oshqozon ichak", re:/(oshqozon|ichak|gastrit|reflyuks|gerd|qorin og'ri|qorin ogri|ich ket|ich qot|diare|kabziyat|gemorroy|anal yoriq)/i },
    { cat:"Bosh og'rig'i va aylanishi", re:/(bosh og'ri|bosh ogri|migr|migren|vertig|aylanish)/i },
    { cat:"Teri, terlash", re:/(teri|dermatit|ekzem|psoria|akne|ugri|husnbuzar|terlash|giperhidroz|toshma)/i },
    { cat:"Burun, tomoq, quloq", re:/(burun|tomoq|quloq|sinusit|otit|laringit|faringit|rinit)/i },
    { cat:"O'pka", re:/(o'pka|opka|pnevmon|bronxit|astma|nafas qis|kopb|gripp|yo'tal|yotal)/i },
    { cat:"Allergiya", re:/(allerg|urtik|angiode)/i },
    { cat:"Yurak qon tomirlar va qon bosimi", re:/(yurak|qon bosim|giperten|gipotens|aritmiya|stenokard|infarkt|trombo|vena|varikoz)/i },
    { cat:"Bo‘g‘imlar (oyoq, yelka, qo'l, bel)", re:/(bo'g'im|bogim|bel og'ri|bel ogri|oyoq og'ri|tizza|yelka|qo'l og'ri|qol ogri|artrit|artroz|radikul|skolioz|osteoxond)/i },
    { cat:"Barmoq (qo'l va oyoq barmoqlari)", re:/(barmoq|barmoqlar|onych|tirnoq|panja)/i },
    { cat:"Asab, stress, uyqu", re:/(stress|asab|tashvish|anksiy|depress|uyqusiz|uyqu|panik|psixo|nevroz|nevropatiya)/i },
    { cat:"Tish", re:/(tish|stomat|milk|karies)/i },
    { cat:"Soch va tuklar", re:/(soch|tuk|alope|soch to'kil|trixolog)/i },
    { cat:"Yuz (husnbuzar, ugri)", re:/(yuz|pigment|dog'|sepkil|go'zallik|kosmetolog)/i },
    { cat:"Ko‘z", re:/(ko'z|koz|katarakt|glaukoma|qorachi|kon'yunktiv|konjunktiv)/i }
  ];
  function mapToCategory(txt) {
    const s = (txt || '').toString().toLowerCase();
    for (const { cat, re } of categoryMap) { if (re.test(s)) return cat; }
    return null;
  }

  // ------- helpers -------
  const debounce = (fn, ms=500) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const normGender = (g) => {
    const v = (g||'').toString().toLowerCase().trim();
    if (['m','male','erkak','мужской'].includes(v))   return 'Erkak';
    if (['f','female','ayol','женский'].includes(v))  return 'Ayol';
    return 'unknown';
  };

  const baseGrid = { left: 55, right: 20, top: 20, bottom: 56 };
  const baseAxis = { axisLabel:{ color:'#94a3b8', hideOverlap:true, interval:'auto' } };
  const baseAnim = { animationDuration: 200, animationDurationUpdate: 300 };

  // global chart registry (Users/Rating/AISum)
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
      Api.fetchAisumAll(),
      Api.fetchRatingsAll(),
      Api.countUsersExact(),
      Api.countAIMsgExact()
    ]);

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

    // Rating → histogram
    const avgs = (ratings||[]).map(r=>Number(r.average)).filter(v=>!isNaN(v));
    const bins = new Map(); const step=0.5;
    avgs.forEach(v=>{ const b=(Math.floor(v/step)*step).toFixed(1); bins.set(b,(bins.get(b)||0)+1); });
    const histLabels = [...bins.keys()].map(Number).sort((a,b)=>a-b).map(v=>v.toFixed(1));
    const histVals   = histLabels.map(l=>bins.get(Number(l))||0);
    mount('r_hist', {
      ...baseAnim, tooltip:{},
      xAxis:{ type:'category', data:histLabels, ...baseAxis },
      yAxis:{ type:'value', ...baseAxis }, grid: baseGrid,
      series:[barSeries('Users', histVals)]
    });

    // Top engaged
    const engaged = [...(ratings||[])].sort((a,b)=>(b.chat_count||0)-(a.chat_count||0)).slice(0,10).reverse();
    mount('r_top_chatters', {
      ...baseAnim, tooltip:{}, grid:{ ...baseGrid, left: 150 },
      xAxis:{ type:'value', ...baseAxis },
      yAxis:{ type:'category', data: engaged.map(r=>r.name||'user'), ...baseAxis },
      series:[barSeries('Chats', engaged.map(r=>r.chat_count||0))]
    });

    // Top satisfied / dissatisfied
    const rated  = (ratings||[]).filter(r=>!isNaN(Number(r.average)));
    const topSat = [...rated].sort((a,b)=>(b.average||0)-(a.average||0)).slice(0,5);
    const topDis = [...rated].sort((a,b)=>(a.average||0)-(b.average||0)).slice(0,5);
    mount('r_top_avg', {
      ...baseAnim, tooltip:{}, legend:{ bottom:0, textStyle:{color:'#cbd5e1'} },
      grid:{ ...baseGrid, left: 140 },
      xAxis:{ type:'value', ...baseAxis },
      yAxis:{ type:'category',
        data:[...topSat.map(r=>'😊 '+(r.name||'user')),...topDis.map(r=>'😕 '+(r.name||'user'))].reverse(),
        ...baseAxis },
      series:[barSeries('Avg', [...topSat.map(r=>r.average||0), ...topDis.map(r=>r.average||0)].reverse())]
    });

    // AISum → AI messages / day
    const aiPerDay = Object.fromEntries(labels.map(d=>[d,0]));
    aisum.forEach(r => {
      if (r.ai_message && String(r.ai_message).trim()!==''){
        const k = U.toDay(r.created_at);
        if (k in aiPerDay) aiPerDay[k]++;
      }
    });
    mount('a_msgs_ts', {
      ...baseAnim, tooltip:{trigger:'axis'},
      xAxis:{ type:'category', data:labels, ...baseAxis, axisLabel:{...baseAxis.axisLabel, rotate:45} },
      yAxis:{ type:'value', ...baseAxis }, grid: baseGrid,
      series:[areaSeries('AI msg/day', labels.map(d=>aiPerDay[d]))]
    });

    // Topic stacked (Top 7)
    const topicPairs  = U.countBy(aisum.filter(r=>r.topic), r=>r.topic).slice(0,7);
    const topicKeys   = topicPairs.map(x=>x[0]);
    const topicSeries = topicKeys.map(t=>{
      const m = Object.fromEntries(labels.map(d=>[d,0]));
      aisum.filter(r=>r.topic===t).forEach(r=>{ const k=U.toDay(r.created_at); if(k in m) m[k]++; });
      return barSeries(t, labels.map(d=>m[d]), 'topic');
    });
    mount('a_topic_stack', {
      ...baseAnim,
      tooltip:{trigger:'axis'},
      legend:{ bottom:0, textStyle:{color:'#cbd5e1'}, type:'scroll' },
      xAxis:{ type:'category', data:labels, ...baseAxis, axisLabel:{...baseAxis.axisLabel, rotate:45} },
      yAxis:{ type:'value', ...baseAxis }, grid: baseGrid,
      series: topicSeries
    });

    // --- Kasallik Kategoriyalari (pie; legend o'ng-ust, Top-10 + Boshqa) ---
    {
      const catCount = new Map();
      (aisum || []).forEach(r => {
        const base = r.topic || r.ai_message || '';
        const cat  = mapToCategory(base) || 'Boshqa';
        catCount.set(cat, (catCount.get(cat) || 0) + 1);
      });

      let pairs = [...catCount.entries()].sort((a,b)=>b[1]-a[1]);
      if (pairs.length > 10) {
        const top10 = pairs.slice(0,10);
        const rest = pairs.slice(10).reduce((s, [,v])=>s+v, 0);
        if (rest > 0) top10.push(['Boshqa', rest]);
        pairs = top10;
      }

      const option = {
        ...baseAnim,
        title:{ text:'Kasallik Kategoriyalari', left: 12, top: 10, textStyle:{ color:'#cfe1ff', fontSize:14 } },
        tooltip:{ trigger:'item', formatter: (p)=> `${p.name}: ${p.value} ta (${p.percent}%)` },
        legend:{
          orient:'vertical',
          right:8, top:'middle',
          type:'scroll', height:260,
          itemWidth:14, itemHeight:10, itemGap:8,
          textStyle:{ color:'#cbd5e1', fontSize:11 },
          pageIconColor:'#94a3b8', pageTextStyle:{ color:'#94a3b8' }
        },
        series:[{
          type:'pie',
          radius:['40%','70%'],
          center:['38%','55%'],
          avoidLabelOverlap:true,
          minShowLabelAngle:8,
          label:{ show:true, formatter:'{b}\n{c} ta ({d}%)', fontSize:11 },
          labelLine:{ length:8, length2:6 },
          data: pairs.map(([name, value]) => ({ name, value }))
        }]
      };
      mount('a_topic_pie', option);
    }

    // Doctor bar
    const doctorTop = U.countBy(aisum.filter(r=>r.doctor), r=>r.doctor).slice(0,10).reverse();
    mount('a_doctor_bar', {
      ...baseAnim, tooltip:{}, grid:{ ...baseGrid, left: 150 },
      xAxis:{ type:'value', ...baseAxis },
      yAxis:{ type:'category', data:doctorTop.map(x=>x[0]), ...baseAxis },
      series:[barSeries('Messages', doctorTop.map(x=>x[1]))]
    });

    // Peak hours (UTC)
    const hours = Array.from({length:24},(_,h)=>h);
    const hourCount = Array(24).fill(0);
    aisum.forEach(r => { const h = new Date(r.created_at).getUTCHours(); hourCount[h]++; });
    mount('a_peak_hours', {
      ...baseAnim, tooltip:{}, grid: baseGrid,
      xAxis:{ type:'category', data:hours.map(h=>`${h}:00`), ...baseAxis },
      yAxis:{ type:'value', ...baseAxis },
      series:[barSeries('Msgs', hourCount)]
    });

    if (!silent) console.log('[dash] refreshed');
  }

  // ---- LIVE (Realtime + polling + focus) ----
  const debouncedReload = debounce(() => load(true), 800);
  let stopRealtime = null, pollTimer = null;

  function startRealtime() {
    try {
      if (stopRealtime) stopRealtime();
      stopRealtime = Api.subscribeRealtimeAll(() => debouncedReload());
    } catch (e) { console.warn('Realtime unavailable:', e); }
  }
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => load(true), 30000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });

  refreshBtn.addEventListener('click', () => load(true));
  rangeSelect.addEventListener('change', () => load(true));

  // initial load (xato bo'lsa ko'rsatamiz)
  load().then(()=>{ startRealtime(); startPolling(); })
        .catch(err => { console.error('[dash] initial load failed:', err); alert('Initial load failed: ' + (err?.message || err)); });

  // window resize → all charts resize
  window.addEventListener('resize', () => {
    Object.values(charts).forEach(c=>{ try{ c.resize(); }catch(_){} });
    Object.values(Mon.charts).forEach(c=>{ try{ c.resize(); }catch(_){} });
  });

  // Tab switching (Users/Rating/AISum/Monitoring)
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
  const raw = []; // {t, p50, p95, err, rpm, cpu, ram, tokens, cost}

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

  // ---- aggregation: 1m (raw), 1h, 1d
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
      if (raw.length > 24*60) raw.shift(); // ~24h buffer @ 1m

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

// start monitoring after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  Mon.start();
});