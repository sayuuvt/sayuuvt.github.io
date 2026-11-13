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
let polls = 0;
let busy = false;
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

async function request(path, body) {
  if (!gateway) throw new Error('O apoio por Pix ainda não está disponível. Volte mais tarde.');
  let result;
  try {
    result = await fetch(gateway + path, {
      method: body ? 'POST' : 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(10000),
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
  } catch {
    throw new Error(
      'Não foi possível confirmar a solicitação. Verifique sua conexão e tente novamente com os mesmos dados.',
    );
  }
  if (!result.ok)
    throw Object.assign(
      new Error(
        result.status === 429
          ? 'Muitas tentativas. Aguarde um minuto.'
          : result.status === 422 || result.status === 400
            ? 'Confira os campos: nome, e-mail, valor, mensagem sem links e consentimento.'
            : 'O serviço está temporariamente indisponível. Tente mais tarde.',
      ),
      { status: result.status },
    );
  return result.json();
}

function amountCents() {
  const value = $('amount').value.trim();
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(value))
    throw new Error('Informe um valor em reais com até duas casas decimais.');
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (
    !Number.isSafeInteger(cents) ||
    cents < configuration.minimum_cents ||
    cents > configuration.maximum_cents
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

function renderPayment() {
  $('payment').hidden = false;
  const messages = {
    awaiting_payment: 'Aguardando Pix. O pagamento será confirmado pelo provedor.',
    paid: 'Apoio confirmado. Obrigada por fazer parte da live! Sua mensagem seguirá para moderação.',
    expired: 'Este Pix expirou. Não pague este código.',
    processing: 'Pagamento em processamento. Aguarde a confirmação.',
    reconciliation_required:
      'Conferindo o pagamento com o provedor. Nenhum recebimento foi confirmado ainda.',
    refunded: 'O Pix foi devolvido.',
    cancelled: 'Este Pix foi cancelado.',
    partially_refunded: 'Este Pix teve devolução parcial.',
  };
  $('payment-status').textContent =
    (payment.simulated ? 'DEMONSTRAÇÃO · SEM DINHEIRO REAL. ' : '') +
    (messages[payment.status] || 'Conferindo solicitação.');
  const waiting = payment.status === 'awaiting_payment' && Date.now() / 1000 < payment.expires_at;
  const ticket = safeTicket(payment.checkout?.ticket_url);
  $('checkout-link').hidden = !waiting || !ticket;
  if (ticket) $('checkout-link').href = ticket;
  $('embedded').hidden = !waiting || configuration.checkout_mode !== 'embedded';
  $('pix-code').value = payment.checkout?.qr_code || '';
  const image = payment.checkout?.qr_code_base64;
  $('qr-image').hidden = !image;
  if (image) $('qr-image').src = 'data:image/png;base64,' + image;
  $('expires').textContent = waiting
    ? 'Válido até ' +
      new Date(payment.expires_at * 1000).toLocaleString('pt-BR') +
      '. A aprovação da mensagem e a reprodução do alerta são independentes do pagamento.'
    : '';
  $('payment').scrollIntoView({ behavior: 'instant', block: 'nearest' });
}

async function check() {
  if (!payment) return;
  clearTimeout(timer);
  try {
    payment = await request('/public/donations/' + encodeURIComponent(payment.id) + '/status');
    renderPayment();
  } catch (e) {
    fail(e.message);
  }
  if (
    ++polls < 30 &&
    ['creating', 'awaiting_payment', 'processing', 'reconciliation_required'].includes(
      payment.status,
    )
  )
    timer = setTimeout(
      () => {
        if (!document.hidden) void check();
      },
      Math.min(10000, 2000 + polls * 500),
    );
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !configuration) return;
  clearError();
  busy = true;
  $('submit').disabled = true;
  try {
    if (!pendingRequest)
      pendingRequest = {
        request_id: crypto.randomUUID(),
        display_name: $('anonymous').checked ? 'Anônimo' : $('display-name').value.trim(),
        anonymous: $('anonymous').checked,
        amount_cents: amountCents(),
        message: $('donation-message').value.trim(),
        voice_id: $('voice').value,
        email: $('email').value.trim(),
        consent: $('consent').checked ? 'privacy-v1' : '',
      };
    fields.disabled = true;
    payment = await request('/public/donations', pendingRequest);
    pendingRequest = undefined;
    $('email').value = '';
    $('donation-message').value = '';
    $('display-name').value = '';
    renderPayment();
    polls = 0;
    timer = setTimeout(check, 2500);
  } catch (e) {
    fail(e.message);
    fields.disabled = false;
    if ([400, 422].includes(e.status)) pendingRequest = undefined;
    if (pendingRequest) {
      // Keep the exact request visible and frozen after an ambiguous timeout.
      // Retrying sends the same UUID/payload, preventing a second order.
      for (const field of form.querySelectorAll('input,textarea,select')) field.disabled = true;
      $('submit').textContent = 'Consultar a mesma solicitação';
    }
  } finally {
    busy = false;
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
$('check-status').addEventListener('click', () => {
  polls = 0;
  void check();
});
$('new-donation').addEventListener('click', () => {
  clearTimeout(timer);
  payment = undefined;
  pendingRequest = undefined;
  form.reset();
  fields.disabled = false;
  for (const field of form.querySelectorAll('input,textarea,select')) field.disabled = false;
  $('display-name').required = true;
  $('submit').textContent = 'Continuar com Pix →';
  $('payment').hidden = true;
  clearError();
  $('display-name').focus();
});
addEventListener('pagehide', () => {
  clearTimeout(timer);
  pendingRequest = undefined;
  $('email').value = '';
});
addEventListener('online', () => {
  if (payment) void check();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && payment && polls < 30) void check();
});

async function initialize() {
  try {
    configuration = await request('/public/donations/config');
    $('notice').textContent =
      configuration.notice +
      (!configuration.live && configuration.offline_notice
        ? ' ' + configuration.offline_notice
        : '');
    $('limits').textContent =
      `De ${format(configuration.minimum_cents)} a ${format(configuration.maximum_cents)}. Apoio voluntário, sem produto em troca.`;
    for (const cents of configuration.suggestions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = format(cents);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        $('amount').value = (cents / 100).toFixed(2).replace('.', ',');
        for (const b of $('suggestions').children)
          b.setAttribute('aria-pressed', String(b === button));
      });
      $('suggestions').append(button);
    }
    for (const voice of configuration.voices) {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.label;
      $('voice').append(option);
    }
    fields.disabled = !configuration.available;
  } catch (e) {
    $('notice').textContent = 'O apoio por Pix está indisponível no momento.';
    fail(e.message);
  }
}
void initialize();
