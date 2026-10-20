// GO BURN | Supabase Edge Function | Deno
// Deploy with JWT verification disabled ONLY for this public endpoint.
// Authentication: one-time access key for customer requests, HMAC signature for Mercado Pago webhooks.
// NEVER embed service role / Mercado Pago keys in the static frontend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const PLANS: Record<string,{title:string,cents:number}> = {
  essencial:{title:"Diagnóstico Essencial",cents:29700},
  estrategico:{title:"Diagnóstico Estratégico",cents:89700},
  blueprint:{title:"Blueprint Tecnológico",cents:199700}
};
const env=(key:string)=>Deno.env.get(key)||"";
const URL_BASE=env("SUPABASE_URL"), ROLE=env("SUPABASE_SERVICE_ROLE_KEY");
const MP_TOKEN=env("MERCADOPAGO_ACCESS_TOKEN"), MP_SECRET=env("MERCADOPAGO_WEBHOOK_SECRET");
const SITE=env("GOBURN_SITE_URL")||"https://radar.wodburn.com.br/goburn/";
const ALLOWED=env("GOBURN_ALLOWED_ORIGIN")||"https://radar.wodburn.com.br";
const API_URL=env("GOBURN_API_URL");
const db=createClient(URL_BASE||"https://example.invalid",ROLE||"missing",{auth:{persistSession:false,autoRefreshToken:false}});
const respond=(body:unknown,status=200,origin="")=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":origin===ALLOWED?origin:ALLOWED,"access-control-allow-headers":"content-type,apikey,authorization","access-control-allow-methods":"POST, OPTIONS","vary":"Origin"}});
const failure=(message:string,status=400,origin="")=>respond({ok:false,error:message},status,origin);
const validString=(x:unknown,min=1,max=120)=>typeof x==="string"&&x.trim().length>=min&&x.trim().length<=max;
const isUuid=(s:unknown)=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer)).map(v=>v.toString(16).padStart(2,"0")).join("");
async function sha256(secret:string){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret)));}
function token(){const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("");}
function cleanText(data:unknown,max=2500){return typeof data==="string"?data.trim().slice(0,max):"";}
function compareHash(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function authorizedOrder(payload:any){
  if(!isUuid(payload?.order_id)||!validString(payload?.access_key,64,64))return null;
  const {data,error}=await db.from("goburn_orders").select("id,plan,status,access_token_hash,amount_cents").eq("id",payload.order_id).maybeSingle();
  if(error||!data||!compareHash(await sha256(payload.access_key),data.access_token_hash))return null;
  return data;
}
function priority(answers:Record<string,string>){
  let n=20;
  if(answers.decision==="Eu decido")n+=18;else if(answers.decision==="Eu e outros sócios")n+=12;
  if(answers.timeline==="Imediatamente")n+=18;else if(answers.timeline==="Em até 30 dias")n+=14;else if(answers.timeline==="Entre 1 e 3 meses")n+=8;
  if(answers.budget==="Acima de R$ 100 mil")n+=15;else if(answers.budget==="R$ 30 mil a R$ 100 mil")n+=13;else if(answers.budget==="R$ 10 mil a R$ 30 mil")n+=10;else if(answers.budget==="R$ 3 mil a R$ 10 mil")n+=7;
  if(answers.frequency==="Várias vezes ao dia"||answers.frequency==="Diariamente")n+=8;
  if(answers.manual_hours==="Mais de 30 horas")n+=10;else if(answers.manual_hours==="11 a 30 horas")n+=7;
  return Math.max(0,Math.min(n,100));
}
const solutions:Record<string,string>={sistema:"Sistema / CRM / ERP",saas:"SaaS multiempresa",app:"Aplicativo / PWA",ia:"Automação / IA",dados:"BI e dashboard",site:"Plataforma comercial",descoberta:"Discovery de produto"};
async function checkout(p:any,origin:string){
  if(!MP_TOKEN||!MP_SECRET||!API_URL||!ROLE||!URL_BASE)return failure("Pagamento indisponível: configuração financeira pendente.",503,origin);
  const chosen=PLANS[String(p?.plan||"")];
  if(!chosen||!validString(p?.name,3,120)||!validString(p?.company,2,120)||!validString(p?.email,5,180)||!/^\S+@\S+\.\S+$/.test(p.email.trim())||!p.terms_accepted)return failure("Confira os dados de contratação.",400,origin);
  if(p.phone && !validString(p.phone,7,30))return failure("Telefone inválido.",400,origin);
  const email=p.email.trim().toLowerCase();
  // Proteção inicial contra tentativas repetidas; adicionar Turnstile/WAF antes de escala.
  const since=new Date(Date.now()-60*60*1000).toISOString();
  const {count}=await db.from("goburn_orders").select("id",{head:true,count:"exact"}).eq("customer_email",email).gte("created_at",since);
  if((count??0)>=4)return failure("Muitas tentativas recentes. Aguarde antes de tentar novamente.",429,origin);
  const access=token(),hash=await sha256(access);
  const {data:order,error:insertError}=await db.from("goburn_orders").insert({
    plan:p.plan,amount_cents:chosen.cents,customer_name:p.name.trim(),customer_email:email,
    customer_company:p.company.trim(),customer_phone:cleanText(p.phone,30)||null,
    terms_accepted_at:new Date().toISOString(),access_token_hash:hash
  }).select("id").single();
  if(insertError||!order)return failure("Não foi possível iniciar a contratação.",503,origin);
  const pref={
    items:[{id:"goburn-"+p.plan,title:"GO BURN — "+chosen.title,description:"Análise profissional contratada separadamente do desenvolvimento",quantity:1,currency_id:"BRL",unit_price:chosen.cents/100}],
    payer:{name:p.name.trim(),email},
    external_reference:order.id,
    notification_url:API_URL+"?action=webhook",
    back_urls:{success:SITE,pending:SITE,failure:SITE},
    auto_return:"approved",
    statement_descriptor:"GO BURN"
  };
  const mp=await fetch("https://api.mercadopago.com/checkout/preferences",{method:"POST",
    headers:{"Authorization":"Bearer "+MP_TOKEN,"Content-Type":"application/json","X-Idempotency-Key":order.id},body:JSON.stringify(pref)});
  const result=await mp.json().catch(()=>({}));
  if(!mp.ok||typeof result.init_point!=="string"||!result.init_point.startsWith("https://")){
    // Persistência de pedido pendente para conciliação; jamais retornar link de checkout falso.
    return failure("A operadora não conseguiu criar o pagamento. Tente novamente mais tarde.",502,origin);
  }
  await db.from("goburn_orders").update({preference_id:String(result.id||"")||null}).eq("id",order.id).eq("status","pending");
  return respond({ok:true,order_id:order.id,access_key:access,checkout_url:result.init_point},200,origin);
}
async function status(p:any,origin:string){
  const order=await authorizedOrder(p);
  if(!order)return failure("Identificação inválida. Recupere seu pedido com o suporte.",401,origin);
  let protocol:string|null=null;
  if(order.status==="submitted"){const {data}=await db.from("goburn_cases").select("protocol").eq("order_id",order.id).maybeSingle();protocol=data?.protocol||null;}
  return respond({ok:true,status:order.status,plan:order.plan,protocol},200,origin);
}
const mandatory:Record<string,[number,number]>={
 company:[2,120],sector:[2,80],team_size:[2,40],stage_business:[2,60],
 problem:[35,2500],current_process:[20,1800],frequency:[2,60],manual_hours:[2,60],impact:[2,80],
 solution:[2,40],tools:[3,1200],outcome:[20,1600],timeline:[2,80],budget:[2,80],decision:[2,80]
};
const optional:Record<string,number>={site:200,integrations:1200,constraints:1200};
async function submit(p:any,origin:string){
  const order=await authorizedOrder(p);
  if(!order)return failure("Sessão inválida.",401,origin);
  if(order.status==="submitted")return failure("Este diagnóstico já foi enviado.",409,origin);
  if(order.status!=="paid")return failure("O pagamento ainda não foi confirmado.",402,origin);
  const raw=p?.answers;if(!raw||typeof raw!=="object"||Array.isArray(raw)||raw.truthful!==true||raw.privacy!==true)return failure("Confirme as informações e a privacidade.",400,origin);
  const answers:Record<string,string|boolean>={};
  for(const [key,[min,max]] of Object.entries(mandatory)){if(!validString(raw[key],min,max))return failure("Preencha corretamente o campo "+key+".",400,origin);answers[key]=raw[key].trim();}
  for(const [key,max] of Object.entries(optional)){answers[key]=cleanText(raw[key],max);}
  if(!solutions[String(answers.solution)])return failure("Tipo de solução inválido.",400,origin);
  answers.truthful=true;answers.privacy=true;answers.marketing=raw.marketing===true;
  const score=priority(answers as Record<string,string>);
  const protocol="GB-"+new Date().getUTCFullYear()+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
  const {error}=await db.from("goburn_cases").insert({
    order_id:order.id,answers,lead_score:score,opportunity_type:solutions[String(answers.solution)],
    priority:score>=70?"alta":score>=45?"media":"baixa",protocol
  });
  if(error){if(error.code==="23505")return failure("Este caso já foi registrado.",409,origin);return failure("Falha ao salvar o caso. Tente novamente.",503,origin);}
  await db.from("goburn_orders").update({status:"submitted",submitted_at:new Date().toISOString()}).eq("id",order.id).eq("status","paid");
  return respond({ok:true,protocol},201,origin);
}
function signatureValid(req:Request,url:URL){
  const xSignature=req.headers.get("x-signature")||"",requestId=req.headers.get("x-request-id")||"";
  const values=Object.fromEntries(xSignature.split(",").map(x=>x.trim().split("=")));
  const ts=values.ts||"",sig=values.v1||"",dataId=url.searchParams.get("data.id")||"";
  if(!ts||!/^[a-f0-9]{64}$/i.test(sig)||!dataId||!requestId||!/^\d{10,16}$/.test(ts))return null;
  // Mercado Pago assina o parâmetro query, não um ID arbitrário enviado no body.
  const tsValue=Number(ts);const ms=ts.length<=10?tsValue*1000:tsValue;
  if(Math.abs(Date.now()-ms)>10*60*1000)return null;
  const manifest="id:"+dataId.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";";
  return {manifest,sig,dataId};
}
async function verifySignature(data:{manifest:string,sig:string}){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(MP_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(data.manifest)));
  return compareHash(signed,data.sig.toLowerCase());
}
async function webhook(req:Request,url:URL,origin:string){
  if(!MP_TOKEN||!MP_SECRET||!ROLE)return failure("Não configurado.",503,origin);
  const signature=signatureValid(req,url);
  if(!signature||!(await verifySignature(signature)))return failure("Assinatura inválida.",401,origin);
  const body=await req.json().catch(()=>({}));
  if(body.type!=="payment"||String(body.data?.id)!==signature.dataId)return respond({ok:true,ignored:true},200,origin);
  const id=encodeURIComponent(signature.dataId);
  const mp=await fetch("https://api.mercadopago.com/v1/payments/"+id,{headers:{"Authorization":"Bearer "+MP_TOKEN}});
  if(!mp.ok)return failure("Falha de conciliação.",503,origin);
  const payment=await mp.json();
  if(!isUuid(payment.external_reference))return respond({ok:true,ignored:true},200,origin);
  const {data:order,error}=await db.from("goburn_orders").select("id,amount_cents,currency,status").eq("id",payment.external_reference).maybeSingle();
  if(error||!order)return respond({ok:true,ignored:true},200,origin);
  const okAmount=Number.isFinite(Number(payment.transaction_amount))&&Math.round(Number(payment.transaction_amount)*100)===order.amount_cents;
  if(payment.currency_id!=="BRL"||!okAmount)return failure("Divergência de valor ou moeda.",409,origin);
  if(payment.status==="approved"){
    await db.from("goburn_orders").update({status:"paid",paid_at:new Date().toISOString(),payment_id:String(payment.id)}).eq("id",order.id).eq("status","pending");
  }else if(["refunded","charged_back","cancelled"].includes(payment.status)){
    await db.from("goburn_orders").update({status:"revoked"}).eq("id",order.id).in("status",["pending","paid","submitted"]);
  }
  return respond({ok:true},200,origin);
}

async function staff(req:Request){
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return null;
 const {data:identity,error:authError}=await db.auth.getUser(bearer.slice(7));
 if(authError||!identity.user)return null;
 const {data:member}=await db.from("goburn_staff").select("role").eq("user_id",identity.user.id).maybeSingle();
 return member?{id:identity.user.id,role:member.role}:null;
}
const CASE_STATUSES=["aguardando_analise","em_analise","entregue","proposta_enviada","contratado","arquivado"];
async function adminDashboard(req:Request,origin:string){
 const actor=await staff(req);if(!actor)return failure("Acesso restrito à equipe GO BURN.",403,origin);
 const [orders,cases]=await Promise.all([
 db.from("goburn_orders").select("status,amount_cents,created_at"),
 db.from("goburn_cases").select("id,protocol,status,priority,lead_score,opportunity_type,answers,internal_notes,submitted_at,goburn_orders(customer_name,customer_email,customer_company,plan,amount_cents)").order("submitted_at",{ascending:false}).limit(150)
 ]);
 if(orders.error||cases.error)return failure("Falha ao carregar a central.",503,origin);
 const rows=orders.data||[];
 const summary={pedidos:rows.length,pagos:rows.filter(x=>x.status==="paid"||x.status==="submitted").length,
 enviados:rows.filter(x=>x.status==="submitted").length,pendentes:rows.filter(x=>x.status==="pending").length,
 receita_centavos:rows.filter(x=>x.status==="paid"||x.status==="submitted").reduce((s,x)=>s+x.amount_cents,0)};
 return respond({ok:true,summary,cases:cases.data||[],role:actor.role},200,origin);
}
async function adminUpdate(req:Request,p:any,origin:string){
 const actor=await staff(req);
 if(!actor||!["owner","admin","analyst"].includes(actor.role))return failure("Acesso não autorizado.",403,origin);
 if(!isUuid(p?.case_id)||!CASE_STATUSES.includes(p?.status)||typeof p?.notes!=="string"||p.notes.length>3000)return failure("Dados de atualização inválidos.",400,origin);
 const {data:before}=await db.from("goburn_cases").select("status").eq("id",p.case_id).maybeSingle();
 if(!before)return failure("Caso não encontrado.",404,origin);
 const change:any={status:p.status,internal_notes:p.notes.trim()};
 if(p.status==="entregue")change.delivered_at=new Date().toISOString();
 const {error}=await db.from("goburn_cases").update(change).eq("id",p.case_id);
 if(error)return failure("Não foi possível atualizar o caso.",503,origin);
 await db.from("goburn_audit").insert({actor:actor.id,case_id:p.case_id,action:"case.status_update",metadata:{old:before.status,new:p.status}});
 return respond({ok:true},200,origin);
}

Deno.serve(async(req)=>{
  const url=new URL(req.url),origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origin===ALLOWED?origin:ALLOWED,"access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"content-type,apikey,authorization","vary":"Origin"}});
  if(req.method!=="POST")return failure("Método não permitido.",405,origin);
  const action=url.searchParams.get("action");
  if(action==="webhook"){try{return await webhook(req,url,origin);}catch(error){console.error("webhook fail",error);return failure("Erro de processamento.",503,origin);}}
  if(origin!==ALLOWED)return failure("Origem não autorizada.",403,origin);
  if(!ROLE||!URL_BASE)return failure("Serviço não configurado.",503,origin);
  const size=Number(req.headers.get("content-length")||0);
  if(size>150000)return failure("Conteúdo muito grande.",413,origin);
  try{
    const p=await req.json();
    switch(action){case"checkout":return await checkout(p,origin);case"status":return await status(p,origin);case"submit":return await submit(p,origin);case"admin-dashboard":return await adminDashboard(req,origin);case"admin-update":return await adminUpdate(req,p,origin);default:return failure("Ação inválida.",404,origin);}
  }catch(error){console.error("GO BURN request error",error);return failure("Não foi possível processar sua solicitação.",503,origin);}
});
