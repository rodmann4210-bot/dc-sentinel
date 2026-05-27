const BASELINES = {
  air_total:  { mean: 62,  std: 18  },
  air_mil:    { mean: 2.1, std: 1.4 },
  fed_reg:    { mean: 0.9, std: 1.1 },
  tfr_count:  { mean: 4.2, std: 2.0 },
  hotel_rate: { mean: 425, std: 105 },
  car_rental: { mean: 68,  std: 22  },
};

const WEIGHTS = { air_total:10, air_mil:15, fed_reg:15, tfr_count:15, hotel_rate:10, car_rental:5 };
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a,b)=>a+b,0);
const MIL_RE = /^(SAM|AF1|AF2|PAT|RCH|REACH|VENUS|IRON|SWORD|HUNT|DUKE|FORGE|EXEC|ANGEL|MARINE)\d*/i;

function zScore(v,{mean,std}){ return std>0?(v-mean)/std:0; }
function sigmaLabel(z){ const a=Math.abs(z); if(a<1)return"NORMAL"; if(a<2)return"WATCH"; if(a<3)return"ELEVATED"; return"CRITICAL"; }

async function fetchAircraft(username,password){
  try{
    const auth=Buffer.from(`${username}:${password}`).toString("base64");
    const res=await fetch("https://opensky-network.org/api/states/all?lamin=38.70&lomin=-77.25&lamax=39.05&lomax=-76.75",{headers:{Authorization:`Basic ${auth}`},signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const states=data.states||[];
    const mil=states.filter(s=>MIL_RE.test((s[1]||"").trim())||s[14]==="7777");
    return{success:true,total:states.length,military:mil.length};
  }catch(e){return{success:false,error:e.message};}
}

async function fetchFederalRegister(){
  try{
    const today=new Date().toISOString().split("T")[0];
    const p=new URLSearchParams();
    ["RULE","PRESDOCU","NOTICE"].forEach(t=>p.append("conditions[type][]",t));
    p.append("conditions[term]","emergency");
    p.append("conditions[publication_date][gte]",today);
    p.append("per_page","5");
    ["title","type"].forEach(f=>p.append("fields[]",f));
    const res=await fetch(`https://www.federalregister.gov/api/v1/documents.json?${p}`,{signal:AbortSignal.timeout(12000)});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    return{success:true,count:data.count??0,items:(data.results||[]).slice(0,3).map(r=>r.title)};
  }catch(e){return{success:false,error:e.message};}
}

async function fetchTFRs(apiKey){
  try{
    const prompt=`Search for active FAA TFRs over Washington DC right now. Do NOT count permanent SFRA/FRZ. Return ONLY JSON: {"tfr_count":<integer>,"details":"<one sentence>"}`;
    const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:prompt}]})});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
    const match=text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim().match(/\{[\s\S]*\}/);
    if(!match)throw new Error("No JSON");
    const parsed=JSON.parse(match[0]);
    return{success:true,count:parsed.tfr_count??0,details:parsed.details??""};
  }catch(e){return{success:false,error:e.message};}
}

async function fetchHotelRate(apiKey){
  try{
    const prompt=`Search for cheapest standard room rate tonight at Hay-Adams or Willard InterContinental hotel Washington DC. Return ONLY JSON: {"rate":<integer USD or null>,"note":"<one sentence>"}`;
    const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:prompt}]})});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
    const match=text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim().match(/\{[\s\S]*\}/);
    if(!match)throw new Error("No JSON");
    const parsed=JSON.parse(match[0]);
    return{success:true,rate:parsed.rate,note:parsed.note};
  }catch(e){return{success:false,error:e.message};}
}

async function fetchCarRental(apiKey){
  try{
    const prompt=`Search for cheapest economy car rental per day at Reagan National Airport DCA Washington DC today. Return ONLY JSON: {"rate":<integer USD/day or null>,"note":"<one sentence>"}`;
    const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:prompt}]})});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
    const match=text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim().match(/\{[\s\S]*\}/);
    if(!match)throw new Error("No JSON");
    const parsed=JSON.parse(match[0]);
    return{success:true,rate:parsed.rate,note:parsed.note};
  }catch(e){return{success:false,error:e.message};}
}

function scoreSignals(readings){
  const scores={},alerts=[];
  for(const[key,bl]of Object.entries(BASELINES)){
    const val=readings[key];
    if(val===null||val===undefined)continue;
    const z=zScore(val,bl);
    scores[key]={value:val,z:+z.toFixed(2),label:sigmaLabel(z),weight:WEIGHTS[key]||0};
    if(Math.abs(z)>=2)alerts.push({signal:key,z:+z.toFixed(2),label:sigmaLabel(z),value:val});
  }
  const zVals=Object.values(scores).map(s=>Math.abs(s.z));
  const peakZ=zVals.length?Math.max(...zVals):0;
  const coveredWeight=Object.keys(scores).reduce((sum,k)=>sum+(WEIGHTS[k]||0),0);
  const coveragePct=Math.round((coveredWeight/TOTAL_WEIGHT)*100);
  const levelLabel=peakZ>=3?"CRITICAL":peakZ>=2?"ELEVATED":peakZ>=1?"WATCH":"NORMAL";
  return{scores,alerts,peakZ:+peakZ.toFixed(2),coveragePct,levelLabel};
}

module.exports={fetchAircraft,fetchFederalRegister,fetchTFRs,fetchHotelRate,fetchCarRental,scoreSignals,BASELINES,WEIGHTS};
