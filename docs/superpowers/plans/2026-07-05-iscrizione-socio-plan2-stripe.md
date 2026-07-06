# Iscrizione Socio Online — Piano 2: Pagamento Stripe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aggiungere il pagamento online con **Stripe Checkout** al flusso di iscrizione: al submit con metodo "stripe" si crea una sessione di pagamento €30; a pagamento confermato (webhook) il backend genera il PDF e invia l'email a info@ + socio, poi cancella il KV.

**Architecture:** Cloudflare Pages Functions. Chiamate all'API Stripe via `fetch` (niente SDK, incompatibile col runtime). Verifica firma webhook con Web Crypto (`crypto.subtle`). Riusa `pdf.js`, `email.js`, `validate.js`, `config.js` e il KV del Piano 1.

**Tech Stack:** Cloudflare Pages Functions (ES modules), Stripe REST API, Web Crypto HMAC-SHA256, vitest.

## Global Constraints

- Importo €30 = **3000 cent**, valuta **EUR**, fissato lato server (`QUOTA_CENT` da `config.js`). Mai dal client.
- Il PDF/email partono **solo dopo** conferma reale del pagamento via **webhook** `checkout.session.completed` (verifica firma obbligatoria). Il success_url NON deve innescare l'invio.
- **Idempotenza**: se il KV per quella sessione non esiste più (già processato o scaduto), il webhook risponde 200 senza reinviare.
- Segreti solo server: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. La chiave segreta non arriva mai al client.
- KV dei dati in attesa: TTL esteso a **86400s (24h)** per coprire la finestra di pagamento online (Piano 1 usava 3600s per il solo bonifico immediato).
- PDF: stato pagamento "pagato", provider "Stripe", riferimento = `payment_intent` o session id.
- Nessuno storage permanente: KV cancellato dopo l'invio.

---

### Task 1: Libreria Stripe (`functions/_lib/stripe.js`)

**Files:**
- Create: `functions/_lib/stripe.js`
- Test: `functions/_lib/stripe.test.js`

**Interfaces:**
- Consumes: `QUOTA_CENT`, `annoTessera` da `config.js`.
- Produces:
  - `async createCheckoutSession(env, { kvId, email, origin }): Promise<string>` (ritorna l'URL di Checkout; lancia su errore Stripe)
  - `async verifyStripeSignature(rawBody, sigHeader, secret): Promise<boolean>`

- [ ] **Step 1: Scrivere i test (falliscono)**

`functions/_lib/stripe.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCheckoutSession, verifyStripeSignature } from './stripe.js';

afterEach(() => vi.restoreAllMocks());

describe('createCheckoutSession', () => {
  it('POST a Stripe con importo 3000 EUR e ritorna url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const url = await createCheckoutSession({ STRIPE_SECRET_KEY: 'sk_test_x' },
      { kvId: 'isc_1', email: 'mario@example.it', origin: 'https://associazionestill.it' });
    expect(url).toBe('https://checkout.stripe.com/c/pay/abc');
    const [endpoint, opts] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(opts.headers.Authorization).toBe('Bearer sk_test_x');
    expect(opts.body).toContain('mode=payment');
    expect(opts.body).toContain('unit_amount=3000');
    expect(opts.body).toContain('currency=eur');
    expect(opts.body).toContain('client_reference_id=isc_1');
    expect(decodeURIComponent(opts.body)).toContain('customer_email=mario@example.it');
  });

  it('lancia se Stripe risponde non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' }));
    await expect(createCheckoutSession({ STRIPE_SECRET_KEY: 'k' },
      { kvId: 'x', email: 'a@b.it', origin: 'https://x' })).rejects.toThrow();
  });
});

describe('verifyStripeSignature', () => {
  async function signature(payload, secret, t) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `t=${t},v1=${hex}`;
  }

  it('accetta una firma valida', async () => {
    const body = '{"type":"checkout.session.completed"}';
    const header = await signature(body, 'whsec_test', '1720000000');
    expect(await verifyStripeSignature(body, header, 'whsec_test')).toBe(true);
  });

  it('rifiuta una firma manomessa', async () => {
    const body = '{"type":"x"}';
    const header = await signature(body, 'whsec_test', '1720000000');
    expect(await verifyStripeSignature(body + 'tamper', header, 'whsec_test')).toBe(false);
  });

  it('rifiuta header o secret mancanti', async () => {
    expect(await verifyStripeSignature('{}', '', 'whsec')).toBe(false);
    expect(await verifyStripeSignature('{}', 't=1,v1=ab', '')).toBe(false);
  });
});
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/_lib/stripe.test.js`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare `functions/_lib/stripe.js`**

```js
import { QUOTA_CENT, annoTessera } from './config.js';

export async function createCheckoutSession(env, { kvId, email, origin }) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('client_reference_id', kvId);
  params.set('success_url', `${origin}/iscrizione-completata?metodo=stripe`);
  params.set('cancel_url', `${origin}/iscrizione?annullato=1`);
  if (email) params.set('customer_email', email);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'eur');
  params.set('line_items[0][price_data][unit_amount]', String(QUOTA_CENT));
  params.set('line_items[0][price_data][product_data][name]', `Quota associativa ${annoTessera()}`);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Stripe error ${res.status}: ${await res.text()}`);
  }
  const session = await res.json();
  return session.url;
}

export async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const kv of sigHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1);
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`));
  const expected = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 4: Verificare il passaggio**

Run: `npx vitest run functions/_lib/stripe.test.js`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/stripe.js functions/_lib/stripe.test.js
git commit -m "feat: libreria Stripe (checkout session + verifica firma webhook)"
```

---

### Task 2: Ramo Stripe in `submit.js`

**Files:**
- Modify: `functions/api/iscrizione/submit.js`
- Test: `functions/api/iscrizione/submit.test.js` (aggiorna il test stripe)

**Interfaces:**
- Consumes: `createCheckoutSession` da `../../_lib/stripe.js`.
- Produces: risposta `200 { ok:true, metodo:'stripe', url }` per metodo stripe; `502` se Stripe fallisce; paypal resta `501`.

- [ ] **Step 1: Aggiornare il test stripe (RED)**

In `functions/api/iscrizione/submit.test.js`:
1. In cima, aggiungere il mock della libreria Stripe:
```js
vi.mock('../../_lib/stripe.js', () => ({
  createCheckoutSession: vi.fn().mockResolvedValue('https://checkout.stripe.com/c/pay/xyz'),
}));
import { createCheckoutSession } from '../../_lib/stripe.js';
```
2. Sostituire il test "stripe: 501 finché non implementato" con:
```js
  it('stripe: crea checkout session e risponde 200 con url', async () => {
    const { request, env, kv } = makeCtx({ ...valido, metodoPagamento: 'stripe' });
    const res = await onRequestPost({ request, env });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.metodo).toBe('stripe');
    expect(json.url).toMatch(/checkout\.stripe\.com/);
    expect(createCheckoutSession).toHaveBeenCalledOnce();
    expect(kv.store.size).toBe(1); // KV resta: sarà il webhook a cancellarlo
    expect(inviaEmailIscrizione).not.toHaveBeenCalled(); // email solo dopo pagamento
  });
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/api/iscrizione/submit.test.js`
Expected: FAIL — attualmente stripe risponde 501.

- [ ] **Step 3: Modificare `functions/api/iscrizione/submit.js`**

1. Aggiungere l'import in cima:
```js
import { createCheckoutSession } from '../../_lib/stripe.js';
```
2. Cambiare il TTL del `put` da `3600` a `86400`:
```js
  await env.ISCRIZIONI_KV.put(id, JSON.stringify(value), { expirationTtl: 86400 });
```
3. Sostituire il blocco finale (dopo il ramo bonifico) con:
```js
  if (value.metodoPagamento === 'stripe') {
    try {
      const origin = new URL(request.url).origin;
      const url = await createCheckoutSession(env, { kvId: id, email: value.socio.email, origin });
      return json({ ok: true, metodo: 'stripe', url });
    } catch (e) {
      return json({ ok: false, errors: ['Errore nell\'avvio del pagamento: ' + e.message] }, 502);
    }
  }

  // PayPal completato nel Piano 3.
  return json({ ok: false, error: 'pagamento online non ancora disponibile' }, 501);
```

- [ ] **Step 4: Verificare il passaggio + suite intera**

Run: `npx vitest run functions/api/iscrizione/submit.test.js`
Expected: PASS.
Run: `npm test`
Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/iscrizione/submit.js functions/api/iscrizione/submit.test.js
git commit -m "feat: submit avvia Stripe Checkout per metodo stripe (KV TTL 24h)"
```

---

### Task 3: Webhook Stripe (`functions/api/stripe/webhook.js`)

**Files:**
- Create: `functions/api/stripe/webhook.js`
- Test: `functions/api/stripe/webhook.test.js`

**Interfaces:**
- Consumes: `verifyStripeSignature` (`../../_lib/stripe.js`), `generaPdfIscrizione` (`../../_lib/pdf.js`), `inviaEmailIscrizione` (`../../_lib/email.js`).
- Produces: `onRequestPost({ request, env })`.
  - firma non valida → `400`
  - `checkout.session.completed` con KV presente → PDF + email + delete KV, `200`
  - KV assente (idempotenza) → `200` senza reinvio
  - altri tipi evento → `200` senza azione

- [ ] **Step 1: Scrivere i test (falliscono)**

`functions/api/stripe/webhook.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../_lib/pdf.js', () => ({ generaPdfIscrizione: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) }));
vi.mock('../../_lib/email.js', () => ({ inviaEmailIscrizione: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../_lib/stripe.js', () => ({ verifyStripeSignature: vi.fn() }));

import { onRequestPost } from './webhook.js';
import { verifyStripeSignature } from '../../_lib/stripe.js';
import { generaPdfIscrizione } from '../../_lib/pdf.js';
import { inviaEmailIscrizione } from '../../_lib/email.js';

const value = { socio: { nome: 'Mario', cognome: 'Rossi', email: 'mario@example.it' }, tipologiaSocio: 'maggiorenne', metodoPagamento: 'stripe' };

function makeKv(entries = {}) {
  return { store: new Map(Object.entries(entries)),
    get(k) { return Promise.resolve(this.store.get(k) ?? null); },
    delete(k) { this.store.delete(k); return Promise.resolve(); },
    put(k, v) { this.store.set(k, v); return Promise.resolve(); } };
}
function makeReq(bodyObj) {
  const body = JSON.stringify(bodyObj);
  return new Request('http://x/api/stripe/webhook', {
    method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=abc' }, body,
  });
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/stripe/webhook', () => {
  it('firma non valida → 400, nessun invio', async () => {
    verifyStripeSignature.mockResolvedValue(false);
    const env = { ISCRIZIONI_KV: makeKv({ isc_1: JSON.stringify(value) }), STRIPE_WEBHOOK_SECRET: 's' };
    const res = await onRequestPost({ request: makeReq({ type: 'checkout.session.completed' }), env });
    expect(res.status).toBe(400);
    expect(inviaEmailIscrizione).not.toHaveBeenCalled();
  });

  it('checkout.session.completed con KV presente → PDF+email, cancella KV, 200', async () => {
    verifyStripeSignature.mockResolvedValue(true);
    const kv = makeKv({ isc_1: JSON.stringify(value) });
    const env = { ISCRIZIONI_KV: kv, STRIPE_WEBHOOK_SECRET: 's', RESEND_API_KEY: 'k', ASSOCIATION_EMAIL: 'info@associazionestill.it', MAIL_FROM: 'S <n@associazionestill.it>' };
    const evt = { type: 'checkout.session.completed', data: { object: { client_reference_id: 'isc_1', payment_intent: 'pi_123' } } };
    const res = await onRequestPost({ request: makeReq(evt), env });
    expect(res.status).toBe(200);
    expect(generaPdfIscrizione).toHaveBeenCalledOnce();
    const pagamento = generaPdfIscrizione.mock.calls[0][1];
    expect(pagamento.provider).toBe('Stripe');
    expect(pagamento.stato).toBe('pagato');
    expect(inviaEmailIscrizione).toHaveBeenCalledOnce();
    expect(kv.store.size).toBe(0);
  });

  it('KV assente → 200 idempotente, nessun invio', async () => {
    verifyStripeSignature.mockResolvedValue(true);
    const env = { ISCRIZIONI_KV: makeKv(), STRIPE_WEBHOOK_SECRET: 's' };
    const evt = { type: 'checkout.session.completed', data: { object: { client_reference_id: 'mancante' } } };
    const res = await onRequestPost({ request: makeReq(evt), env });
    expect(res.status).toBe(200);
    expect(inviaEmailIscrizione).not.toHaveBeenCalled();
  });

  it('altro tipo evento → 200 senza azione', async () => {
    verifyStripeSignature.mockResolvedValue(true);
    const kv = makeKv({ isc_1: JSON.stringify(value) });
    const env = { ISCRIZIONI_KV: kv, STRIPE_WEBHOOK_SECRET: 's' };
    const res = await onRequestPost({ request: makeReq({ type: 'payment_intent.created', data: { object: {} } }), env });
    expect(res.status).toBe(200);
    expect(inviaEmailIscrizione).not.toHaveBeenCalled();
    expect(kv.store.size).toBe(1);
  });
});
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/api/stripe/webhook.test.js`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare `functions/api/stripe/webhook.js`**

```js
import { verifyStripeSignature } from '../../_lib/stripe.js';
import { generaPdfIscrizione } from '../../_lib/pdf.js';
import { inviaEmailIscrizione } from '../../_lib/email.js';

const ok200 = () =>
  new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  const valid = await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('invalid signature', { status: 400 });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') return ok200();

  const session = event.data?.object || {};
  const kvId = session.client_reference_id;
  const stored = kvId ? await env.ISCRIZIONI_KV.get(kvId) : null;
  if (!stored) return ok200(); // idempotenza: già processato o scaduto

  const value = JSON.parse(stored);
  const pdf = await generaPdfIscrizione(value, {
    stato: 'pagato',
    provider: 'Stripe',
    riferimento: session.payment_intent || session.id || '',
  });
  await inviaEmailIscrizione(value, pdf, env);
  await env.ISCRIZIONI_KV.delete(kvId);
  return ok200();
}
```

- [ ] **Step 4: Verificare il passaggio + suite**

Run: `npx vitest run functions/api/stripe/webhook.test.js`
Expected: PASS (4 test).
Run: `npm test`
Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/stripe/webhook.js functions/api/stripe/webhook.test.js
git commit -m "feat: webhook Stripe (verifica firma, PDF+email su pagamento, idempotente)"
```

---

### Task 4: Frontend — redirect a Stripe e gestione annullamento

**Files:**
- Modify: `iscrizione.html`
- Modify: `iscrizione-completata.html`

**Interfaces:**
- Consumes: risposta `submit` `{ ok:true, url }` (redirect) e query `?annullato=1` su `/iscrizione`, `?metodo=stripe` su `/iscrizione-completata`.

- [ ] **Step 1: Redirect al pagamento nel submit handler**

In `iscrizione.html`, nel gestore submit, DOPO aver ottenuto `json` e PRIMA del controllo `json.metodo === 'bonifico'`, aggiungere il redirect a URL di pagamento (Stripe e, in futuro, PayPal):
```js
      if (json.url) { window.location.href = json.url; return; }
```
Il ramo `res.status === 501` resta e ora riguarda solo PayPal (messaggio invariato "disponibile a breve").

- [ ] **Step 2: Aggiornare l'etichetta del metodo Stripe**

In `iscrizione.html`, nella sezione "Metodo di pagamento", RIMUOVERE la nota "Disponibile a breve" dall'opzione **Stripe** (Carta di credito). Lasciarla sull'opzione **PayPal**. (Individuare i due elementi di nota e togliere solo quello sotto la radio `value="stripe"`.)

- [ ] **Step 3: Avviso di pagamento annullato**

In `iscrizione.html`, aggiungere all'inizio dello script un avviso se l'utente torna da un pagamento annullato:
```js
  if (new URLSearchParams(location.search).get('annullato') === '1') {
    esito.style.display = 'block';
    esito.textContent = 'Pagamento annullato. Puoi riprovare o scegliere un altro metodo.';
  }
```
(Assicurarsi che `esito` sia già definito a quel punto; altrimenti spostare l'avviso dopo la sua definizione.)

- [ ] **Step 4: Messaggio esito per Stripe**

In `iscrizione-completata.html`, nel blocco JS che gestisce `?metodo`, aggiungere un ramo esplicito per `stripe` (oltre a bonifico e al generico):
```js
  } else if (metodo === 'stripe') {
    box.innerHTML = `<p>Pagamento con carta ricevuto. Grazie!</p>
      <p>Ti abbiamo inviato via email una copia del modulo compilato. La tua iscrizione sarà registrata a breve.</p>`;
```
(Nota: `metodo` proviene da `URLSearchParams` ma è solo confrontato, non interpolato — nessun rischio XSS. Il testo inserito è statico.)

- [ ] **Step 5: Verifica manuale (screenshot)**

Run (server statico, se non attivo): `node serve.mjs`
Run: `node screenshot.mjs "http://localhost:3000/iscrizione.html?annullato=1" iscrizione-annullato`
Leggere il PNG: confermare l'avviso di annullamento in cima e che l'opzione Stripe non riporta più "Disponibile a breve".
Run: `node screenshot.mjs "http://localhost:3000/iscrizione-completata.html?metodo=stripe" esito-stripe`
Leggere il PNG: confermare il messaggio di pagamento carta ricevuto.

- [ ] **Step 6: Commit**

```bash
git add iscrizione.html iscrizione-completata.html
git commit -m "feat: frontend redirect a Stripe, avviso annullamento, esito stripe"
```

---

## Self-Review (esito)

- **Copertura spec (Stripe, spec §7):** creazione Checkout Session €30 (Task 1-2) ✓; verifica firma webhook (Task 1) ✓; PDF+email solo su `checkout.session.completed` verificato (Task 3) ✓; idempotenza KV (Task 3) ✓; importo server-side (Task 1) ✓; redirect frontend + annullamento + esito (Task 4) ✓. KV TTL esteso a 24h per la finestra di pagamento (Task 2) ✓.
- **Placeholder:** nessuno. Segreti `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` forniti in Cloudflare (già documentati in `functions/README.md`).
- **Coerenza tipi:** `createCheckoutSession(env,{kvId,email,origin})→url` e `verifyStripeSignature(rawBody,sigHeader,secret)→bool` usati con firme identiche in `submit.js`, `webhook.js` e nei test. `generaPdfIscrizione(value,{stato,provider,riferimento})` e `inviaEmailIscrizione(value,pdfBytes,env)` invariati dal Piano 1.

## Dipendenze esterne (prima del go-live)
- Configurare in Stripe l'endpoint webhook `https://associazionestill.it/api/stripe/webhook` per l'evento `checkout.session.completed` e copiare il signing secret in `STRIPE_WEBHOOK_SECRET`.
- Chiavi Stripe (test per la QA, live per la produzione) impostate come variabili Cloudflare Pages.
