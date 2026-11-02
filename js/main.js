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

  // === Badge AO VIVO ===
  // decapi.me responde texto puro e libera CORS; offline => "<canal> is offline".
  const avatar = document.querySelector(".avatar");
  const badge = document.querySelector("[data-live-badge]");
  const twitchLink = document.querySelector("[data-twitch-link]");
  const tag = document.querySelector("[data-live-tag]");
  const sub = document.querySelector("[data-twitch-sub]");
  const defaultSub = sub ? sub.textContent : "";

  const fetchText = async (path) => {
    const res = await fetch(`https://decapi.me/twitch/${path}/${CHANNEL}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return (await res.text()).trim();
  };

  const setLive = (live, game) => {
    avatar.classList.toggle("is-live", live);
    twitchLink.classList.toggle("is-live", live);
    badge.hidden = !live;
    tag.hidden = !live;
    sub.textContent = live ? (game ? `Jogando ${game}` : "Assistir agora") : defaultSub;
  };

  const checkLive = async () => {
    try {
      const uptime = await fetchText("uptime");
      const live = uptime !== "" && !/offline|error|not found|no user/i.test(uptime);
      let game = "";
      if (live) {
        game = await fetchText("game").catch(() => "");
        if (/error|not found/i.test(game)) game = "";
      }
      setLive(live, game);
    } catch {
      // Falha de rede/serviço: mantém o estado offline silenciosamente.
      setLive(false);
    }
  };

  if (avatar && badge && twitchLink && tag && sub) {
    checkLive();
    setInterval(() => {
      if (!document.hidden) checkLive();
    }, LIVE_POLL_MS);
  }
})();
