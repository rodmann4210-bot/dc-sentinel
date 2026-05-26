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
    return{success:true,total:states.length,military:mil.length}