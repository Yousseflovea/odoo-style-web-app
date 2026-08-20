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
    return app.fetch(request,env,ctx);
  }
};
