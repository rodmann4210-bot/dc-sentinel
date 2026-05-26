<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>DC Sentinel — Autonomous OSINT</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#060610;color:#e2e8f0;font-family:'Courier New',monospace}
    @keyframes dot{from{opacity:0.2;transform:scale(0.7)}to{opacity:1;transform:scale(1.3)}}
    @keyframes alertBlink{0%,100%{box-shadow:0 0 8px 0 currentColor}50%{box-shadow:0 0 28px 6px currentColor}}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b}
  </style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const {useState,useEffect,useCallback}=React;
const WEIGHTS={air_total:10,air_mil:15,fed_reg:15,tfr_count:15,hotel_rate:10,car_rental:5};
const LABELS={air_total:"Aircraft in DC Airspace",air_mil:"Military / VIP Aircraft",fed_reg:"Fed. Register Emergency Docs",tfr_count:"Active TFRs over DC",hotel_rate:"Hay-Adams / Willard Rate",car_rental:"DCA Car Rental"};
const UNITS={air_total:"aircraft",air_mil:"mil/VIP",fed_reg:"docs",tfr_count:"TFRs",hotel_rate:"$/night",car_rental:"$/day"};
const QUAL=[{id:"staff_dark",icon:"📵",label:"Congressional/WH staff went dark on social"},{id:"press_surge",icon:"📷",label:"Unusual press pool surge near key buildings"},{id:"lights_late",icon:"💡",label:"Lights on past midnight — Capitol/OEOB/Pentagon"},{id:"lobby_cancel",icon:"📋",label:"Mass lobbying meeting cancellations reported"}];

function si(z){const a=Math.abs(z);if(a<1)return{l:"NORMAL",c:"#4ade80",b:"#052e16",g:false};if(a<2)return{l:"WATCH",c:"#facc15",b:"#1c1400",g:false};if(a<3)return{l:"ELEVATED",c:"#fb923c",b:"#1c0a00",g:true};return{l:"CRITICAL",c:"#f87171",b:"#1c0000",g:true};}

function Badge({z}){
  if(z==null)return <span style={{fontSize:"10px",color:"#334155",fontFamily:"monospace"}}>— NO DATA —</span>;
  const s=si(z);
  return <div style={{display:"inline-flex",alignItems:"center",gap:"8px",padding:"4px 12px",borderRadius:"4px",background:s.b,border:`1px solid ${s.c}44`}}><span style={{color:s.c,fontWeight:900,fontSize:"12px",fontFamily:"monospace"}}>{s.l}</span><span style={{color:s.c,fontSize:"12px",opacity:0.75,fontFamily:"monospace"}}>{z>=0?"+":""}{z.toFixed(1)}σ</span></div>;
}

function Spin({sz=16,c="#6366f1"}){return <div style={{width:sz,height:sz,border:`2px solid ${c}33`,borderTop:`2px solid ${c}`,borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>;}

function Card({id,data,loading}){
  const s=data?si(data.z):null;
  return(
    <div style={{background:"#0a0a14",borderRadius:"8px",padding:"16px",border:`1px solid ${s&&Math.abs(data.z)>=1?s.c+"55":"#1e293b"}`,transition:"all 0.5s",boxShadow:s&&s.g?`0 0 16px -4px ${s.c}33`:"none"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
        <div><div style={{fontSize:"8px",color:"#1e3a4a",letterSpacing:"0.2em"}}>{WEIGHTS[id]||0}% WEIGHT · AUTO</div><div style={{fontSize:"12px",fontWeight:700,color:"#94a3b8"}}>{LABELS[id]||id}</div></div>
        {loading&&!data?<Spin/>:!loading&&data?<div style={{fontSize:"9px",padding:"2px 6px",borderRadius:"3px",background:"#052e16",color:"#4ade80",fontFamily:"monospace"}}>● LIVE</div>:null}
      </div>
      {loading&&!data&&<div style={{display:"flex",gap:"4px",padding:"8px 0"}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#475569",animation:`dot 0.9s ease ${i*0.15}s infinite alternate`}}/>)}</div>}
      {data&&<><div style={{display:"flex",alignItems:"baseline",gap:"6px",marginBottom:"8px"}}><span style={{fontSize:"40px",fontWeight:900,lineHeight:1,color:s?s.c:"#f1f5f9",fontFamily:"monospace"}}>{data.value}</span><span style={{fontSize:"10px",color:"#475569",fontFamily:"monospace",paddingBottom:"6px"}}>{UNITS[id]||""}</span>{data.value===0&&<span style={{fontSize:"9px",color:"#4ade80",fontFamily:"monospace",paddingBottom:"6px",opacity:0.7}}>↳ zero</span>}</div><Badge z={data.z}/></>}
      {!data&&!loading&&<div style={{fontSize:"10px",color:"#334155",fontFamily:"monospace"}}>— AWAITING COLLECTION —</div>}
    </div>
  );
}

function App(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [qual,setQual]=useState({});
  const [analysis,setAnalysis]=useState(null);
  const [analyzing,setAnalyzing]=useState(false);
  const [clock,setClock]=useState(new Date());

  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(t);},[]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{const r=await fetch("/api/data");const j=await r.json();if(j.ok&&j.data)setData(j.data);}catch(e){console.error(e);}
    setLoading(false);
  },[]);

  useEffect(()=>{load();const t=setInterval(load,5*60*1000);return()=>clearInterval(t);},[load]);

  async function analyze(){
    if(!data?.scores)return;
    setAnalyzing(true);setAnalysis(null);
    try{
      const r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scores:data.scores,coveragePct:data.coveragePct,qualActive:qual})});
      const j=await r.json();
      setAnalysis(j.ok?j.analysis:`⚠ ${j.error}`);
    }catch(e){setAnalysis(`⚠ ${e.message}`);}
    setAnalyzing(false);
  }

  const scores=data?.scores||{};
  const tw=Object.values(WEIGHTS).reduce((a,b)=>a+b,0)+20;
  const cw=Object.keys(scores).reduce((s,k)=>s+(WEIGHTS[k]||0),0)+Object.entries(qual).filter(([,v])=>v).length*5;
  const cpct=Math.round((cw/tw)*100);
  const cc=cpct<30?"#f87171":cpct<60?"#facc15":cpct<80?"#fb923c":"#4ade80";
  const cl=cpct<30?"LOW":cpct<60?"MODERATE":cpct<80?"GOOD":"HIGH";
  const pz=data?.peakZ||0;
  const as=si(pz);
  const ago=data?.timestamp?Math.round((Date.now()-new Date(data.timestamp).getTime())/60000):null;
  const ft=d=>d.toLocaleTimeString("en-US",{hour12:false});
  const fd=d=>d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});

  return(
    <div style={{minHeight:"100vh",background:"#060610",color:"#e2e8f0",fontFamily:"'Courier New',monospace"}}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{background:"linear-gradient(180deg,#0d0d22,#060610)",borderBottom:"1px solid #1e293b",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
          <div style={{fontSize:"30px"}}>🔭</div>
          <div>
            <div style={{fontSize:"22px",fontWeight:900,letterSpacing:"0.22em",color:"#f1f5f9"}}>DC SENTINEL</div>
            <div style={{fontSize:"8px",color:"#1e3a4a",letterSpacing:"0.3em"}}>AUTONOMOUS OSINT · EARLY WARNING · WASHINGTON D.C.</div>
            <div style={{fontSize:"8px",color:"#4ade8088",letterSpacing:"0.2em",marginTop:"2px"}}>● FULLY AUTONOMOUS · UPDATES EVERY 30 MIN</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"14px",flexWrap:"wrap"}}>
          <button onClick={load} style={{background:"transparent",border:"1px solid #1e293b",borderRadius:"6px",color:"#475569",fontFamily:"monospace",fontSize:"10px",padding:"6px 14px",cursor:"pointer"}}>⟳ REFRESH</button>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"22px",fontWeight:900,color:"#f1f5f9"}}>{ft(clock)}</div>
            <div style={{fontSize:"9px",color:"#1e3a4a"}}>{fd(clock)} · EST</div>
          </div>
          <div style={{padding:"10px 16px",borderRadius:"8px",textAlign:"center",background:as.b,border:`2px solid ${as.c}`,color:as.c,minWidth:"110px",animation:as.g?"alertBlink 2.2s ease infinite":"none"}}>
            <div style={{fontSize:"8px",opacity:0.5,letterSpacing:"0.2em",marginBottom:"2px"}}>ALERT LEVEL</div>
            <div style={{fontSize:"15px",fontWeight:900,letterSpacing:"0.15em"}}>{as.l}</div>
            <div style={{fontSize:"9px",opacity:0.6,marginTop:"2px"}}>peak {pz.toFixed(1)}σ</div>
          </div>
        </div>
      </div>
      <div style={{height:"5px",background:"#0f172a",position:"relative"}}>
        <div style={{height:"100%",width:`${Math.min(100,(pz/4.5)*100)}%`,background:`linear-gradient(90deg,#4ade80,${as.c})`,transition:"width 1s ease"}}/>
        {[1,2,3].map(t=><div key={t} style={{position:"absolute",inset:0,left:`${(t/4.5)*100}%`,width:"1px",background:"#1e293b"}}/>)}
      </div>
      <div style={{padding:"22px 24px",maxWidth:"1400px",margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 14px",background:"#0a0a14",border:"1px solid #1e293b",borderRadius:"6px",marginBottom:"16px",flexWrap:"wrap"}}>
          {loading?<><Spin sz={12} c="#4ade80"/><span style={{fontSize:"10px",color:"#475569",fontFamily:"monospace"}}>Collecting live data...</span></>
          :data?<><div style={{width:8,height:8,borderRadius:"50%",background:"#4ade80",flexShrink:0}}/><span style={{fontSize:"10px",color:"#475569",fontFamily:"monospace",flex:1}}>Last collected: {ago===0?"just now":`${ago} min ago`} · Auto-refreshes every 30 min</span></>
          :<><div style={{width:8,height:8,borderRadius:"50%",background:"#facc15",flexShrink:0}}/><span style={{fontSize:"10px",color:"#facc15",fontFamily:"monospace"}}>Waiting for first collection — auto-starts within 30 min of deploy</span></>}
        </div>
        <div style={{background:"#0a0a14",border:"1px solid #1e293b",borderRadius:"8px",padding:"16px",marginBottom:"16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px",flexWrap:"wrap",gap:"8px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}><span style={{fontSize:"18px"}}>📊</span><div><div style={{fontSize:"8px",color:"#1e3a4a",letterSpacing:"0.25em"}}>ANALYSIS QUALITY</div><div style={{fontSize:"13px",fontWeight:700,color:"#94a3b8"}}>Signal Coverage</div></div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:"32px",fontWeight:900,color:cc,fontFamily:"monospace",lineHeight:1}}>{cpct}%</div><div style={{fontSize:"9px",color:cc,letterSpacing:"0.15em"}}>{cl} COVERAGE</div></div>
          </div>
          <div style={{height:"6px",background:"#0f172a",borderRadius:"3px",marginBottom:"10px",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${cpct}%`,background:`linear-gradient(90deg,#4ade80,${cc})`,borderRadius:"3px",transition:"width 0.8s ease"}}/>
          </div>
          <div style={{fontSize:"10px",color:"#475569",fontFamily:"monospace",padding:"6px 10px",background:"#0f0f1a",borderRadius:"4px",borderLeft:`2px solid ${cc}44`}}>
            {cpct<30?"⚠ Low — toggle qualitative signals for better coverage.":cpct<60?"◆ Moderate — analysis useful but limited.":cpct<80?"● Good — analysis is reasonably reliable.":"✓ High — analysis carries strong analytical weight."}
          </div>
        </div>
        {data?.alerts&&data.alerts.length>0&&(
          <div style={{background:"#1c0a00",border:"1px solid #fb923c44",borderRadius:"8px",padding:"14px 18px",marginBottom:"16px"}}>
            <div style={{fontSize:"9px",color:"#fb923c",letterSpacing:"0.2em",marginBottom:"8px"}}>⚠ ELEVATED SIGNALS — RECOMMEND RUNNING ANALYSIS</div>
            {data.alerts.map((a,i)=>(
              <div key={i} style={{display:"flex",gap:"10px",alignItems:"center",marginBottom:"4px"}}>
                <span style={{fontSize:"10px",color:"#94a3b8",fontFamily:"monospace",flex:1}}>{LABELS[a.signal]||a.signal}</span>
                <Badge z={a.z}/>
              </div>
            ))}
          </div>
        )}
        <div style={{fontSize:"8px",color:"#1e3a4a",letterSpacing:"0.3em",marginBottom:"10px"}}>── AUTO-COLLECTED SIGNALS · fully autonomous · no input required</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"14px",marginBottom:"26px"}}>
          {Object.keys(WEIGHTS).map(id=><Card key={id} id={id} data={scores[id]} loading={loading&&!scores[id]}/>)}
        </div>
        <div style={{fontSize:"8px",color:"#1e3a4a",letterSpacing:"0.3em",marginBottom:"10px"}}>── QUALITATIVE SIGNALS · toggle when observed · 5% each</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"10px",marginBottom:"26px"}}>
          {QUAL.map(q=>{const on=!!qual[q.id];return(
            <div key={q.id} onClick={()=>setQual(p=>({...p,[q.id]:!on}))} style={{display:"flex",alignItems:"center",gap:"12px",padding:"14px 16px",borderRadius:"8px",cursor:"pointer",background:on?"#0a1a0a":"#0a0a14",border:`1px solid ${on?"#4ade8044":"#1e293b"}`,transition:"all 0.2s",boxShadow:on?"0 0 16px -4px #4ade8033":"none"}}>
              <div style={{width:16,height:16,borderRadius:"4px",flexShrink:0,border:`2px solid ${on?"#4ade80":"#1e293b"}`,background:on?"#4ade80":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {on&&<span style={{fontSize:"10px",color:"#000",fontWeight:900}}>✓</span>}
              </div>
              <span style={{fontSize:"18px"}}>{q.icon}</span>
              <span style={{fontSize:"12px",color:on?"#d1fae5":"#475569",flex:1,lineHeight:1.4}}>{q.label}</span>
              {on&&<div style={{fontSize:"9px",color:"#4ade80",padding:"2px 6px",background:"#052e16",borderRadius:"3px",flexShrink:0}}>+5%</div>}
            </div>
          );})}
        </div>
        <div style={{background:"#0a0a14",border:"1px solid #1e293b",borderRadius:"8px",padding:"20px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",flexWrap:"wrap",gap:"10px"}}>
            <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
              <span style={{fontSize:"22px"}}>🧠</span>
              <div><div style={{fontSize:"8px",color:"#1e3a4a",letterSpacing:"0.25em"}}>AI ENGINE · COVERAGE-AWARE</div><div style={{fontSize:"13px",fontWeight:700,color:"#94a3b8"}}>Composite Signal Analysis</div></div>
            </div>
            <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
              <div style={{textAlign:"right"}}><div style={{fontSize:"9px",color:"#334155",fontFamily:"monospace"}}>{Object.keys(scores).length} signals · {cpct}% coverage</div><div style={{fontSize:"9px",color:cc,fontFamily:"monospace"}}>{cl} CONFIDENCE</div></div>
              <button onClick={analyze} disabled={!Object.keys(scores).length||analyzing} style={{background:Object.keys(scores).length&&!analyzing?"linear-gradient(135deg,#4f46e5,#7c3aed)":"#111827",color:Object.keys(scores).length&&!analyzing?"#fff":"#374151",border:"none",borderRadius:"6px",padding:"8px 20px",fontFamily:"monospace",fontSize:"11px",fontWeight:700,cursor:Object.keys(scores).length&&!analyzing?"pointer":"not-allowed",letterSpacing:"0.12em"}}>
                {analyzing?"ANALYZING...":"▶  RUN ANALYSIS"}
              </button>
            </div>
          </div>
          {!Object.keys(scores).length&&<div style={{fontSize:"11px",color:"#1e3a4a",fontFamily:"monospace",padding:"10px",background:"#0f0f1a",borderRadius:"4px"}}>Waiting for first data collection run...</div>}
          {analyzing&&<div style={{display:"flex",gap:"6px",alignItems:"center",padding:"10px 0"}}>{[0,1,2,3].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",animation:`dot 0.9s ease ${i*0.18}s infinite alternate`}}/>)}<span style={{color:"#334155",fontFamily:"monospace",fontSize:"11px",marginLeft:"10px"}}>Processing...</span></div>}
          {analysis&&<div style={{borderTop:"1px solid #1e293b",paddingTop:"16px",color:"#cbd5e1",fontFamily:"monospace",fontSize:"12px",lineHeight:2.0,whiteSpace:"pre-wrap"}}>{analysis}</div>}
        </div>
        <div style={{marginTop:"28px",paddingTop:"16px",borderTop:"1px solid #0f172a",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <span style={{fontSize:"9px",color:"#1e293b",letterSpacing:"0.15em"}}>DC SENTINEL AUTONOMOUS · ALL SOURCES PUBLICLY AVAILABLE</span>
          <div style={{display:"flex",gap:"16px"}}>
            {[["Federal Register","https://www.federalregister.gov"],["FAA TFR","https://tfr.faa.gov/tfr3/"],["OpenSky","https://opensky-network.org"]].map(([l,u])=>(
              <a key={l} href={u} target="_blank" rel="noopener noreferrer" style={{fontSize:"9px",color:"#1e3a4a",textDecoration:"none"}}>↗ {l}</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
</script>
</body>
</html>