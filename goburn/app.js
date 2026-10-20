"use strict";
(function(){
const plans={essencial:{name:"Essencial",amount:297},estrategico:{name:"Estratégico",amount:897},blueprint:{name:"Blueprint",amount:1997}};
const api=(window.GOBURN_CONFIG&&window.GOBURN_CONFIG.apiBase||"").replace(/\/$/,"");
const $=id=>document.getElementById(id);
const modal=$("modal"), form=$("caseForm"), payForm=$("checkoutForm");
const stages=Array.from(form.querySelectorAll(".stage"));
let step=0, selected="estrategico", order=null, processing=false, completed=false;
try{const saved=sessionStorage.getItem("goburn_order_v1");if(saved){order=JSON.parse(saved);if(!order.id||!order.access_key)order=null;}}catch{order=null;}
function money(value){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(value);}
function show(el,visible){el.classList.toggle("hidden",!visible);}
function setText(id,text){$(id).textContent=text;}
function busy(button,on,text){button.disabled=on;if(on){button.dataset.old=button.textContent;button.textContent=text;}else if(button.dataset.old){button.textContent=button.dataset.old;delete button.dataset.old;}}
function safeMsg(err){return err instanceof Error?err.message:String(err);}
async function request(action,body){if(!api)throw Error("A contratação online ainda está em configuração. Nenhuma cobrança foi realizada.");const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);try{const res=await fetch(api+"?action="+encodeURIComponent(action),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:controller.signal,cache:"no-store"});let json;try{json=await res.json();}catch{throw Error("Resposta inválida do servidor. Tente novamente.");}if(!res.ok||!json.ok)throw Error(json.error||"Não foi possível concluir a solicitação.");return json;}catch(error){if(error.name==="AbortError")throw Error("O servidor demorou a responder. Tente novamente.");throw error;}finally{clearTimeout(timeout);}}
function openModal(plan){selected=plan;const p=plans[plan];if(!p)return;setText("modalTitle","Diagnóstico "+p.name);setText("modalPlan",money(p.amount)+" • etapa de análise paga");setText("checkoutError","");show(modal,true);document.body.style.overflow="hidden";setTimeout(()=>payForm.elements.name.focus(),0);}
function closeModal(){show(modal,false);document.body.style.overflow="";document.querySelector('[data-plan="'+selected+'"]')?.focus();}
document.querySelectorAll("[data-plan]").forEach(button=>button.addEventListener("click",()=>openModal(button.dataset.plan)));
$("closeModal").addEventListener("click",closeModal);
modal.addEventListener("click",event=>{if(event.target===modal)closeModal();});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!modal.classList.contains("hidden"))closeModal();});
payForm.addEventListener("submit",async event=>{event.preventDefault();if(processing||!payForm.reportValidity())return;setText("checkoutError","");const data=new FormData(payForm);if(data.get("website_hp"))return;
if(!api){setText("checkoutError","A integração de pagamentos ainda não foi ativada. A GO BURN não cobra nem coleta dados neste estágio.");return;}
const payload={plan:selected,name:String(data.get("name")||"").trim(),email:String(data.get("email")||"").trim(),company:String(data.get("company")||"").trim(),phone:String(data.get("phone")||"").trim(),terms_accepted:!!data.get("accept_terms")};
processing=true;busy($("pay"),true,"Preparando pagamento...");
try{const result=await request("checkout",payload);if(!result.order_id||!result.access_key||!result.checkout_url)throw Error("Resposta incompleta do servidor de pagamento.");order={id:result.order_id,access_key:result.access_key,plan:selected};sessionStorage.setItem("goburn_order_v1",JSON.stringify(order));window.location.assign(result.checkout_url);}
catch(error){setText("checkoutError",safeMsg(error));}finally{processing=false;busy($("pay"),false);}});
async function checkStatus(){if(!order){setText("gateStatus","Nenhuma contratação em andamento neste navegador.");return;}
const btn=$("refreshStatus");busy(btn,true,"Verificando...");
try{const data=await request("status",{order_id:order.id,access_key:order.access_key});if(data.status==="paid"||data.status==="submitted"){closeModal();setText("gateText","Pagamento confirmado. Obrigado por confiar na GO BURN.");if(data.status==="submitted"){completed=true;show($("gate"),false);show($("questionnaire"),false);show($("complete"),true);setText("protocol",data.protocol||order.id.slice(0,8).toUpperCase());}else{show($("gate"),false);show($("questionnaire"),true);show($("complete"),false);setText("paidPlan",plans[order.plan]?.name||"Diagnóstico");renderStage();}}
else{setText("gateStatus",data.status==="pending"?"Seu pagamento ainda não está confirmado. Aguarde e verifique novamente.":"O pagamento não foi aprovado. Fale com o atendimento para obter orientação.");}}
catch(error){setText("gateStatus",safeMsg(error));}finally{busy(btn,false);}}
$("refreshStatus").addEventListener("click",checkStatus);
if(order){show($("refreshStatus"),true);setText("gateText","Localizamos uma contratação iniciada neste navegador. Confira a confirmação do pagamento para continuar.");checkStatus();}
const params=new URLSearchParams(location.search);if(params.has("collection_status")||params.has("status")||params.has("payment_id")){history.replaceState({},document.title,location.pathname+location.hash);setTimeout(()=>$("diagnostico").scrollIntoView({behavior:"smooth",block:"start"}),150);}
function renderStage(){stages.forEach((el,i)=>show(el,i===step));$("progress").replaceChildren(...stages.map((_,i)=>{const span=document.createElement("span");if(i<=step)span.className="on";return span;}));show($("previous"),step>0);show($("next"),step<stages.length-1);show($("submit"),step===stages.length-1);setText("formError","");show($("formError"),false);if(step===4)renderReview();}
function validateStep(){const fields=Array.from(stages[step].querySelectorAll("input,select,textarea")).filter(el=>el.required||el.value);for(const field of fields){if(!field.checkValidity()){field.reportValidity();field.focus();return false;}}return true;}
$("next").addEventListener("click",()=>{if(!validateStep())return;step=Math.min(step+1,4);renderStage();$("questionnaire").scrollIntoView({block:"start"});});
$("previous").addEventListener("click",()=>{step=Math.max(step-1,0);renderStage();$("questionnaire").scrollIntoView({block:"start"});});
const reviewFields=[["Empresa","company"],["Setor","sector"],["Principal problema","problem"],["Solução desejada","solution"],["Prazo","timeline"],["Orçamento","budget"]];
function renderReview(){const review=$("review");review.replaceChildren();const card=document.createElement("div");card.className="review-card";for(const [label,key] of reviewFields){const value=String(new FormData(form).get(key)||"—");const p=document.createElement("p");const strong=document.createElement("strong");strong.textContent=label+": ";p.append(strong,document.createTextNode(value));card.append(p);}review.append(card);}
form.addEventListener("submit",async event=>{event.preventDefault();if(completed||processing||!order)return;if(!validateStep())return;
const data=Object.fromEntries(new FormData(form));data.truthful=!!data.truthful;data.privacy=!!data.privacy;data.marketing=!!data.marketing;setText("formError","");show($("formError"),false);
processing=true;busy($("submit"),true,"Enviando caso...");
try{const response=await request("submit",{order_id:order.id,access_key:order.access_key,answers:data});completed=true;show($("questionnaire"),false);show($("complete"),true);setText("protocol",response.protocol||order.id.slice(0,8).toUpperCase());$("complete").scrollIntoView({block:"start"});}
catch(err){setText("formError",safeMsg(err));show($("formError"),true);}finally{processing=false;busy($("submit"),false);}});
})();