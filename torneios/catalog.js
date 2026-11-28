"use strict";
(() => {
  if(location.origin!=="http://localhost:8000")return;
  const api="http://127.0.0.1:5126/api/v1/ladder";
  const $=id=>document.getElementById(id);
  const el=(tag,value,cls)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;if(cls)node.className=cls;return node;};
  const phases={scheduled:"Inscrições abertas",ladder:"Matchmaking em andamento",closing:"Finalizando Ladder",top8_preview:"Preparando Top 8",top8:"Top 8",finished:"Encerrado"};
  let selection=0;
  async function get(path){
    const r=await fetch(api+path,{credentials:"omit",cache:"no-store"});
    if(!r.ok)throw new Error("Consulta indisponível");
    return r.json();
  }
  const date=t=>new Date(t*1000).toLocaleString("pt-BR");
  const player=p=>[p.team,p.nick].filter(Boolean).join(" | ")||"Competidor";
  async function history(id){
    const generation=++selection,box=$("history-detail");box.hidden=false;box.textContent="Carregando…";
    try{
      const r=await get("/history/"+encodeURIComponent(id));if(generation!==selection)return;
      box.replaceChildren(el("h3",r.event.title));
      const winner=r.standings.find(p=>p.id===r.bracket.champion);
      box.append(el("p","Campeão: "+(winner?player(winner):"Não definido")));
      const wrap=el("div",undefined,"ladder-table-wrap"),table=el("table",undefined,"ladder-table");
      const header=el("tr");for(const v of ["Posição Ladder","Competidor","Pontos","V/D","Jogos ganhos"])header.append(el("th",v));
      const head=el("thead");head.append(header);table.append(head);
      const body=el("tbody");
      for(const p of r.standings){const tr=el("tr");for(const v of [p.rank,player(p),p.points,p.wins+"/"+p.losses,p.games_won])tr.append(el("td",String(v)));body.append(tr);}
      table.append(body);wrap.append(table);box.append(wrap);
      const close=el("button","Fechar");close.type="button";close.addEventListener("click",()=>{selection++;box.hidden=true;box.replaceChildren();});box.append(close);
    }catch(err){if(generation===selection)box.textContent=err.message;}
  }
  async function initialize(){
    try{
      const events=await get("/events");const active=$("public-events"),past=$("history-events");active.replaceChildren();past.replaceChildren();
      for(const e of events){
        const card=el("article",undefined,"ladder-panel");card.append(el("h3",e.title),el("p",e.game+" · FT"+e.first_to),el("p",date(e.starts_at)+" — "+date(e.closes_at)),el("p",(phases[e.phase]||e.phase)+" · "+e.participants+" inscritos"));
        if(e.phase==="finished"){const b=el("button","Consultar resultados");b.type="button";b.addEventListener("click",()=>history(e.id));card.append(b);past.append(card);}
        else{const link=el("a","Entrar na área competitiva");link.href="perfil.html";card.append(link);active.append(card);}
      }
      if(!active.children.length)active.append(el("p","Nenhum evento aberto."));
      if(!past.children.length)past.append(el("p","Nenhum torneio concluído."));
    }catch(err){$("public-events").textContent=err.message;}
  }
  initialize();
})();
