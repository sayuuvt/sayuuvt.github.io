"use strict";
const form = document.querySelector("#config");
const command = document.querySelector("#command");
const status = document.querySelector("#status");
function generate() {
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  const options = ["participants", "runs", "first-to", "base", "opponent-seed", "opponent-rank", "own-seed", "random-seed"];
  const parts = ["python", "-m", "streamcontroller.ladder.simulator"];
  for (const key of options) parts.push("--" + key, String(Number(fields.get(key))));
  parts.push("--duration", String(Number(fields.get("minutes")) * 60));
  command.textContent = parts.join(" ");
  status.textContent = "Comando atualizado. Execute no ambiente Python do StreamControllerProject.";
}
form.addEventListener("submit", (event) => { event.preventDefault(); generate(); });
form.addEventListener("input", () => { command.textContent = ""; status.textContent = "Gere um novo comando."; });
document.querySelector("#copy").addEventListener("click", async () => {
  if (!command.textContent) return;
  try { await navigator.clipboard.writeText(command.textContent); status.textContent = "Comando copiado."; }
  catch { status.textContent = "Não foi possível copiar automaticamente. Selecione o comando acima."; }
});
const metrics = document.querySelector("#metrics");
document.querySelector("#report").addEventListener("change", async (event) => {
  metrics.replaceChildren();
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error("Arquivo acima de 1 MiB");
    const r = JSON.parse(await file.text());
    const values = [
      ["Torneios simulados", r.runs, false],
      ["Confrontos concluídos", r.completed_matches, false],
      ["Cancelamentos", r.cancelled_matches, false],
      ["Confrontos inéditos", r.novel_fraction, true],
      ["Tempo médio na fila (s)", r.mean_queue_seconds, false],
      ["Precisão do Top 8", r.true_top8_recall, true],
    ];
    for (const [, value, pct] of values) {
      if (!Number.isFinite(value) || value < 0 || (pct && value > 1)) throw new Error("Relatório inválido");
    }
    for (const [label, value, pct] of values) {
      const card = document.createElement("article");
      card.className = "ladder-panel";
      const title = document.createElement("h3");
      title.textContent = label;
      const output = document.createElement("p");
      output.textContent = pct ? new Intl.NumberFormat("pt-BR", {style:"percent",maximumFractionDigits:1}).format(value) : new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(value);
      card.append(title, output);
      metrics.append(card);
    }
  } catch {
    metrics.textContent = "Não foi possível ler um relatório válido do simulador Ladder.";
  }
});
generate();
