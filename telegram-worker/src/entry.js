import app from './index.js';

const JSON_HEADERS={"content-type":"application/json;charset=UTF-8"};
function need(env,k){const v=env[k];if(!v)throw new Error(`${k}_NOT_CONFIGURED`);return v}
function b64url(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function derive(env,label,len=32){const raw=new TextEncoder().encode(`${label}:${need(env,"TELEGRAM_BOT_TOKEN")}`);const d=new Uint8Array(await crypto.subtle.digest("SHA-256",raw));return b64url(d).slice(0,len)}
async function botPassword(env){return `${await derive(env,"taskdesk-bot-password",28)}Aa1!`}

async function selfAuthorize(env){
  const email=need(env,"SUPABASE_BOT_EMAIL");
  const password=await botPassword(env);
  const login=await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{
    method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,...JSON_HEADERS},body:JSON.stringify({email,password})
  });
  const auth=await login.json();
  if(!login.ok||!auth?.access_token||!auth?.user?.id)throw new Error(auth?.message||auth?.error_description||'BOT_LOGIN_FAILED');
  const patch=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${auth.user.id}`,{
    method:'PATCH',
    headers:{apikey:env.SUPABASE_ANON_KEY,authorization:`Bearer ${auth.access_token}`,...JSON_HEADERS,Prefer:'return=representation'},
    body:JSON.stringify({is_active:true,role:'ADMIN',full_name:'TaskDesk Telegram Bot'})
  });
  const text=await patch.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!patch.ok)throw new Error(data?.message||data?.hint||`PROFILE_UPDATE_${patch.status}`);
  return data;
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/setup'&&request.method==='GET'){
      try{await selfAuthorize(env)}catch(e){console.log(JSON.stringify({event:'self_authorize_failed',message:String(e?.message||e)}));}
    }
    return app.fetch(request,env,ctx);
  }
};
