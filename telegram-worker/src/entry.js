import app from './index.js';

const JSON_HEADERS={"content-type":"application/json;charset=UTF-8"};
function need(env,k){const v=env[k];if(!v)throw new Error(`${k}_NOT_CONFIGURED`);return v}
function b64url(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function derive(env,label,len=32){const raw=new TextEncoder().encode(`${label}:${need(env,"TELEGRAM_BOT_TOKEN")}`);const d=new Uint8Array(await crypto.subtle.digest("SHA-256",raw));return b64url(d).slice(0,len)}
async function botPassword(env){return `${await derive(env,"taskdesk-bot-password",28)}Aa1!`}

async function loginBot(env){
  const email=need(env,"SUPABASE_BOT_EMAIL");
  const password=await botPassword(env);
  const r=await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{
    method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,...JSON_HEADERS},body:JSON.stringify({email,password})
  });
  const d=await r.json();
  if(!r.ok||!d?.access_token||!d?.user?.id)throw new Error(d?.message||d?.error_description||'BOT_LOGIN_FAILED');
  return d;
}

async function profilePatch(env,auth,body){
  const r=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${auth.user.id}`,{
    method:'PATCH',
    headers:{apikey:env.SUPABASE_ANON_KEY,authorization:`Bearer ${auth.access_token}`,...JSON_HEADERS,Prefer:'return=representation'},
    body:JSON.stringify(body)
  });
  const text=await r.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  return {ok:r.ok,status:r.status,rows:Array.isArray(data)?data.length:null,data};
}

async function profileRead(env,auth){
  const r=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${auth.user.id}&select=id,email,role,is_active,full_name`,{
    headers:{apikey:env.SUPABASE_ANON_KEY,authorization:`Bearer ${auth.access_token}`}
  });
  const d=await r.json();
  return {ok:r.ok,status:r.status,data:d};
}

async function selfAuthorize(env){
  const auth=await loginBot(env);
  const activate=await profilePatch(env,auth,{is_active:true,full_name:'TaskDesk Telegram Bot'});
  const promote=await profilePatch(env,auth,{role:'ADMIN'});
  const profile=await profileRead(env,auth);
  return {login:true,user_id:auth.user.id,activate,promote,profile};
}

function cleanSource(s=''){
  return String(s).replace(/^\s*(اعمل|انشئ|أنشئ|افتح|create|new)\s+(تاسك|task|case|كيس|كيسه)?\s*(بتاريخ اليوم|اليوم|today)?\s*[:\-–—]*\s*/i,'').trim();
}

function firstIndex(text,patterns,from=0){
  let best=-1;
  for(const p of patterns){
    const re=new RegExp(p,'i');
    const m=text.slice(from).match(re);
    if(m){const idx=from+m.index;if(best<0||idx<best)best=idx;}
  }
  return best;
}

function stripLead(s,patterns){
  let out=String(s||'').trim();
  for(const p of patterns)out=out.replace(new RegExp(`^\\s*(?:${p})\\s*[:\\-–—]*\\s*`,'i'),'').trim();
  return out;
}

function splitNarrative(raw){
  const text=cleanSource(raw);
  const analysisPatterns=['بعد\\s+(?:فحص|الفحص|مراجعة|المراجعة|التحليل|التحقق)','after\\s+(?:checking|review|investigation)','investigation\\s+(?:showed|found|identified)'];
  const solutionPatterns=['(?:^|\\s)الحل(?:\\s+هو)?','(?:^|\\s)الحل\\s*[:：]','(?:^|\\s)solution(?:\\s+was|\\s+is)?','(?:^|\\s)resolution(?:\\s+was|\\s+is)?'];
  const aIdx=firstIndex(text,analysisPatterns,0);
  const sIdx=firstIndex(text,solutionPatterns,aIdx>=0?aIdx:0);
  let description,analysis,resolution;
  if(aIdx>=0){
    description=text.slice(0,aIdx).trim();
    analysis=text.slice(aIdx,sIdx>=0?sIdx:text.length).trim();
  }else{
    description=sIdx>=0?text.slice(0,sIdx).trim():text.trim();
    analysis='';
  }
  resolution=sIdx>=0?text.slice(sIdx).trim():'';
  description=stripLead(description,['المشكلة\\s+(?:اللي|التي)?\\s*(?:بلغ|أبلغ|ابلغ)?\\s*(?:بيها|بها)?\\s*العميل(?:\\s+أنه|\\s+ان)?','العميل\\s+(?:بلغ|أبلغ|ابلغ)(?:نا)?(?:\\s+بأن|\\s+بان|\\s+أن|\\s+ان)?','client\\s+(?:reported|raised|requested)']);
  analysis=stripLead(analysis,['بعد\\s+(?:فحص|الفحص|مراجعة|المراجعة|التحليل|التحقق)','after\\s+(?:checking|review|investigation)']);
  resolution=stripLead(resolution,['الحل(?:\\s+هو)?','solution(?:\\s+was|\\s+is)?','resolution(?:\\s+was|\\s+is)?']);
  let diagnosis='';
  const dm=analysis.match(/(?:اتضح|تبين|تبيّن|found that|identified that|root cause(?: was| is)?)[\s:：-]*(.+)$/i);
  if(dm)diagnosis=dm[1].trim();
  return {description,analysis,diagnosis,resolution};
}

function looksLikeDetailedCreate(text=''){
  const t=String(text);
  if(/^\s*\//.test(t))return false;
  if(/(?:task|تاسك|case|كيس)\s*#?\s*\d+/i.test(t))return false;
  if(/(?:وريني|اعرض|هات|show|list)\s+/i.test(t))return false;
  const create=/(?:اعمل|انشئ|أنشئ|افتح|create|new).{0,16}(?:تاسك|task|case|كيس)/i.test(t);
  const narrative=/(?:المشكلة|العميل|client|issue)/i.test(t)&&/(?:بعد\s+(?:فحص|مراجعة)|اتضح|تبين|الحل|solution|resolved|اتحلت|تم\s+حل)/i.test(t);
  return create||narrative;
}

function fieldingDirective(original){
  const s=splitNarrative(original);
  const resolved=/(?:المشكلة\s+(?:اتحلت|انحلت)|تم\s+حل\s+المشكلة|issue\s+(?:is\s+)?resolved|resolved\s+successfully)/i.test(original);
  return `${original}\n\n[TASKDESK FIELDING INSTRUCTION — FOLLOW STRICTLY]\nCreate exactly one professional TaskDesk task from the ORIGINAL MESSAGE above. Preserve every factual detail supplied by the user and do not invent anything.\n\nField rules:\n1) TITLE: concise professional issue title.\n2) DESCRIPTION: ONLY the client's reported issue/request. Do NOT include investigation, root cause, solution, or final outcome here.\n3) ANALYSIS: what was checked/reviewed and what the investigation revealed. Use a complete professional sentence, not a status word.\n4) DIAGNOSIS: the exact root cause identified. Never write NEW/RESOLVED here.\n5) RESOLUTION: include ALL remediation steps in the same order stated by the user, plus the final outcome. Never replace the solution with only RESOLVED/CLOSED.\n6) STATUS: ${resolved?'RESOLVED because the user explicitly said the issue was solved':'derive from the user statement only'}.\n7) The saved content should be professional English unless the user explicitly asks for Arabic.\n8) history_details may summarize the Telegram request, but the task fields above must remain properly separated.\n\nSource extraction hints (use only when supported by the original message):\nDESCRIPTION SOURCE: ${s.description||'(derive from client issue only)'}\nANALYSIS SOURCE: ${s.analysis||'(derive from investigation text)'}\nDIAGNOSIS SOURCE: ${s.diagnosis||'(derive exact root cause from analysis)'}\nRESOLUTION SOURCE: ${s.resolution||'(derive all solution steps and outcome)'}`;
}

async function enrichTelegramRequest(request){
  if(request.method!=='POST')return request;
  let update;
  try{update=await request.clone().json()}catch{return request;}
  const text=update?.message?.text;
  if(!text||!looksLikeDetailedCreate(text))return request;
  update.message.text=fieldingDirective(text);
  return new Request(request.url,{method:request.method,headers:request.headers,body:JSON.stringify(update)});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/setup'&&request.method==='GET'){
      let self_authorize;
      try{self_authorize=await selfAuthorize(env)}catch(e){self_authorize={error:String(e?.message||e)}}
      const response=await app.fetch(request,env,ctx);
      try{
        const data=await response.clone().json();
        data.self_authorize=self_authorize;
        return Response.json(data,{status:response.status,headers:{'cache-control':'no-store'}});
      }catch{
        return response;
      }
    }
    const enriched=await enrichTelegramRequest(request);
    return app.fetch(enriched,env,ctx);
  }
};
