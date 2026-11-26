// Public configuration only: the gateway exposes just /public/* and the Mercado Pago webhook.
const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
const gateway = local ? 'http://127.0.0.1:5111' : 'https://sayuuvt-pc.taile1dc42.ts.net:8443';
const $ = (id) => document.getElementById(id);
const form = $('donation-form');
const fields = $('fields');
const error = $('error');
let configuration;
let payment;
let pendingRequest;
let timer;
let statusRequest;
let generation = 0;
let pageActive = true;
let paymentStartedAt = 0;
let pollDelay = 2500;
let configFresh = false;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_POLL_MS = 60 * 60 * 1000;
const ACTIVE = new Set(['creating', 'awaiting_payment', 'processing', 'reconciliation_required']);
const STATUSES = new Set([...ACTIVE, 'paid', 'expired', 'refunded', 'cancelled', 'partially_refunded', 'failed']);
let busy = false;
let checkoutTab = null;
let catalogRequest;
let catalogTimer;
const format = (cents) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fail = (message) => {
  error.textContent = message;
  error.hidden = false;
};
const clearError = () => {
  error.hidden = true;
  error.textContent = '';
};

async function request(path, body, controller = new AbortController()) {
  if (!gateway) throw new Error('O apoio por Pix ainda não está disponível. Volte mais tarde.');
  let result;
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    result = await fetch(gateway + path, {
      method: body ? 'POST' : 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
  } catch {
    clearTimeout(timeout);
    throw new Error(
      'Não foi possível confirmar a solicitação. Verifique sua conexão e tente novamente com os mesmos dados.',
    );
  }
  try {
    if (!result.ok)
      throw Object.assign(
      new Error(
        result.status === 429
          ? 'Muitas tentativas. Aguarde um minuto.'
          : result.status === 422 || result.status === 400
            ? 'Confira os campos: apelido, e-mail, valor, mensagem sem links.'
            : 'O serviço está temporariamente indisponível. Tente mais tarde.',
      ),
      { status: result.status },
    );
    try {
      return await result.json();
    } catch {
      throw new Error('Resposta do serviço inválida. Tente consultar novamente.');
    }
  } finally {
    clearTimeout(timeout);
  }
}

function validateConfiguration(value) {
  const validCents = (n) => Number.isSafeInteger(n) && n >= 100;
  if (!value || typeof value.available !== 'boolean' || typeof value.live !== 'boolean' ||
      !validCents(value.minimum_cents) ||
      !['external', 'embedded'].includes(value.checkout_mode) ||
      !Array.isArray(value.suggestions) || value.suggestions.length > 8 ||
      !value.suggestions.every((n) => validCents(n) && n >= value.minimum_cents) ||
      !Array.isArray(value.voices) || !value.voices.every((v) =>
        v && typeof v.id === 'string' && v.id.length > 0 && typeof v.label === 'string')) {
    throw new Error('Configuração do Pix inválida. Tente novamente mais tarde.');
  }
  return value;
}

function validatePayment(value, expectedId) {
  if (!value || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(value.id) ||
      (expectedId && value.id !== expectedId) || !STATUSES.has(value.status) ||
      !Number.isSafeInteger(value.amount_cents) || value.amount_cents < 100 ||
      !Number.isFinite(value.expires_at) || value.expires_at <= 0 ||
      typeof value.simulated !== 'boolean' || !value.checkout ||
      typeof value.checkout !== 'object' || Array.isArray(value.checkout)) {
    throw new Error('Resposta de pagamento inválida. Não crie outra cobrança até confirmar a anterior.');
  }
  for (const key of ['ticket_url', 'qr_code', 'qr_code_base64']) {
    if (value.checkout[key] != null && typeof value.checkout[key] !== 'string') {
      throw new Error('Dados de checkout inválidos. Consulte novamente a mesma solicitação.');
    }
  }
  return value;
}

function amountCents() {
  const value = $('amount').value.trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(value))
    throw new Error('Informe um valor em reais com até duas casas decimais.');
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const cents = Number(whole + fraction.padEnd(2, '0'));
  if (
    !Number.isSafeInteger(cents) ||
    cents < configuration.minimum_cents
  )
    throw new Error('O valor está fora dos limites informados.');
  return cents;
}

function safeTicket(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'www.mercadopago.com.br' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      /^\/(sandbox\/)?payments\/[A-Za-z0-9_-]+\/ticket$/.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function renderPayment({ initial = false } = {}) {
  $('payment').hidden = false;
  const headlines = {
    paid: ['Pagamento confirmado 😊', 'status-paid'],
    creating: ['Criando pagamento...', 'status-waiting'],
    processing: ['Pagamento em processamento...', 'status-waiting'],
    reconciliation_required: ['Pagamento em verificação...', 'status-waiting'],
    failed: ['Não foi possível concluir o pagamento', 'status-ended'],
    expired: ['Pix expirado', 'status-ended'],
    refunded: ['Pix reembolsado', 'status-ended'],
    cancelled: ['Pix cancelado', 'status-ended'],
    partially_refunded: ['Pix com reembolso parcial', 'status-ended'],
  };
  const [headline, tone] = headlines[payment.status] || ['Aguardando pagamento...', 'status-waiting'];
  const title = $('payment-title');
  const locallyExpired = payment.status === 'awaiting_payment' && Date.now() / 1000 >= payment.expires_at;
  const label = (payment.simulated ? 'DEMONSTRAÇÃO · ' : '') +
    (locallyExpired ? 'Prazo do Pix encerrado; verificando confirmação...' : headline);
  if (title.textContent !== label) title.textContent = label;
  title.className = tone;
  const waiting = payment.status === 'awaiting_payment' && Date.now() / 1000 < payment.expires_at;
  const ticket = safeTicket(payment.checkout?.ticket_url);
  $('checkout-link').hidden = !waiting || !ticket;
  if (waiting && ticket) $('checkout-link').href = ticket;
  else $('checkout-link').removeAttribute('href');
  const embedded = waiting && configuration.checkout_mode === 'embedded';
  const code = embedded ? payment.checkout?.qr_code || '' : '';
  const image = embedded ? payment.checkout?.qr_code_base64 : '';
  $('embedded').hidden = !embedded || (!code && !image);
  if ($('pix-code').value !== code) $('pix-code').value = code;
  $('copy-code').disabled = !code;
  $('qr-image').hidden = !image;
  if (image) {
    const src = 'data:image/png;base64,' + image;
    if ($('qr-image').getAttribute('src') !== src) $('qr-image').src = src;
  } else $('qr-image').removeAttribute('src');
  $('refresh-payment').hidden = !ACTIVE.has(payment.status);
  if (checkoutTab) {
    if (waiting && ticket) {
      try {
        if (!checkoutTab.closed) checkoutTab.location.href = ticket;
      } catch {
        // O link manual continua disponível se o navegador bloquear a navegação.
      }
      checkoutTab = null;
    } else if (!['creating', 'processing', 'reconciliation_required'].includes(payment.status)) {
      closeCheckoutTab();
    }
  }
  updateNavigationGuard();
  if (initial) {
    title.focus({ preventScroll: true });
    $('payment').scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }
}

// Aba reservada no clique (antes do await) para o navegador não bloquear como pop-up.
function reserveCheckoutTab() {
  try {
    const tab = window.open('about:blank', '_blank');
    if (tab) {
      tab.opener = null;
      tab.document.title = 'Mercado Pago';
      tab.document.body.textContent = 'Abrindo o pagamento Pix…';
    }
    return tab;
  } catch {
    return null;
  }
}

function stopStatus() {
  clearTimeout(timer);
  timer = undefined;
  generation += 1;
  statusRequest?.abort();
  statusRequest = undefined;
}

function closeCheckoutTab() {
  try { checkoutTab?.close(); } catch { /* Aba já encerrada. */ }
  checkoutTab = null;
}

function scheduleStatus(delay = pollDelay) {
  clearTimeout(timer);
  if (!pageActive || !payment || !ACTIVE.has(payment.status)) return;
  if (Date.now() - paymentStartedAt >= MAX_POLL_MS) {
    fail('A consulta automática foi pausada. Use "Atualizar status" para consultar esta cobrança.');
    return;
  }
  timer = setTimeout(() => void check(), delay);
}

async function check({ manual = false } = {}) {
  if (!pageActive || !payment || !ACTIVE.has(payment.status) || statusRequest) return;
  if (manual) {
    paymentStartedAt = Date.now();
    pollDelay = 2500;
  }
  if (Date.now() - paymentStartedAt >= MAX_POLL_MS) {
    scheduleStatus();
    return;
  }
  clearTimeout(timer);
  renderPayment();
  const current = generation;
  const id = payment.id;
  const controller = new AbortController();
  statusRequest = controller;
  const isCurrent = () => generation === current && payment?.id === id && pageActive;
  try {
    const next = validatePayment(await request('/public/donations/' + encodeURIComponent(id) + '/status', undefined, controller), id);
    if (!isCurrent()) return;
    if (next.amount_cents !== payment.amount_cents)
      throw new Error('Valor retornado não corresponde à cobrança. Atualize o status novamente.');
    payment = next;
    clearError();
    renderPayment();
  } catch (e) {
    if (isCurrent()) fail(e.message);
  } finally {
    if (statusRequest === controller) statusRequest = undefined;
    if (isCurrent()) {
      pollDelay = Math.min(8000, pollDelay + 500);
      scheduleStatus();
    }
  }
}

function freezePending() {
  fields.disabled = false;
  for (const field of form.querySelectorAll('input,textarea,select,.suggestions button')) field.disabled = true;
  $('submit').textContent = 'Consultar a mesma solicitação';
}

function restoreFields() {
  for (const field of form.querySelectorAll('input,textarea,select,.suggestions button')) field.disabled = false;
  $('display-name').required = !$('anonymous').checked;
  $('display-name').disabled = $('anonymous').checked;
  updateVoiceVisibility();
  fields.disabled = !configFresh || !configuration?.available;
  $('submit').textContent = 'Continuar com Pix →';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || payment || !configuration) return;
  clearError();
  const retrying = Boolean(pendingRequest);
  busy = true;
  updateNavigationGuard();
  $('submit').disabled = true;
  closeCheckoutTab();
  if (configuration.checkout_mode === 'external') checkoutTab = reserveCheckoutTab();
  try {
    if (!pendingRequest) {
      await synchronizeCatalog();
      if (!configuration.available) throw new Error('O apoio por Pix está indisponível no momento.');
      if (configuration.live && !configuration.voices.some((voice) => voice.id === $('voice').value))
        throw new Error('A lista de vozes mudou. Escolha uma voz antes de continuar.');
      pendingRequest = {
        request_id: crypto.randomUUID(),
        display_name: $('anonymous').checked ? 'Anônimo' : $('display-name').value.trim(),
        anonymous: $('anonymous').checked,
        amount_cents: amountCents(),
        message: $('donation-message').value.trim(),
        voice_id: configuration.live ? $('voice').value : 'none',
        email: $('email').value.trim(),
      };
    }
    fields.disabled = true;
    const next = validatePayment(await request('/public/donations', pendingRequest));
    if (next.amount_cents !== pendingRequest.amount_cents)
      throw new Error('Valor retornado não corresponde à solicitação. Consulte novamente a mesma cobrança.');
    stopStatus();
    payment = next;
    pendingRequest = undefined;
    $('email').value = '';
    $('donation-message').value = '';
    $('display-name').value = '';
    paymentStartedAt = Date.now();
    pollDelay = 2500;
    $('copy-code').textContent = 'Copiar código Pix';
    renderPayment({ initial: true });
    scheduleStatus();
  } catch (e) {
    closeCheckoutTab();
    fail(e.message);
    // Um erro posterior não prova que a primeira criação ambígua falhou.
    if (!retrying && [400, 422].includes(e.status)) pendingRequest = undefined;
    if (pendingRequest) freezePending();
    else if (payment) fields.disabled = true;
    else restoreFields();
  } finally {
    busy = false;
    updateNavigationGuard();
    $('submit').disabled = false;
  }
});
$('anonymous').addEventListener('change', () => {
  $('display-name').required = !$('anonymous').checked;
  $('display-name').disabled = $('anonymous').checked;
});
$('copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('pix-code').value);
    $('copy-code').textContent = 'Código copiado';
  } catch {
    $('pix-code').focus();
    $('pix-code').select();
    fail('Selecione e copie o código exibido.');
  }
});
$('refresh-payment').addEventListener('click', () => void check({ manual: true }));
$('new-donation').addEventListener('click', () => {
  if (busy) return;
  if (payment && ACTIVE.has(payment.status) &&
      !window.confirm('A cobrança anterior ainda pode ser paga. Deseja começar outro apoio mesmo assim?')) return;
  stopStatus();
  closeCheckoutTab();
  payment = undefined;
  pendingRequest = undefined;
  form.reset();
  configFresh = false;
  restoreFields();
  syncSuggestions();
  $('payment').hidden = true;
  $('checkout-link').removeAttribute('href');
  $('qr-image').removeAttribute('src');
  $('pix-code').value = '';
  $('copy-code').textContent = 'Copiar código Pix';
  clearError();
  updateNavigationGuard();
  void synchronizeCatalog().then(() => {
    if (!fields.disabled) $('display-name').focus();
  }).catch((e) => fail(e.message));
});
// Nenhum dado pessoal ou identificador de pagamento é persistido no navegador.
function warnPendingNavigation(event) {
  if (pendingRequest || busy || (payment && ACTIVE.has(payment.status))) {
    event.preventDefault();
    event.returnValue = '';
  }
}
function updateNavigationGuard() {
  if (pendingRequest || busy || (payment && ACTIVE.has(payment.status))) {
    addEventListener('beforeunload', warnPendingNavigation);
  } else {
    removeEventListener('beforeunload', warnPendingNavigation);
  }
}
addEventListener('pagehide', (event) => {
  pageActive = false;
  stopStatus();
  clearInterval(catalogTimer);
  if (!event.persisted) {
    closeCheckoutTab();
    // A recuperação após fechar/recarregar depende de um contrato novo no backend.
  }
});
addEventListener('online', () => {
  if (payment) void check();
  refreshCatalogWhenIdle();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && payment) void check();
  if (!document.hidden) refreshCatalogWhenIdle();
});
addEventListener('focus', refreshCatalogWhenIdle);
addEventListener('pageshow', () => {
  pageActive = true;
  if (payment) void check();
  clearInterval(catalogTimer);
  catalogTimer = setInterval(() => { if (!document.hidden) refreshCatalogWhenIdle(); }, 60000);
  refreshCatalogWhenIdle();
});

function updateVoiceVisibility() {
  if (pendingRequest) return;
  const live = configuration?.live === true;
  $('voice-field').hidden = !live;
  $('voice').disabled = !live;
  $('voice').required = live;
}

function synchronizeCatalog() {
  if (catalogRequest) return catalogRequest;
  catalogRequest = request('/public/donations/config').then((response) => {
    const next = validateConfiguration(response);
    configFresh = true;
    // Checkout e payload de uma cobrança ativa são imutáveis.
    if (payment || pendingRequest) return;
    const previous = configuration;
    const selected = $('voice').value;
    configuration = next;
    // O aviso só aparece quando o apoio está indisponível (sem texto fixo sobre o provedor).
    if (!configuration.available) showUnavailable();
    else if (configuration.simulated === true) {
      $('notice').textContent = 'DEMONSTRAÇÃO · Nenhum pagamento real será processado.';
      $('notice').hidden = false;
    } else $('notice').hidden = true;
    $('limits').textContent =
      `A partir de ${format(configuration.minimum_cents)}. Apoio voluntário, sem produto em troca.`;
    if (JSON.stringify(previous?.suggestions) !== JSON.stringify(configuration.suggestions)) {
      $('suggestions').replaceChildren();
      for (const cents of configuration.suggestions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = format(cents);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          $('amount').value = (cents / 100).toFixed(2).replace('.', ',');
          syncSuggestions();
        });
        $('suggestions').append(button);
      }
    }
    if (JSON.stringify(previous?.voices) !== JSON.stringify(configuration.voices)) {
      $('voice').replaceChildren();
      for (const voice of configuration.voices) {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.label;
        $('voice').append(option);
      }
      if (selected && configuration.voices.some((voice) => voice.id === selected)) $('voice').value = selected;
      else if (previous) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Escolha uma voz';
        placeholder.disabled = true;
        $('voice').prepend(placeholder);
        $('voice').value = '';
      }
    }
    updateVoiceVisibility();
    syncSuggestions();
    fields.disabled = !configuration.available;
    if (configuration.available && !busy) clearError();
  }).catch((e) => {
    configFresh = false;
    if (!payment && !pendingRequest) {
      fields.disabled = true;
      showUnavailable();
    }
    throw e;
  }).finally(() => { catalogRequest = undefined; });
  return catalogRequest;
}
function refreshCatalogWhenIdle() {
  if (busy || payment || pendingRequest || !pageActive) return;
  void synchronizeCatalog().catch((e) => {
    if (payment || pendingRequest) return;
    showUnavailable();
    fail(e.message);
  });
}
function syncSuggestions() {
  let cents;
  try { cents = amountCents(); } catch { cents = undefined; }
  [...$('suggestions').children].forEach((button, index) => {
    button.setAttribute('aria-pressed', String(cents === configuration?.suggestions[index]));
  });
}
$('amount').addEventListener('input', syncSuggestions);
function showUnavailable() {
  $('notice').textContent = 'O apoio por Pix está indisponível no momento.';
  $('notice').hidden = false;
}
refreshCatalogWhenIdle();
