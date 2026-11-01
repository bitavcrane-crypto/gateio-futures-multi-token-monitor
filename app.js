(() => {
"use strict";
const API="https://api.gateio.ws/api/v4/futures/usdt",KEY="gate-futures-monitor.contracts.v1",MAX=15;
const $=id=>document.getElementById(id), state={tokens:[],contracts:[],data:new Map(),busy:false};
const num=v=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))?Number(v):null);
const fmt=(v,d=4)=>v===null||!Number.isFinite(v)?"N/A":new Intl.NumberFormat("en-US",{maximumFractionDigits:d}).format(v);
const pct=(v,d=2)=>v===null?"N/A":(v>0?"+":"")+fmt(v,d)+"%";
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function save(){localStorage.setItem(KEY,JSON.stringify(state.tokens))}
function load(){try{const a=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(a))return [...new Set(a.filter(x=>typeof x==="string").map(x=>x.toUpperCase()))].slice(0,MAX)}catch(e){}return ["AIN_USDT"]}
function endpoint(path,p={}){const u=new URL(API+"/"+path);Object.entries(p).forEach(([k,v])=>{if(v!==undefined&&v!==null)u.searchParams.set(k,v)});return u}
async function api(path,p={}){const r=await fetch(endpoint(path,p),{headers:{Accept:"application/json"},cache:"no-store"});if(!r.ok){let m=r.status+" "+r.statusText;try{const e=await r.json();m=e.message||e.label||m}catch(e){}throw Error(m)}return r.json()}
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let x=a[0];for(let i=1;i<a.length;i++)x=a[i]*k+x*(1-k);return x}
function rsi(a,p=14){if(a.length<=p)return null;let g=0,l=0;for(let i=1;i<=p;i++){let d=a[i]-a[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}g/=p;l/=p;for(let i=p+1;i<a.length;i++){let d=a[i]-a[i-1];g=(g*(p-1)+Math.max(d,0))/p;l=(l*(p-1)+Math.max(-d,0))/p}return l===0?(g===0?50:100):g===0?0:100-100/(1+g/l)}
function atr(a,p=14){const tr=[];for(let i=1;i<a.length;i++){const c=a[i],pc=a[i-1].c;tr.push(Math.max(c.h-c.l,Math.abs(c.h-pc),Math.abs(c.l-pc)))}return tr.length<p?null:tr.slice(-p).reduce((x,y)=>x+y,0)/p}
function analyze(raw,stats,ticker,book,funding){
 const candles=raw.map(c=>({t:num(c.t),o:num(c.o),h:num(c.h),l:num(c.l),c:num(c.c)})).filter(c=>[c.t,c.o,c.h,c.l,c.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
 const closed=candles.filter(c=>c.t+3600<=Math.floor(Date.now()/1000)),closes=closed.map(c=>c.c),price=num(ticker.last);
 if(closed.length<55||price===null)throw Error("Недостатньо коректних свічок або ціни.");
 const e20=ema(closes.slice(-100),20),e50=ema(closes.slice(-100),50),rv=rsi(closes),av=atr(closed),recent=closed.slice(-72);
 const high=Math.max(...recent.map(c=>c.h)),low=Math.min(...recent.map(c=>c.l)),move=recent[0].o?(price/recent[0].o-1)*100:null;
 const ss=(stats||[]).slice().sort((a,b)=>(num(a.time)||0)-(num(b.time)||0)),last=ss.at(-1)||{},old=ss.length>24?ss.at(-25):null;
 const oi=num(last.open_interest_usd),oldOi=num(old?.open_interest_usd),oiChange=oi!==null&&oldOi!==null&&oldOi>0?(oi/oldOi-1)*100:null,lsr=num(last.lsr_account);
 const longValues=ss.slice(-24).map(x=>num(x.long_liq_usd_new)??num(x.long_liq_usd)).filter(Number.isFinite),shortValues=ss.slice(-24).map(x=>num(x.short_liq_usd_new)??num(x.short_liq_usd)).filter(Number.isFinite),longLiq=longValues.length?longValues.reduce((s,x)=>s+x,0):null,shortLiq=shortValues.length?shortValues.reduce((s,x)=>s+x,0):null;
 const rates=(funding||[]).map(x=>num(x.r)).filter(Number.isFinite),fr=rates.length?rates.at(-1):num(ticker.funding_rate);
 const bids=(book.bids||[]).map(x=>[num(x.p),num(x.s)]).filter(x=>x.every(Number.isFinite)),asks=(book.asks||[]).map(x=>[num(x.p),num(x.s)]).filter(x=>x.every(Number.isFinite));
 const bid=bids.reduce((s,[p,q])=>s+(p>=price*.97?p*q:0),0),ask=asks.reduce((s,[p,q])=>s+(p<=price*1.03?p*q:0),0),depth=bid>0?ask/bid:null,flags=[],warnings=[];
 if(move>20&&price<high*.97)flags.push("Після сильного руху за 72h ціна відійшла на 3%+ від максимуму.");
 if(price<e20&&e20<e50)flags.push("Ведмежа структура: ціна нижче EMA20, EMA20 нижче EMA50.");
 if(rv!==null&&rv>70)flags.push("RSI вище 70: перекупленість, не самостійний сигнал.");
 if(lsr!==null&&lsr>1.5)flags.push("LSR акаунтів вище 1.5: переважають акаунти з лонговими позиціями.");
 if(fr!==null&&fr>0.0003)flags.push("Позитивний Funding понад 0.03% за період фінансування.");
 if(longLiq>0&&longLiq>shortLiq*2)flags.push("Ліквідації лонгів переважають шорти більш ніж удвічі.");
 if(depth!==null&&depth>1.5)flags.push("Ask depth перевищує Bid depth у зоні ±3%.");
 if(move>50&&fr!==null&&fr<0)warnings.push("Сильний рух угору при від'ємному Funding: ризик шорт-сквізу.");
 if(oiChange!==null&&oiChange>20&&price>e20)warnings.push("OI зріс понад 20% за доступні 24 статистичні точки при ціні вище EMA20.");
 if(bid===0||!asks.length)warnings.push("Книга ордерів неповна або порожня в межах доступних рівнів.");
 if(oiChange===null)warnings.push("Зміна OI недоступна: недостатньо історичних точок.");
 if(lsr===null)warnings.push("LSR акаунтів недоступний.");if(fr===null)warnings.push("Funding недоступний.");
 const score=flags.length;let status="NO TRADE",kind="";
 if(move>25&&oiChange!==null&&oiChange>10&&price>e20){status="PUMP / SQUEEZE RISK";kind="pump"}
 else if(price<e20&&e20<e50&&score>=3&&warnings.length<3){status="BEARISH SETUP · CHECK CONFIRMATION";kind="short"}
 else if(score>=2){status="POTENTIAL SHORT";kind="potential"}
 else if(price>e20&&e20>e50){status="LONG PRESSURE";kind="long"}
 const vol=av??price*.03;
 return {price,change:num(ticker.change_percentage),volume:num(ticker.volume_24h_quote)??num(ticker.volume_24h_usd),e20,e50,rsi:rv,atr:av,move,high,low,lsr,oi,oiChange,longLiq,shortLiq,funding:fr,bid,ask,depth,status,kind,score,flags,warnings,levels:{invalid:high+.5*vol,zoneLow:Math.max(e20,high*.97),zoneHigh:high,t1:price-1.5*vol,t2:price-3*vol,support:low},closedAt:closed.at(-1)?.t};
}
async function fetchCoin(contract){
 const jobs=await Promise.allSettled([api("tickers",{contract}),api("candlesticks",{contract,interval:"1h",limit:200}),api("contract_stats",{contract,interval:"1h",limit:72}),api("order_book",{contract,limit:50,interval:"0"}),api("funding_rate",{contract,limit:3})]);
 const keys=["ticker","candles","stats","book","funding"],d={};jobs.forEach((x,i)=>{if(x.status==="fulfilled")d[keys[i]]=x.value;else d[keys[i]+"Error"]=x.reason?.message||"API error"});
 const ticker=Array.isArray(d.ticker)?d.ticker[0]:d.ticker;if(!ticker)throw Error(d.tickerError||"Ticker не отримано");if(!Array.isArray(d.candles))throw Error(d.candlesError||"Свічки не отримано");
 return {a:analyze(d.candles,Array.isArray(d.stats)?d.stats:[],ticker,d.book||{},Array.isArray(d.funding)?d.funding:[]),errors:keys.filter(k=>d[k+"Error"]).map(k=>k+": "+d[k+"Error"]),updated:Date.now()};
}
function connection(mode){const e=$("connection");e.className="connection "+mode;e.lastChild.textContent=mode==="ok"?" ДАНІ ОТРИМАНО":mode==="bad"?" ПОМИЛКА API":" ОНОВЛЕННЯ"}
async function refreshOne(t){try{state.data.set(t,await fetchCoin(t))}catch(e){state.data.set(t,{error:e.message})}renderCards()}
async function refreshAll(){if(state.busy||!state.tokens.length)return;state.busy=true;$("refreshAll").disabled=true;connection("");try{for(const t of state.tokens)await refreshOne(t);connection(state.tokens.some(t=>state.data.get(t)?.a)?"ok":"bad");$("lastUpdated").textContent="Оновлено: "+new Date().toLocaleTimeString("uk-UA")}finally{state.busy=false;$("refreshAll").disabled=false}}
function chips(){$("tokenCount").textContent=state.tokens.length+" / "+MAX;$("tokenChips").innerHTML=state.tokens.map(t=>'<span class="chip">'+esc(t)+'<button data-remove="'+esc(t)+'" aria-label="Видалити">×</button></span>').join("");$("tokenChips").querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{state.tokens=state.tokens.filter(x=>x!==b.dataset.remove);state.data.delete(b.dataset.remove);save();chips();renderCards()})}
function add(raw){let t=raw.trim().toUpperCase().replace(/\s+/g,"");if(!t)return;if(!t.includes("_"))t+="_USDT";if(!/^[A-Z0-9]{1,30}_USDT$/.test(t)){$("formMessage").textContent="Формат: AIN або AIN_USDT";return}if(state.tokens.includes(t)){$("formMessage").textContent="Контракт вже у списку.";return}if(state.tokens.length>=MAX){$("formMessage").textContent="Досягнуто ліміт 15 контрактів.";return}if(state.contracts.length&&!state.contracts.includes(t)){$("formMessage").textContent="Активний контракт не знайдений на Gate.io.";return}state.tokens.push(t);save();chips();$("contractInput").value="";$("formMessage").textContent=t+" додано.";refreshOne(t)}
function suggestions(v){const q=v.trim().toUpperCase().replace(/_USDT$/,""),box=$("suggestions");if(!q||!state.contracts.length){box.classList.add("hidden");return}const a=state.contracts.filter(x=>x.replace("_USDT","").includes(q)&&!state.tokens.includes(x)).slice(0,8);if(!a.length){box.classList.add("hidden");return}box.innerHTML=a.map(x=>'<button type="button" data-pick="'+esc(x)+'">'+esc(x)+' <small>USDT perpetual</small></button>').join("");box.classList.remove("hidden");box.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{$("contractInput").value=b.dataset.pick;box.classList.add("hidden")})}
function metric(l,v){return '<div class="metric"><label>'+l+'</label><strong>'+v+'</strong></div>'}
function detail(l,v){return '<div class="detail-item"><span>'+l+'</span><b>'+v+'</b></div>'}
function card(t){const d=state.data.get(t);if(!d)return '<article class="coin-card"><div class="coin-head"><b>'+esc(t)+'</b><span class="status">LOADING</span></div></article>';if(d.error)return '<article class="coin-card"><div class="coin-head"><b>'+esc(t)+'</b><span class="status">DATA ERROR</span></div><div class="error">'+esc(d.error)+'</div><div class="coin-foot"><button class="details-btn" data-retry="'+esc(t)+'">Повторити</button></div></article>';
 const a=d.a,cl=a.change>0?"up":a.change<0?"down":"",htmlStart='<article class="coin-card"><div class="coin-head"><div><div class="coin-name">'+esc(t)+'</div><div class="coin-sub">Gate.io USDT perpetual · 1h</div></div><span class="status '+a.kind+'">'+esc(a.status)+'</span></div><div class="price-line"><b class="price">'+fmt(a.price,8)+'</b><span class="change '+cl+'">'+pct(a.change)+'</span></div><div class="metric-grid">';
 let h=htmlStart+metric("RSI 14",fmt(a.rsi,1))+metric("EMA 20 / 50",fmt(a.e20,6)+" / "+fmt(a.e50,6))+metric("Funding",a.funding===null?"N/A":pct(a.funding*100,4))+metric("OI change",pct(a.oiChange))+metric("L/S accounts",fmt(a.lsr,2))+metric("Ask / Bid depth",a.depth===null?"N/A":fmt(a.depth,2)+"×")+metric("Volume 24h",a.volume===null?"N/A":fmt(a.volume,0)+" USDT")+metric("72h move",pct(a.move))+metric("ATR 14",fmt(a.atr,6))+'</div><div class="coin-foot"><span class="score">Bearish-ознаки: <b>'+a.score+'/7</b></span><button class="details-btn" data-detail="'+esc(t)+'">Деталі та рівні⌄</button></div><div class="details" id="detail-'+esc(t)+'" hidden><div class="detail-title">РОЗРАХУНКОВІ РІВНІ · НЕ ОРДЕРИ</div><div class="detail-grid">';
 h+=detail("Зона · низ",fmt(a.levels.zoneLow,8))+detail("Зона · верх",fmt(a.levels.zoneHigh,8))+detail("Інвалідація вище",fmt(a.levels.invalid,8))+detail("Орієнтир 1 · 1.5 ATR",fmt(a.levels.t1,8))+detail("Орієнтир 2 · 3 ATR",fmt(a.levels.t2,8))+detail("Підтримка 72h",fmt(a.levels.support,8))+detail("OI, USD",fmt(a.oi,0))+detail("Bid depth ±3%",fmt(a.bid,0)+" USDT")+detail("Ask depth ±3%",fmt(a.ask,0)+" USDT")+detail("Ліквідації лонгів · 24 точки",fmt(a.longLiq,0)+" USDT")+detail("Ліквідації шортів · 24 точки",fmt(a.shortLiq,0)+" USDT")+'</div><div class="detail-title">ПОЯСНЕННЯ СТАТУСУ</div><ul class="notes">'+(a.flags.length?a.flags:["Bearish-ознак недостатньо."]).map(x=>"<li>"+esc(x)+"</li>").join("")+'</ul><div class="detail-title">ПОПЕРЕДЖЕННЯ / ВІДСУТНІ ДАНІ</div><ul class="notes">'+(a.warnings.length?a.warnings:["Немає додаткових попереджень."]).map(x=>"<li>"+esc(x)+"</li>").join("")+'</ul><small class="coin-sub">Остання закрита 1h свічка: '+(a.closedAt?new Date(a.closedAt*1000).toLocaleString("uk-UA"):"N/A")+'. Оновлено: '+new Date(d.updated).toLocaleTimeString("uk-UA")+'</small></div>';
 if(d.errors.length)h+='<div class="error">Частина джерел недоступна: '+esc(d.errors.join(" · "))+'</div>';return h+'</article>'}
function renderCards(){let a=state.tokens.slice(),s=$("sortSelect").value;a.sort((x,y)=>{let p=state.data.get(x)?.a,q=state.data.get(y)?.a;if(s==="symbol")return x.localeCompare(y);if(!p)return 1;if(!q)return -1;if(s==="change")return(q.change??-Infinity)-(p.change??-Infinity);if(s==="volume")return(q.volume??-Infinity)-(p.volume??-Infinity);return q.score-p.score});$("cards").innerHTML=a.length?a.map(card).join(""):'<div class="empty panel">Список порожній. Додай перший контракт.</div>';$("cards").querySelectorAll("[data-detail]").forEach(b=>b.onclick=()=>{let e=$("detail-"+b.dataset.detail);e.hidden=!e.hidden;b.textContent=e.hidden?"Деталі та рівні⌄":"Згорнути⌃"});$("cards").querySelectorAll("[data-retry]").forEach(b=>b.onclick=()=>refreshOne(b.dataset.retry))}
async function init(){state.tokens=load();chips();renderCards();$("addForm").onsubmit=e=>{e.preventDefault();add($("contractInput").value)};$("contractInput").oninput=e=>suggestions(e.target.value);$("sortSelect").onchange=renderCards;$("refreshAll").onclick=refreshAll;document.addEventListener("click",e=>{if(!e.target.closest(".input-wrap"))$("suggestions").classList.add("hidden")});try{let c=await api("contracts");state.contracts=c.filter(x=>x.status==="trading"&&!x.in_delisting).map(x=>x.name).filter(x=>x&&x.endsWith("_USDT"))}catch(e){$("formMessage").textContent="Каталог Gate.io не завантажено: "+e.message+". Можлива мережева/CORS-помилка.";connection("bad")}await refreshAll();setInterval(refreshAll,60000)}
init();
})();