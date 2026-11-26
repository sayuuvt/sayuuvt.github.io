const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const source=readFileSync(join(__dirname,'..','doar/donations.js'),'utf8');

const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve()};
const config={available:true,live:false,simulated:true,payment_environment:'simulated',minimum_cents:100,suggestions:[500,1000],voices:[{id:'none',label:'Sem voz'}],checkout_mode:'external'};
const A='a'.repeat(43), B='b'.repeat(43);
const payment=(id=A,status='awaiting_payment',extra={})=>({id,status,amount_cents:1000,expires_at:Date.now()/1000+1800,checkout:{},simulated:true,...extra});
const response=(data,status=200)=>({ok:status===200,status,json:async()=>data});
function element(){return {hidden:true,disabled:false,value:'',textContent:'',children:[],handlers:{},attrs:{},scrolls:0,addEventListener(k,f){this.handlers[k]=f},replaceChildren(){this.children=[]},append(x){this.children.push(x)},prepend(x){this.children.unshift(x)},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]??this[k]??null},removeAttribute(k){delete this.attrs[k];delete this[k]},scrollIntoView(){this.scrolls++},focus(){},reset(){},querySelectorAll(){return []}}}
async function harness(source,{hostname='localhost',catalog=config}={}){
 const nodes=new Map(),events={},requests=[];let serial=0,configError=false;
 const get=k=>{if(!nodes.has(k))nodes.set(k,element());return nodes.get(k)};
 get('amount').value='10,00';get('display-name').value='Teste';get('email').value='teste@example.invalid';
 const doc={hidden:false,getElementById:get,createElement:element,addEventListener(k,f){events[k]=f}};
 const fetch=(url,options)=>url.endsWith('/config')?(configError?Promise.reject(Error('offline')):Promise.resolve(response(catalog))):new Promise(resolve=>requests.push({url,options,resolve}));
 const api=new Function('document','location','addEventListener','removeEventListener','fetch','setTimeout','clearTimeout','setInterval','clearInterval','AbortController','window','crypto',source+'\nreturn {check,renderPayment,validatePayment,validateConfiguration,safeTicket,synchronizeCatalog,setPayment(p){payment=p;paymentStartedAt=Date.now()},getPayment(){return payment},getPending(){return pendingRequest}};')(doc,{hostname},(k,f)=>events[k]=f,k=>delete events[k],fetch,()=>++serial,()=>{},()=>++serial,()=>{},class{signal={aborted:false};abort(){this.signal.aborted=true}},{open:()=>null,confirm:()=>true},{randomUUID:()=> '12345678-1234-4123-8123-123456789012'});
 await flush();return {...api,get,events,requests,failConfig(){configError=true},submit(){return get('donation-form').handlers.submit({preventDefault(){}})}};
}
function register(test,assert,source){
 test('single-flight status and terminal confirmation',async()=>{const h=await harness(source);h.setPayment(payment());const first=h.check();await h.check();assert.equal(h.requests.length,1);h.requests[0].resolve(response(payment(A,'paid')));await first;assert.equal(h.getPayment().status,'paid');await h.check();assert.equal(h.requests.length,1)});
 test('reset aborts and ignores stale response',async()=>{const h=await harness(source);h.setPayment(payment());const first=h.check();h.get('new-donation').handlers.click();assert.equal(h.requests[0].options.signal.aborted,true);h.setPayment(payment(B));const second=h.check();h.requests[0].resolve(response(payment(A,'paid')));await first;assert.equal(h.getPayment().id,B);h.requests[1].resolve(response(payment(B,'paid')));await second;assert.equal(h.getPayment().status,'paid')});
 test('pagehide/pageshow restarts polling',async()=>{const h=await harness(source);h.setPayment(payment());const first=h.check();h.events.pagehide({persisted:true});assert.equal(h.requests[0].options.signal.aborted,true);h.events.pageshow();assert.equal(h.requests.length,2);h.requests[1].resolve(response(payment(A,'paid')));await flush();h.requests[0].resolve(response(payment()));await first;assert.equal(h.getPayment().status,'paid')});
 test('uncertain creation retains exact request after later 422',async()=>{const h=await harness(source);const first=h.submit();await flush();assert.equal(h.requests.length,1);const body=h.requests[0].options.body;h.requests[0].resolve(response({},503));await first;assert.ok(h.getPending());const second=h.submit();await flush();assert.equal(h.requests[1].options.body,body);h.requests[1].resolve(response({},422));await second;assert.ok(h.getPending());const third=h.submit();await flush();assert.equal(h.requests[2].options.body,body);h.requests[2].resolve(response(payment()));await third;assert.equal(h.getPending(),undefined);assert.equal(h.getPayment().id,A)});
 test('configuration failure disables new donations',async()=>{const h=await harness(source);assert.equal(h.get('fields').disabled,false);h.failConfig();await assert.rejects(h.synchronizeCatalog());assert.equal(h.get('fields').disabled,true);assert.equal(h.get('notice').hidden,false)});
 test('malformed responses and mismatched IDs are rejected',async()=>{const h=await harness(source);assert.throws(()=>h.validatePayment(payment(B),A));assert.throws(()=>h.validatePayment(payment(A,'unknown')));assert.throws(()=>h.validatePayment(payment(A,'paid',{amount_cents:1.5})));assert.throws(()=>h.validateConfiguration({...config,minimum_cents:'100'}));assert.throws(()=>h.validateConfiguration({...config,voices:[null]}))});
 test('expired payment is hidden before network response',async()=>{const h=await harness(source);h.setPayment(payment(A,'awaiting_payment',{expires_at:Date.now()/1000-5}));const pending=h.check();assert.equal(h.get('checkout-link').hidden,true);assert.match(h.get('payment-title').textContent,/Prazo do Pix encerrado/);h.requests[0].resolve(response({},503));await pending;assert.equal(h.get('checkout-link').hidden,true)});
 test('status polling does not scroll and clears checkout on confirmation',async()=>{const h=await harness(source);h.setPayment(payment());h.renderPayment({initial:true});assert.equal(h.get('payment').scrolls,1);const first=h.check();h.requests[0].resolve(response(payment(A,'paid')));await first;assert.equal(h.get('payment').scrolls,1);assert.equal(h.get('checkout-link').hidden,true);assert.equal(h.get('pix-code').value,'')});
}

register(test,assert,source);

const liveSource=readFileSync(join(__dirname,'..','js/main.js'),'utf8');
for(const s of [{name:'links online',links:true,uptime:'1 hour, 2 minutes',live:true},{name:'donation online',uptime:'3 minutes',live:true},{name:'offline',uptime:'sayuuvt is offline',live:false},{name:'invalid',uptime:'Service unavailable',live:false},{name:'network',error:true,live:false}]){
 test('avatar: '+s.name,async()=>{
 const el=()=>({...element(),classList:{active:false,toggle(k,v){this.active=v}}});
 const avatar=el(),badge=el(),sub=el(),tag=el(),link=el(),requests=[];
 const nodes={'.avatar':avatar,'[data-live-badge]':badge,...(s.links?{'[data-twitch-link]':link,'[data-live-tag]':tag,'[data-twitch-sub]':sub}:{})};
 const doc={hidden:false,querySelector:k=>nodes[k]??null,addEventListener(){}};
 const fetch=async url=>{requests.push(url);if(s.error)throw Error('offline');return {ok:true,text:async()=>url.includes('/game/')?'Guilty Gear':s.uptime}};
 new Function('document','fetch','setTimeout','clearTimeout','setInterval','AbortController','navigator',liveSource)(doc,fetch,()=>0,()=>{},()=>0,class{signal={};abort(){}},{});
 await flush();assert.equal(avatar.classList.active,s.live);assert.equal(badge.hidden,!s.live);assert.equal(requests.length,s.links&&s.live?2:1);
 });
}
test('checkout URL allowlist',async()=>{
 const h=await harness(source);assert.ok(h.safeTicket('https://www.mercadopago.com.br/payments/123/ticket'));
 for(const u of ['https://www.mercadopago.com.br.evil.test/payments/123/ticket','http://www.mercadopago.com.br/payments/123/ticket','https://www.mercadopago.com.br:444/payments/123/ticket','javascript:alert(1)'])assert.equal(h.safeTicket(u),null);
});

for (const [environment, simulated] of [['simulated',true],['sandbox',false],['live',false]]) {
  test('payment environment '+environment+' is only available in appropriate location',async()=>{
    const catalog={...config,payment_environment:environment,simulated};
    const local=await harness(source,{catalog});
    assert.equal(local.get('fields').disabled,false);
    assert.equal(local.get('notice').hidden,environment==='live');
    if(environment==='simulated')assert.match(local.get('notice').textContent,/DEMONSTRAÇÃO/);
    if(environment==='sandbox')assert.match(local.get('notice').textContent,/SANDBOX/);
    const deployed=await harness(source,{hostname:'sayuuvt.github.io',catalog});
    assert.equal(deployed.get('fields').disabled,environment!=='live');
    assert.equal(deployed.get('notice').hidden,environment==='live');
    assert.doesNotMatch(deployed.get('notice').textContent,/DEMONSTRAÇÃO|SANDBOX/);
  });
}
test('legacy or inconsistent environment fails closed on public site',async()=>{
  for(const catalog of [{...config,payment_environment:undefined},{...config,payment_environment:'live',simulated:true}]){
    const h=await harness(source,{hostname:'sayuuvt.github.io',catalog});
    assert.equal(h.get('fields').disabled,true);
    assert.doesNotMatch(h.get('notice').textContent,/DEMONSTRAÇÃO/);
  }
});
test('unexpected simulated checkout is not shown publicly',async()=>{
  const h=await harness(source,{hostname:'sayuuvt.github.io',catalog:{...config,payment_environment:'live',simulated:false}});
  h.setPayment(payment());h.renderPayment({initial:true});
  assert.equal(h.get('checkout-link').hidden,true);
  assert.equal(h.get('embedded').hidden,true);
  assert.match(h.get('payment-title').textContent,/ambiente de teste inesperado/);
});
