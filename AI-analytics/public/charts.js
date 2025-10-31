// charts.js — Chart.js helperlari (legend bottom, overlap yo'q)
window.SupaCharts = (()=>{
  const common = {
    responsive:true,
    maintainAspectRatio:false,
    plugins:{ legend:{ position:'bottom', labels:{ color:'#cbd5e1', boxWidth:10, font:{ size:11 }}}},
    animation:{ duration:200 },
    scales:{
      x:{ ticks:{ color:'#94a3b8' } },
      y:{ ticks:{ color:'#94a3b8' }, grid:{ color:'rgba(255,255,255,.06)' } }
    }
  };
  const mkLine = (ctx, labels, series)=>
    new Chart(ctx,{ type:'line', data:{ labels, datasets:series }, options:{ ...common, elements:{ line:{ tension:.35 }}}});
  const mkBar = (ctx, labels, data, label)=>
    new Chart(ctx,{ type:'bar',  data:{ labels, datasets:[{ label, data }] }, options: common });
  const mkDoughnut = (ctx, labels, data)=>
    new Chart(ctx,{ type:'doughnut', data:{ labels, datasets:[{ data }] }, options: { ...common }});
  return { mkLine, mkBar, mkDoughnut };
})();