(() => {
  "use strict";

  const CHANNEL = "sayuuvt";
  const LIVE_POLL_MS = 2 * 60 * 1000;

  // === Ano no footer ===
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  // === E-mail (montado em runtime pra não ficar em texto puro no HTML) ===
  const email = document.querySelector("[data-email]");
  const contact = document.querySelector("[data-contact]");
  if (email && contact && email.dataset.user && email.dataset.domain) {
    const address = `${email.dataset.user}@${email.dataset.domain}`;
    email.href = `mailto:${address}`;
    email.querySelector("[data-email-text]").textContent = address;
    contact.hidden = false;

    const copy = contact.querySelector("[data-copy]");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(address);
        copy.textContent = "Copiado";
        copy.classList.add("is-done");
      } catch {
        copy.textContent = "Erro";
      }
      setTimeout(() => {
        copy.textContent = "Copiar";
        copy.classList.remove("is-done");
      }, 1800);
    });
  }

  // === Status AO VIVO (compartilhado pelas páginas de links e doação) ===
  const avatar = document.querySelector(".avatar");
  const badge = document.querySelector("[data-live-badge]");
  const twitchLink = document.querySelector("[data-twitch-link]");
  const tag = document.querySelector("[data-live-tag]");
  const sub = document.querySelector("[data-twitch-sub]");
  const defaultSub = sub?.textContent ?? "";
  let checking = false;

  const fetchText = async (path) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`https://decapi.me/twitch/${path}/${CHANNEL}`, {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(res.status);
      return (await res.text()).trim();
    } finally {
      clearTimeout(timeout);
    }
  };

  const setLive = (live) => {
    avatar?.classList.toggle("is-live", live);
    avatar?.setAttribute("aria-label", live ? "Abrir canal na Twitch — ao vivo" : "Abrir canal na Twitch");
    twitchLink?.classList.toggle("is-live", live);
    if (badge) badge.hidden = !live;
    if (tag) tag.hidden = !live;
    if (sub) sub.textContent = live ? "Assistir agora" : defaultSub;
  };

  const checkLive = async () => {
    if (checking || document.hidden) return;
    checking = true;
    try {
      const uptime = await fetchText("uptime");
      // Só confirma a transmissão quando a resposta contém uma duração válida.
      const live = /^(?:\d+\s+(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))(?:,\s*\d+\s+(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))*$/i.test(uptime);
      setLive(live);
      // A página de doação precisa apenas do status, não da categoria do jogo.
      if (live && sub) {
        const game = await fetchText("game").catch(() => "");
        if (game && !/error|not found|no user|offline/i.test(game)) {
          sub.textContent = `Jogando ${game}`;
        }
      }
    } catch {
      // Falha de rede/serviço: não anuncia uma transmissão sem confirmação.
      setLive(false);
    } finally {
      checking = false;
    }
  };

  if (avatar && badge) {
    void checkLive();
    setInterval(checkLive, LIVE_POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void checkLive();
    });
  }
})();
