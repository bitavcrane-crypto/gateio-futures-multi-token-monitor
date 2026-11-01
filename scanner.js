(() => {
"use strict";
const API="https://api.gateio.ws/api/v4/futures/usdt";
const $=id=>document.getElementById(id);
const n=v=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))?Number(v):null);
const fmt=(v,d=2)=>v===null||!Number.isFinite(v)?"N/A":new Intl.NumberFormat("uk-UA",{maximumFractionDigits:d}).format(v);
const pct=v=>v===null?"N/A":(v>0?"+":"")+fmt(v,2)+"%";
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cache=new Map();let running=false,lastScan=0;
async function api(path,params={}){const u=new URL(API+"/"+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u,{headers:{Accept:"application/json"},cache:"no-store"});if(!r.ok)throw Error("Gate API "+r.status);return r.json()}
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let x=a[0];for(let i=1;i<a.length;i++)x=a[i]*k+x*(1-k);return x}
function rsi(a,p=14){if(a.length<=p)return null;let g=0,l=0;for(let i=1;i<=p;i++){const d=a[i]-a[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}g/=p;l/=p;for(let i=p+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(p-1)+Math.max(d,0))/p;l=(l*(p-1)+Math.max(-d,0))/p}return l===0?(g===0?50:100):100-100/(1+g/l)}
function median(a){if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length/2)]}
function analyze(contract,ticker,candles,stats){
 const now=Math.floor(Date.now()/1000);
 const cs=(candles||[]).map(x=>({t:n(x.t),o:n(x.o),h:n(x.h),l:n(x.l),c:n(x.c),v:n(x.v)})).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t).filter(x=>x.t+3600<=now);
 if(cs.length<55)throw Error("Недостатньо 1h свічок");
 const close=cs.map(x=>x.c),price=n(ticker.last),e20=ema(close.slice(-100),20),e50=ema(close.slice(-100),50),r=rsi(close);
 if(price===null||!e20||!e50)throw Error("Немає ціни або індикаторів");
 const last=cs.at(-1),prev=cs.at(-2),window72=cs.slice(-72),window24=cs.slice(-24);
 const move72=window72.length>=60&&window72[0].o?(price/window72[0].o-1)*100:null;
 const move24=window24.length>=18&&window24[0].o?(price/window24[0].o-1)*100:null;
 const high=Math.max(...window72.map(x=>x.h)),low=Math.min(...window72.map(x=>x.l));
 const highDist=high?(price/high-1)*100:null,lowDist=low?(price/low-1)*100:null;
 const s=(stats||[]).filter(x=>n(x.time)!==null).sort((a,b)=>n(a.time)-n(b.time));
 const st=s.at(-1)||{},old=s.length>=25?s.at(-25):null;
 const oi=n(st.open_interest_usd),oldOi=n(old?.open_interest_usd),oiChange=oi!==null&&oldOi>0?(oi/oldOi-1)*100:null;
 const lsr=n(st.lsr_account),fund=n(ticker.funding_rate);
 const last24=s.slice(-24);
 const sumField=(field,fallback)=>{const vals=last24.map(x=>n(x[field])??(fallback?n(x[fallback]):null)).filter(x=>x!==null);return vals.length?vals.reduce((a,b)=>a+b,0):null};
 const longLiq=sumField("long_liq_usd_new","long_liq_usd"),shortLiq=sumField("short_liq_usd_new","short_liq_usd");
 const vols=window24.map(x=>x.v).filter(x=>x!==null&&x>0),volMed=median(vols.slice(0,-1)),volSpike=last.v!==null&&volMed>0?last.v/volMed:null;
 const body=last.c-last.o,range=Math.max(last.h-last.l,0),upperWick=range>0?(last.h-Math.max(last.o,last.c))/range:null,lowerWick=range>0?(Math.min(last.o,last.c)-last.l)/range:null;
 const rising=last.c>prev.c,falling=last.c<prev.c;
 const longLiqDominates=longLiq!==null&&shortLiq!==null&&longLiq>0&&longLiq>shortLiq*1.5;
 const shortLiqDominates=shortLiq!==null&&longLiq!==null&&shortLiq>0&&shortLiq>longLiq*1.5;
 const out={contract,price,move72,move24,e20,e50,rsi:r,oiChange,lsr,fund,longLiq,shortLiq,volSpike,upperWick,lowerWick,highDist,lowDist,lastClose:last.c};
 const bullish=[],bearish=[];
 const add=(arr,points,label)=>arr.push({points,label});
 // SHORT SQUEEZE: crowded shorts begin to cover; price recovers upward.
 if(lsr!==null&&lsr<0.85)add(bullish,18,"Перевага short-акаунтів: L/S нижче 0,85");
 if(fund!==null&&fund<0)add(bullish,12,"Від’ємний funding: шорти платять лонгам");
 if(shortLiqDominates)add(bullish,24,"Ліквідації шортів перевищують ліквідації лонгів у 1,5 раза");
 if(oiChange!==null&&oiChange<-5&&move24!==null&&move24>1)add(bullish,18,"Ціна зростає, OI падає: можливе закриття шортів");
 if(last.c>e20&&r!==null&&r>48&&rising)add(bullish,18,"Ціна повернулася вище EMA20, імпульс угору");
 if(move72!==null&&move72>3&&lowDist!==null&&lowDist>4)add(bullish,10,"Відскок від мінімуму за 72h понад 4%");
 if(volSpike!==null&&volSpike>=1.8&&rising)add(bullish,10,"Обсяг останньої 1h свічки ≥1,8 медіани");
 // LONG SQUEEZE: crowded longs start to unwind; price weakens downward.
 if(lsr!==null&&lsr>1.2)add(bearish,18,"Перевага long-акаунтів: L/S вище 1,2");
 if(fund!==null&&fund>0)add(bearish,12,"Додатний funding: лонги платять шортам");
 if(longLiqDominates)add(bearish,24,"Ліквідації лонгів перевищують ліквідації шортів у 1,5 раза");
 if(oiChange!==null&&oiChange<-5&&move24!==null&&move24<-1)add(bearish,18,"Ціна падає, OI падає: можливе закриття лонгів");
 if(last.c<e20&&r!==null&&r<52&&falling)add(bearish,18,"Ціна нижче EMA20, імпульс униз");
 if(move72!==null&&move72<-3&&highDist!==null&&highDist<-4)add(bearish,10,"Падіння від максимуму за 72h понад 4%");
 if(volSpike!==null&&volSpike>=1.8&&falling)add(bearish,10,"Обсяг останньої 1h свічки ≥1,8 медіани");
 const dataCoverage=[lsr,fund,oiChange,longLiq,shortLiq,volSpike].filter(x=>x!==null).length;
 const score=arr=>arr.reduce((z,x)=>z+x.points,0);
 const bscore=score(bullish),sscore=score(bearish);
 const bReady=bullish.length>=3&&bullish.some(x=>x.points>=18)&&dataCoverage>=3;
 const sReady=bearish.length>=3&&bearish.some(x=>x.points>=18)&&dataCoverage>=3;
 return {...out,bullish,bearish,bscore,sscore,dataCoverage,bReady,sReady,volume:n(ticker.volume_24h_quote)??n(ticker.volume_24h_usd),updated:Date.now()};
}
async function pool(items,limit,fn){let i=0;const workers=Array.from({length:limit},async()=>{while(i<items.length){const item=items[i++];try{await fn(item)}catch(e){cache.set(item.name,{error:e.message})}}});await Promise.all(workers)}
function card(x,side,rank){
 const score=side==="bull"?x.bscore:x.sscore,flags=side==="bull"?x.bullish:x.bearish;
 const color=side==="bull"?"bull":"bear";
 return '<article class="scan-card"><div class="scan-card-top"><b>'+rank+'. '+esc(x.contract)+'</b><span class="scan-score '+color+'">'+score+'/110</span></div><div class="scan-price">'+fmt(x.price,8)+' <small class="'+(x.move24>=0?"up":"down")+'">'+pct(x.move24)+' · 24h</small></div><div class="scan-mini">72h '+pct(x.move72)+' · RSI '+fmt(x.rsi,1)+' · OI '+pct(x.oiChange)+'</div><div class="scan-mini">Funding '+pct(x.fund===null?null:x.fund*100)+' · L/S '+fmt(x.lsr,2)+' · дані '+x.dataCoverage+'/6</div><ul>'+flags.map(f=>'<li>'+esc(f.label)+'</li>').join("")+'</ul><div class="scan-footer">Обсяг 24h: '+fmt(x.volume,0)+' USDT · <button type="button" data-add-scan="'+esc(x.contract)+'">Додати до моїх</button></div></article>';
}
function render(side){
 const arr=[...cache.values()].filter(x=>!x.error&&((side==="bull"&&x.bReady)||(side==="bear"&&x.sReady))).sort((a,b)=>(side==="bull"?b.bscore-a.bscore:a.sscore-b.sscore)).slice(0,5);
 const id=side==="bull"?"bullList":"bearList";
 $(id).innerHTML=arr.length?arr.map((x,i)=>card(x,side,i+1)).join(""):'<div class="scan-empty">Поки немає 3+ підтверджених ознак із достатнім покриттям даних. Слабкі кандидати не додаються.</div>';
 $(id).querySelectorAll("[data-add-scan]").forEach(b=>b.onclick=()=>{const input=$("contractInput");if(input){input.value=b.dataset.addScan;const form=$("addForm");form?.requestSubmit()}}); 
 $(side==="bull"?"bullCount":"bearCount").textContent=arr.length+" / 5";
}
function renderAll(){render("bull");render("bear")}
async function scan(){
 if(running)return;running=true;
 $("scannerStatus").textContent="Сканування ринку…";
 $("scanNow").disabled=true;
 try{
  const [contracts,tickers]=await Promise.all([api("contracts"),api("tickers")]);
  const active=new Set(contracts.filter(c=>c.status==="trading"&&!c.in_delisting&&c.name?.endsWith("_USDT")).map(c=>c.name));
  const rows=tickers.filter(t=>active.has(t.contract)&&n(t.last)>0).map(t=>({...t,turnover:n(t.volume_24h_quote)??n(t.volume_24h_usd)??0,move:Math.abs(n(t.change_percentage)??0)}));
  const liquid=rows.filter(t=>t.turnover>=50000);
  const byVol=[...liquid].sort((a,b)=>b.turnover-a.turnover).slice(0,24);
  const byMove=[...liquid].sort((a,b)=>b.move-a.move).slice(0,24);
  const chosen=[...new Map([...byVol,...byMove].map(t=>[t.contract,t])).values()].slice(0,40);
  if(!chosen.length)throw Error("Не знайдено активних контрактів із достатнім обсягом.");
  $("scanProgress").textContent="Перевірка "+chosen.length+" із "+rows.length+" активних контрактів";
  const fresh=new Map();
  await pool(chosen,4,async t=>{
   const [candles,stats]=await Promise.all([api("candlesticks",{contract:t.contract,interval:"1h",limit:100}),api("contract_stats",{contract:t.contract,interval:"1h",limit:72})]);
   const result=analyze(t.contract,t,candles,stats);fresh.set(t.contract,result);
   $("scanProgress").textContent="Оброблено "+fresh.size+" / "+chosen.length;
  });
  cache.clear();for(const [k,v] of fresh)cache.set(k,v);
  renderAll();lastScan=Date.now();
  $("scannerStatus").textContent="Оновлено "+new Date(lastScan).toLocaleTimeString("uk-UA");
  $("scanProgress").textContent="Попередній відбір: 24 за обсягом + 24 за рухом · аналізовано "+fresh.size+" контрактів";
 }catch(e){$("scannerStatus").textContent="Помилка сканера: "+e.message}
 finally{running=false;$("scanNow").disabled=false}
}
function init(){if(!$("scanNow"))return;$("scanNow").onclick=scan;scan();setInterval(scan,180000)}
init();
})();