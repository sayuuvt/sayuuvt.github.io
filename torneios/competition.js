"use strict";
// All authenticated screens share one document so the token stays in memory.
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const phases = {scheduled:"Inscrições abertas",ladder:"Matchmaking aberto",closing:"Finalizando partidas",top8_preview:"Top 8 — revisão",top8:"Top 8 em andamento",finished:"Encerrado"};
  const matchStates = {checkin:"Aguardando check-in",playing:"Em andamento",reporting:"Aguardando confirmação do resultado",disputed:"Resultado em análise pela organização",complete:"Concluída",cancelled:"Cancelada"};
  const bracketNames = {W1:"Winners semifinal 1",W2:"Winners semifinal 2",WF:"Winners final",L1:"Losers round 1 — A",L2:"Losers round 1 — B",L3:"Losers round 2 — A",L4:"Losers round 2 — B",LS:"Losers semifinal",LF:"Losers final",GF:"Grand Final",RESET:"Bracket Reset"};
  const order = ["W1","W2","WF","L1","L2","L3","L4","LS","LF","GF","RESET"];
  let user = null, screen = "profile", events = [], selected = null, current = null;
  let adminState = null, adminId = null, seedOrder = [], room = null, cursor = 0;
  let epoch = 0, busy = false, polling = false;
  const error = (target, err) => { $(target).textContent = err.message || "Não foi possível concluir a operação."; };
  const name = p => p ? [p.team,p.nick || "Competidor"].filter(Boolean).join(" | ") : "A definir";
  const path = id => "/events/" + encodeURIComponent(id);
  const date = t => new Date(t * 1000).toLocaleString("pt-BR");
  function action(label, fn, disabled=false) {
    const button = el("button",label);
    button.type = "button"; button.disabled = disabled;
    button.addEventListener("click",fn);
    return button;
  }
  function show(next) {
    if (!user || (next === "management" && !user.admin)) next = "profile";
    epoch++;
    screen = next;
    for (const id of ["profile","competition","management"]) $(id).hidden = !user || id !== screen;
    if (screen !== "competition") clearRoom();
    if (screen !== "profile" && user) refreshCatalog().catch(err => error(screen === "management" ? "admin-status" : "competition-status",err));
  }
  document.addEventListener("ladder-user", event => {
    user = event.detail;
    $("competition-nav").hidden = !user;
    $("admin-nav").hidden = !user || !user.admin;
    if (!user) {
      epoch++; events=[]; selected=null; current=null; adminId=null; adminState=null; seedOrder=[];
      clearRoom(); $("standings").replaceChildren(); $("public-bracket").replaceChildren();
      $("event-catalog").replaceChildren(); $("admin-event").replaceChildren(); $("seed-list").replaceChildren();
      $("admin-matches").replaceChildren(); $("admin-bracket").replaceChildren();
      $("event-detail").hidden=true; $("admin-detail").hidden=true;
    }
    show(user && user.complete && screen !== "profile" ? screen : "profile");
  });
  for (const button of document.querySelectorAll("[data-screen]")) button.addEventListener("click", () => show(button.dataset.screen));
  async function refreshCatalog() {
    const e = epoch;
    const data = await request("/events");
    if (!user || e !== epoch) return;
    events = data;
    const catalog = $("event-catalog"); catalog.replaceChildren();
    for (const item of events) catalog.append(action(item.title + " · " + (phases[item.phase] || item.phase), () => openEvent(item.id)));
    if (!events.length) catalog.append(el("p","Nenhum evento cadastrado."));
    const select = $("admin-event"), previous = select.value;
    select.replaceChildren();
    for (const item of events) { const o=el("option",item.title); o.value=item.id; select.append(o); }
    if (events.some(x=>x.id===previous)) select.value=previous;
    if (screen==="competition" && selected && !busy) await refreshEvent();
  }
  $("catalog-refresh").addEventListener("click",()=>refreshCatalog().catch(err=>error("competition-status",err)));
  function clearRoom() {
    room=null; cursor=0; $("messages").replaceChildren();
    $("chat-form").reset(); $("score-form").reset(); $("match-room").hidden=true;
  }
  async function openEvent(id) {
    if (busy) return;
    selected=id; current=null; epoch++; clearRoom(); $("event-detail").hidden=true;
    try { await refreshEvent(); } catch(err) { error("competition-status",err); }
  }
  async function refreshEvent() {
    if (!selected || !user || screen!=="competition") return;
    const id=selected,e=epoch;
    const state=await request(path(id));
    if (id!==selected || e!==epoch || !user) return;
    if (current && current.version>state.version) return;
    current=state; renderEvent();
    if (room!==null && !$("match-chat").hidden) await refreshChat(id,room,e);
  }
  async function command(actionName,args={}) {
    if (busy || !current) return;
    busy=true; const id=selected,e=epoch,version=current.version;
    try {
      const next=await request(path(id)+"/commands","POST",{key:crypto.randomUUID(),expected_version:version,action:actionName,args});
      if (id===selected && e===epoch && user) { current=next; $("competition-status").textContent="Operação registrada."; renderEvent(); }
    } catch(err) {
      if (e===epoch) { error("competition-status",err); try { await refreshEvent(); } catch { /* keep original error */ } }
    } finally {busy=false;}
  }
  function renderEvent() {
    if (!current || !user) return;
    const meta=events.find(x=>x.id===selected);
    const now=Date.now()/1000;
    $("event-detail").hidden=false;
    $("event-title").textContent=meta ? meta.title+" · "+meta.game : selected;
    $("event-phase").textContent="FT"+current.first_to+" · "+(meta?date(meta.starts_at)+" — ":"")+date(current.closes_at);
    const actions=$("queue-actions"); actions.replaceChildren();
    if (!user.complete) actions.append(el("p","Complete seu perfil para competir."));
    else if (!current.registered && now<current.closes_at) actions.append(action("Inscrever-se",()=>command("register")));
    else if (current.queued) actions.append(el("p","Buscando adversário…"),action("Sair da fila",()=>command("leave_queue")));
    else if (current.registered && !current.match && !current.frozen && now<current.closes_at && (!meta || now>=meta.starts_at)) actions.append(action("Buscar partida",()=>command("enqueue")));
    else if (current.registered && !current.match) actions.append(el("p",current.frozen?"Ladder encerrado.":now>=current.closes_at?"Finalizando o Ladder.":"Aguardando início."));
    const body=$("standings"); body.replaceChildren();
    for (const p of current.standings) {
      const tr=el("tr"); if (p.rank<=8) tr.dataset.qualified=p.rank<=4?"winners":"losers";
      for (const v of [p.rank,name(p),p.points,p.wins+"/"+p.losses,p.games_won,p.played]) tr.append(el("td",String(v)));
      body.append(tr);
    }
    renderBracket($("public-bracket"),current.bracket,Object.fromEntries(current.standings.map(p=>[p.id,p])));
    renderMatch(current.match);
  }
  function renderMatch(m) {
    if (!m) { if (room!==null) clearRoom(); return; }
    if (room!==m.id) {clearRoom(); room=m.id;}
    $("match-room").hidden=false;
    const players=$("match-players"); players.replaceChildren();
    for (const p of m.players) {
      const card=el("article",undefined,"ladder-panel");
      const row=el("div",undefined,"ladder-player");
      if (p.avatar_url && p.avatar_url.startsWith("https://cdn.discordapp.com/")) {
        const img=el("img"); img.src=p.avatar_url; img.alt=""; img.width=44; img.height=44; row.append(img);
      }
      const text=el("div"); text.append(el("strong",name(p)),el("p",p.discord_username?"@"+p.discord_username:"Discord indisponível"));
      row.append(text); card.append(row,el("p",m.checked.includes(p.id)?"Check-in confirmado":"Aguardando check-in"));
      if (p.id!==user.id && p.discord_username) card.append(action("Copiar Discord",async()=>{try{await navigator.clipboard.writeText(p.discord_username);$("competition-status").textContent="Discord copiado.";}catch(err){error("competition-status",err);}}));
      players.append(card);
    }
    $("match-state").textContent="Partida #"+m.id+" · "+(matchStates[m.status]||m.status)+(m.unit?" · "+m.unit+" pts por jogo vencido":"");
    const controls=$("match-actions"); controls.replaceChildren();
    if (m.status==="checkin") controls.append(action("Confirmar presença",()=>command("checkin",{match_id:m.id}),m.checked.includes(user.id)));
    if (m.status==="playing") {
      if (m.cancel_by && m.cancel_by!==user.id) controls.append(action("Aceitar cancelamento",()=>command("request_cancel",{match_id:m.id})),action("Recusar e jogar",()=>command("refuse_cancel",{match_id:m.id})));
      else if (!m.cancel_by) controls.append(action("Solicitar cancelamento",()=>command("request_cancel",{match_id:m.id})));
      else controls.append(el("p","Aguardando resposta ao cancelamento."));
    }
    const score=$("score-form");
    score.hidden=!(["playing","reporting"].includes(m.status) && !m.cancel_by && !m.own_report);
    score.elements.a.max=String(current.first_to); score.elements.b.max=String(current.first_to);
    $("score-a-label").firstChild.nodeValue=name(m.players[0]);
    $("score-b-label").firstChild.nodeValue=name(m.players[1]);
    $("match-chat").hidden=!["playing","reporting","disputed"].includes(m.status);
    updateClock();
  }
  function updateClock() {
    const m=current?.match;
    const deadline=m?.status==="checkin"?m.deadline:m?.cancel_deadline;
    $("match-clock").textContent=deadline?"Prazo restante: "+Math.max(0,Math.ceil(deadline-Date.now()/1000))+"s":"";
  }
  $("score-form").addEventListener("submit",event=>{
    event.preventDefault();
    if (!current?.match) return;
    const f=new FormData(event.target); const a=Number(f.get("a")),b=Number(f.get("b")),ft=current.first_to;
    if (!((a===ft&&b>=0&&b<ft)||(b===ft&&a>=0&&a<ft))) {$("competition-status").textContent="Placar inválido para FT"+ft;return;}
    if (confirm("Confirmar placar "+a+" × "+b+"?")) command("report",{match_id:current.match.id,a,b});
  });
  async function refreshChat(id,matchId,e) {
    const data=await request(path(id)+"/matches/"+matchId+"/chat?after="+cursor);
    if (e!==epoch || room!==matchId || selected!==id || !user) return;
    const box=$("messages"), near=box.scrollHeight-box.scrollTop-box.clientHeight<50;
    for (const msg of data) {
      if (msg.id<=cursor) continue;
      cursor=msg.id;
      const p=current?.match?.players.find(x=>x.id===msg.author);
      const line=el("p"); line.append(el("strong",name(p)+" · "+new Date(msg.at*1000).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+": "),document.createTextNode(msg.body)); box.append(line);
    }
    if (near) box.scrollTop=box.scrollHeight;
  }
  $("chat-form").addEventListener("submit",async event=>{
    event.preventDefault(); if (room===null||!selected||!user) return;
    const id=selected,m=room,e=epoch,input=event.target.elements.body,body=input.value.trim();
    if (!body) return;
    const button=event.target.querySelector("button"); button.disabled=true;
    try { await request(path(id)+"/matches/"+m+"/chat","POST",{body,key:crypto.randomUUID()});
      if(e===epoch&&room===m){if(input.value.trim()===body)input.value="";await refreshChat(id,m,e);}
    } catch(err){if(e===epoch)error("competition-status",err);} finally{button.disabled=false;}
  });
  function renderBracket(target, bracket, profiles, admin=false) {
    target.replaceChildren();
    if (!bracket) {target.append(el("p","O Top 8 ainda não foi gerado."));return;}
    if(bracket.champion)target.append(el("h3","Campeão: "+name(profiles[bracket.champion])));
    for(const key of order) {
      const set=bracket.sets[key]; if(!set||set.status==="not_needed")continue;
      const card=el("article",undefined,"ladder-panel"); card.append(el("h3",bracketNames[key]),el("p",set.status==="complete"?(set.reason==="dq"?"DQ":set.reason==="bye"?"BYE":"Concluída"):set.status==="ready"?"Disponível":"Aguardando"));
      set.slots.forEach((p,i)=>card.append(el("p",(set.winner&&set.winner===p?"✓ ":"")+name(profiles[p])+(set.result?" — "+set.result[i]:""))));
      if(admin&&bracket.started&&set.status==="ready"){
        card.append(action("Reportar",()=>reportAdmin("top8_report",{key},bracket.first_to)),...set.slots.map(p=>action("DQ "+name(profiles[p]),()=>{if(confirm("Aplicar DQ neste confronto?"))adminCommand("top8_report",{key,dq:p});})));
      }
      target.append(card);
    }
  }
  $("event-create").addEventListener("submit",async event=>{
    event.preventDefault();if(!user?.admin||busy)return;
    const f=new FormData(event.target), id=String(f.get("id")), starts_at=Math.floor(new Date(f.get("starts")).getTime()/1000),closes_at=Math.floor(new Date(f.get("closes")).getTime()/1000);
    const rules={first_to:Number(f.get("ft"))};
    for(const k of ["base","opponent_seed","opponent_rank","own_seed"])rules[k]=Number(f.get(k));
    busy=true;
    try{await request("/admin"+path(id),"PUT",{title:f.get("title"),game:f.get("game"),starts_at,closes_at,rules});$("admin-status").textContent="Evento criado.";await refreshCatalog();$("admin-event").value=id;await loadAdmin(id);}
    catch(err){error("admin-status",err);}finally{busy=false;}
  });
  $("admin-load").addEventListener("click",()=>{if(!busy)loadAdmin($("admin-event").value).catch(err=>error("admin-status",err));});
  async function loadAdmin(id) {
    if(!user?.admin||!id)return;const e=epoch;const data=await request("/admin"+path(id));
    if(e!==epoch||!user?.admin)return;
    adminId=id;adminState=data;seedOrder=[...data.state.players].sort((a,b)=>a.seed-b.seed).map(p=>p.id);renderAdmin();
  }
  function renderSeeds(){
    const list=$("seed-list");list.replaceChildren();
    seedOrder.forEach((id,i)=>{
      const p=adminState.profiles[id],li=el("li",name(p));
      if(p?.discord_username)li.append(el("span"," · @"+p.discord_username));
      for(const [label,delta] of [["↑",-1],["↓",1]]) li.append(action(label,()=>{const j=i+delta;[seedOrder[i],seedOrder[j]]=[seedOrder[j],seedOrder[i]];renderSeeds();},i+delta<0||i+delta>=seedOrder.length));
      list.append(li);
    });
  }
  $("save-seeds").addEventListener("click",()=>adminCommand("reseed",{ordered_ids:[...seedOrder]}));
  function renderAdmin(){
    const state=adminState.state,profiles=adminState.profiles||{};
    $("admin-detail").hidden=false;renderSeeds();
    const matches=$("admin-matches");matches.replaceChildren();
    for(const m of state.matches.filter(m=>!["complete","cancelled"].includes(m.status))){
      const card=el("article",undefined,"ladder-panel");card.append(el("h3","#"+m.id+" · "+(matchStates[m.status]||m.status)),el("p",name(profiles[m.a])+" × "+name(profiles[m.b])));
      if(["playing","reporting","disputed"].includes(m.status))card.append(action("Resolver placar",()=>reportAdmin("resolve",{match_id:m.id},state.rules.first_to)),action("Cancelar partida",()=>{if(confirm("Cancelar sem pontuação?"))adminCommand("resolve",{match_id:m.id});}));
      matches.append(card);
    }
    if(!matches.children.length)matches.append(el("p","Nenhuma partida pendente."));
    const phase=$("admin-phase-actions");phase.replaceChildren();
    if(!state.bracket)phase.append(action("Congelar e gerar Top 8",()=>{if(confirm("Gerar classificação final e prévia do Top 8?"))adminCommand("freeze",{first_to:3});},Date.now()/1000<state.closes_at));
    else if(!state.bracket.started)phase.append(action("Confirmar início do Top 8",()=>{if(confirm("Iniciar Top 8 com os participantes exibidos?"))adminCommand("top8_start");}));
    renderBracket($("admin-bracket"),state.bracket,profiles,true);
  }
  function reportAdmin(actionName,args,ft){
    const raw=prompt("Informe o placar A-B (FT"+ft+")");
    if(raw===null)return;
    const parsed=/^(\d+)\s*[-x×:]\s*(\d+)$/.exec(raw.trim());
    if(!parsed){$("admin-status").textContent="Placar inválido.";return;}
    const a=Number(parsed[1]),b=Number(parsed[2]);if(!((a===ft&&b<ft)||(b===ft&&a<ft))){$("admin-status").textContent="Placar inválido.";return;}
    adminCommand(actionName,{...args,a,b});
  }
  async function adminCommand(actionName,args={}){
    if(!user?.admin||busy||!adminState)return;
    const id=adminId,e=epoch;busy=true;
    try{await request("/admin"+path(id)+"/commands","POST",{key:crypto.randomUUID(),expected_version:adminState.version,action:actionName,args});if(e===epoch){$("admin-status").textContent="Operação registrada.";await loadAdmin(id);}}
    catch(err){if(e===epoch)error("admin-status",err);}finally{busy=false;}
  }
  // One polling loop, only while a signed-in player is viewing an event.
  if (local) setInterval(async()=>{if(!user||screen!=="competition"||!selected||busy||polling)return;polling=true;try{await refreshEvent();}catch(err){error("competition-status",err);}finally{polling=false;}},2000);
  if (local) setInterval(()=>{if(user&&screen==="competition")updateClock();},250);
})();
