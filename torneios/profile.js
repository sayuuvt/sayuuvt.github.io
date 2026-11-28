"use strict";
const local = location.origin === "http://localhost:8000";
const api = "http://127.0.0.1:5126/api/v1/ladder";
const login = document.querySelector("#login");
const logout = document.querySelector("#logout");
const status = document.querySelector("#status");
const profile = document.querySelector("#profile");
const form = document.querySelector("#profile-form");
const proofKey = "ladder-oauth-proof";
let token = null;
async function request(path, method = "GET", body) {
  if (!local) throw new Error("Disponível apenas em localhost");
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(api + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache:"no-store", credentials:"omit"});
  if (!response.ok) throw new Error("Operação não concluída (" + response.status + ")");
  return response.json();
}
function render(user) {
  profile.hidden = !user;
  login.hidden = !!user;
  logout.hidden = !user;
  document.dispatchEvent(new CustomEvent("ladder-user", {detail:user}));
  if (!user) return;
  document.querySelector("#discord-name").textContent = "Discord: @" + user.discord_username;
  const url = new URL(user.avatar_url);
  if (url.origin === "https://cdn.discordapp.com") document.querySelector("#discord-avatar").src = url.href;
  for (const field of ["nick","team","country","region","city"]) form.elements.namedItem(field).value = user[field] || "";
  status.textContent = user.complete ? "Perfil conectado." : "Complete os dados competitivos.";
}
login.addEventListener("click", async () => {
  login.disabled = true;
  try {
    const proof = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2,"0")).join("");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proof));
    const proof_hash = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2,"0")).join("");
    sessionStorage.setItem(proofKey, proof);
    const result = await request("/auth/start","POST",{proof_hash});
    const url = new URL(result.url);
    if (url.origin !== "https://discord.com" || url.pathname !== "/oauth2/authorize") throw new Error("Redirecionamento inválido");
    location.assign(url.href);
  } catch (error) { sessionStorage.removeItem(proofKey); status.textContent = error.message; login.disabled = !local; }
});
logout.addEventListener("click", async () => {
  try { await request("/auth/logout","POST"); } catch { status.textContent = "Sessão local encerrada; a revogação no servidor não foi confirmada."; }
  token = null;
  login.disabled = !local;
  render(null);
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  try {
    const data = Object.fromEntries(new FormData(form));
    data.country = data.country.toUpperCase();
    if (data.country === "BR" && !data.region.trim()) throw new Error("Informe seu estado.");
    render(await request("/me","PATCH",data));
  } catch (error) { status.textContent = error.message; }
});
async function initialize() {
  const params = new URLSearchParams(location.search);
  if (params.has("code") || params.has("error") || params.has("state")) {
    history.replaceState(null,"",location.pathname);
    if (!local) return;
    const proof = sessionStorage.getItem(proofKey);
    sessionStorage.removeItem(proofKey);
    if (!proof || !params.get("code") || !params.get("state")) { status.textContent = "Login cancelado ou expirado."; login.disabled = false; return; }
    try {
      const result = await request("/auth/finish","POST",{code:params.get("code"),state:params.get("state"),proof});
      token = result.token;
      render(result.profile);
    } catch (error) { status.textContent = error.message; }
  }
  login.disabled = !local;
}
initialize();
