# Iscrizione Socio Online — Piano 3: Pagamento PayPal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aggiungere il pagamento con **PayPal** (Orders API v2) al flusso di iscrizione, con lo stesso pattern redirect/server-authoritative di Stripe: creazione ordine lato server → approvazione su PayPal → cattura lato server; a pagamento `COMPLETED` il backend genera il PDF e invia l'email a info@ + socio, poi cancella il KV.

**Architecture:** Cloudflare Pages Functions. Chiamate all'API PayPal via `fetch` (OAuth2 client_credentials + Orders v2). L'id del record KV viaggia nell'ordine come `custom_id` e torna nella risposta di cattura (nessun parametro fidato dal client). Riusa `pdf.js`, `email.js`, `config.js`, KV e il redirect `json.url` già presente nel frontend (Piano 2).

**Tech Stack:** Cloudflare Pages Functions (ES modules), PayPal REST API v2, vitest.

## Global Constraints

- Importo €30 = **3000 cent** (`QUOTA_CENT`), inviato a PayPal come `value: '30.00'`, `currency_code: 'EUR'`, calcolato lato server. Mai dal client.
- Ambiente PayPal via `PAYPAL_ENV` (`sandbox` | `live`) → base URL `https://api-m.sandbox.paypal.com` o `https://api-m.paypal.com`.
- Segreti solo server: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`. Autenticazione OAuth2 con Basic `base64(client_id:secret)`.
- PDF/email partono **solo dopo** cattura con `status === 'COMPLETED'`. La pagina di ritorno non innesca l'invio: lo fa l'endpoint di cattura server-side.
- L'id KV è trasportato come `custom_id` dell'ordine e **letto dalla risposta di cattura** (fonte di verità PayPal), non da query param del client.
- Idempotenza: se il KV per quel `custom_id` non esiste più → nessun reinvio.
- Nessuno storage permanente: KV cancellato dopo l'invio.
- PDF: stato "pagato", provider "PayPal", riferimento = id della capture.

---

### Task 1: Libreria PayPal (`functions/_lib/paypal.js`)

**Files:**
- Create: `functions/_lib/paypal.js`
- Test: `functions/_lib/paypal.test.js`

**Interfaces:**
- Consumes: `QUOTA_CENT`, `annoTessera` da `config.js`.
- Produces:
  - `paypalBase(env): string`
  - `async getAccessToken(env): Promise<string>`
  - `async createPayPalOrder(env, { kvId, origin }): Promise<string>` (ritorna l'URL di approvazione; lancia su errore)
  - `async capturePayPalOrder(env, orderId): Promise<{ status, customId, captureId }>`

- [ ] **Step 1: Scrivere i test (falliscono)**

`functions/_lib/paypal.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { paypalBase, getAccessToken, createPayPalOrder, capturePayPalOrder } from './paypal.js';

afterEach(() => vi.restoreAllMocks());

describe('paypalBase', () => {
  it('usa sandbox di default e live se PAYPAL_ENV=live', () => {
    expect(paypalBase({})).toBe('https://api-m.sandbox.paypal.com');
    expect(paypalBase({ PAYPAL_ENV: 'sandbox' })).toBe('https://api-m.sandbox.paypal.com');
    expect(paypalBase({ PAYPAL_ENV: 'live' })).toBe('https://api-m.paypal.com');
  });
});

describe('getAccessToken', () => {
  it('POST oauth2/token con Basic auth e ritorna access_token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'A123' }) });
    vi.stubGlobal('fetch', fetchMock);
    const tok = await getAccessToken({ PAYPAL_CLIENT_ID: 'cid', PAYPAL_SECRET: 'sec' });
    expect(tok).toBe('A123');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    expect(opts.headers.Authorization).toBe('Basic ' + btoa('cid:sec'));
    expect(opts.body).toContain('grant_type=client_credentials');
  });
  it('lancia se oauth non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'no' }));
    await expect(getAccessToken({ PAYPAL_CLIENT_ID: 'x', PAYPAL_SECRET: 'y' })).rejects.toThrow();
  });
});

describe('createPayPalOrder', () => {
  it('crea ordine EUR 30.00 con custom_id e ritorna il link di approvazione', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'A' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        id: 'ORD1', status: 'CREATED',
        links: [{ rel: 'self', href: 'x' }, { rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=ORD1' }],
      }) });
    vi.stubGlobal('fetch', fetchMock);
    const url = await createPayPalOrder({ PAYPAL_CLIENT_ID: 'c', PAYPAL_SECRET: 's' },
      { kvId: 'isc_1', origin: 'https://associazionestill.it' });
    expect(url).toBe('https://www.paypal.com/checkoutnow?token=ORD1');
    const [orderUrl, opts] = fetchMock.mock.calls[1];
    expect(orderUrl).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    const body = JSON.parse(opts.body);
    expect(body.intent).toBe('CAPTURE');
    expect(body.purchase_units[0].amount.currency_code).toBe('EUR');
    expect(body.purchase_units[0].amount.value).toBe('30.00');
    expect(body.purchase_units[0].custom_id).toBe('isc_1');
    expect(body.application_context.return_url).toBe('https://associazionestill.it/api/paypal/capture');
    expect(body.application_context.cancel_url).toBe('https://associazionestill.it/iscrizione?annullato=1');
  });
  it('accetta anche rel payer-action', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'A' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        id: 'ORD2', links: [{ rel: 'payer-action', href: 'https://www.paypal.com/x?token=ORD2' }],
      }) });
    vi.stubGlobal('fetch', fetchMock);
    const url = await createPayPalOrder({}, { kvId: 'k', origin: 'https://x' });
    expect(url).toBe('https://www.paypal.com/x?token=ORD2');
  });
});

describe('capturePayPalOrder', () => {
  it('cattura e ritorna status/customId/captureId', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'A' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', custom_id: 'isc_1' }] } }],
      }) });
    vi.stubGlobal('fetch', fetchMock);
    const res = await capturePayPalOrder({}, 'ORD1');
    expect(res.status).toBe('COMPLETED');
    expect(res.customId).toBe('isc_1');
    expect(res.captureId).toBe('CAP1');
    const [capUrl] = fetchMock.mock.calls[1];
    expect(capUrl).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders/ORD1/capture');
  });
});
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/_lib/paypal.test.js`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare `functions/_lib/paypal.js`**

```js
import { QUOTA_CENT, annoTessera } from './config.js';

export function paypalBase(env) {
  return env && env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export async function getAccessToken(env) {
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

export async function createPayPalOrder(env, { kvId, origin }) {
  const token = await getAccessToken(env);
  const value = (QUOTA_CENT / 100).toFixed(2);
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'EUR', value },
      custom_id: kvId,
      description: `Quota associativa ${annoTessera()}`,
    }],
    application_context: {
      brand_name: 'Associazione Italiana Malattia di Still',
      user_action: 'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
      return_url: `${origin}/api/paypal/capture`,
      cancel_url: `${origin}/iscrizione?annullato=1`,
    },
  };
  const res = await fetch(`${paypalBase(env)}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PayPal order error ${res.status}: ${await res.text()}`);
  const order = await res.json();
  const link = (order.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
  if (!link) throw new Error('PayPal: link di approvazione mancante');
  return link.href;
}

export async function capturePayPalOrder(env, orderId) {
  const token = await getAccessToken(env);
  const res = await fetch(`${paypalBase(env)}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`PayPal capture error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const cap = data.purchase_units?.[0]?.payments?.captures?.[0] || {};
  return {
    status: data.status,
    customId: cap.custom_id || data.purchase_units?.[0]?.custom_id || '',
    captureId: cap.id || '',
  };
}
```

- [ ] **Step 4: Verificare il passaggio**

Run: `npx vitest run functions/_lib/paypal.test.js`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/paypal.js functions/_lib/paypal.test.js
git commit -m "feat: libreria PayPal (OAuth, creazione ordine, cattura)"
```

---

### Task 2: Ramo PayPal in `submit.js`

**Files:**
- Modify: `functions/api/iscrizione/submit.js`
- Test: `functions/api/iscrizione/submit.test.js`

**Interfaces:**
- Consumes: `createPayPalOrder` da `../../_lib/paypal.js`.
- Produces: per metodo `paypal` → `200 { ok:true, metodo:'paypal', url }`; `502` su errore.

- [ ] **Step 1: Aggiornare il test paypal (RED)**

In `functions/api/iscrizione/submit.test.js`:
1. Aggiungere il mock della libreria PayPal (vicino a quello di stripe):
```js
vi.mock('../../_lib/paypal.js', () => ({
  createPayPalOrder: vi.fn().mockResolvedValue('https://www.paypal.com/checkoutnow?token=ORD1'),
}));
import { createPayPalOrder } from '../../_lib/paypal.js';
```
2. Aggiungere un test:
```js
  it('paypal: crea ordine e risponde 200 con url', async () => {
    const { request, env, kv } = makeCtx({ ...valido, metodoPagamento: 'paypal' });
    const res = await onRequestPost({ request, env });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.metodo).toBe('paypal');
    expect(json.url).toMatch(/paypal\.com/);
    expect(createPayPalOrder).toHaveBeenCalledOnce();
    expect(kv.store.size).toBe(1);
    expect(inviaEmailIscrizione).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/api/iscrizione/submit.test.js`
Expected: FAIL — paypal attualmente risponde 501.

- [ ] **Step 3: Modificare `functions/api/iscrizione/submit.js`**

1. Aggiungere l'import:
```js
import { createPayPalOrder } from '../../_lib/paypal.js';
```
2. Sostituire il fallback 501 (dopo il ramo stripe) con il ramo paypal + un 400 per metodi sconosciuti:
```js
  if (value.metodoPagamento === 'paypal') {
    try {
      const origin = new URL(request.url).origin;
      const url = await createPayPalOrder(env, { kvId: id, origin });
      return json({ ok: true, metodo: 'paypal', url });
    } catch (e) {
      return json({ ok: false, errors: ['Errore nell\'avvio del pagamento: ' + e.message] }, 502);
    }
  }

  return json({ ok: false, errors: ['Metodo di pagamento non gestito'] }, 400);
```

- [ ] **Step 4: Verificare il passaggio + suite**

Run: `npx vitest run functions/api/iscrizione/submit.test.js`
Expected: PASS.
Run: `npm test`
Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/iscrizione/submit.js functions/api/iscrizione/submit.test.js
git commit -m "feat: submit avvia ordine PayPal per metodo paypal"
```

---

### Task 3: Endpoint di cattura (`functions/api/paypal/capture.js`)

**Files:**
- Create: `functions/api/paypal/capture.js`
- Test: `functions/api/paypal/capture.test.js`

**Interfaces:**
- Consumes: `capturePayPalOrder` (`../../_lib/paypal.js`), `generaPdfIscrizione` (`../../_lib/pdf.js`), `inviaEmailIscrizione` (`../../_lib/email.js`).
- Produces: `onRequestGet({ request, env })` — PayPal reindirizza qui via GET con `?token=<orderId>`.
  - token mancante → redirect 302 a `/iscrizione?annullato=1`
  - cattura `COMPLETED` con KV presente → PDF (provider 'PayPal', stato 'pagato') + email + delete KV → 302 a `/iscrizione-completata?metodo=paypal`
  - KV assente (idempotenza) → 302 a `/iscrizione-completata?metodo=paypal` senza reinvio
  - cattura non `COMPLETED` o errore → 302 a `/iscrizione?annullato=1`

- [ ] **Step 1: Scrivere i test (falliscono)**

`functions/api/paypal/capture.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../_lib/paypal.js', () => ({ capturePayPalOrder: vi.fn() }));
vi.mock('../../_lib/pdf.js', () => ({ generaPdfIscrizione: vi.fn().mockResolvedValue(new Uint8Array([1])) }));
vi.mock('../../_lib/email.js', () => ({ inviaEmailIscrizione: vi.fn().mockResolvedValue(undefined) }));

import { onRequestGet } from './capture.js';
import { capturePayPalOrder } from '../../_lib/paypal.js';
import { generaPdfIscrizione } from '../../_lib/pdf.js';
import { inviaEmailIscrizione } from '../../_lib/email.js';

const value = { socio: { nome: 'Mario', cognome: 'Rossi', email: 'mario@example.it' }, tipologiaSocio: 'maggiorenne', metodoPagamento: 'paypal' };

function makeKv(entries = {}) {
  return { store: new Map(Object.entries(entries)),
    get(k) { return Promise.resolve(this.store.get(k) ?? null); },
    delete(k) { this.store.delete(k); return Promise.resolve(); } };
}
function reqWith(token) {
  const u = token ? `http://x/api/paypal/capture?token=${token}` : 'http://x/api/paypal/capture';
  return new Request(u);
}
const baseEnv = (kv) => ({ ISCRIZIONI_KV: kv, RESEND_API_KEY: 'k', ASSOCIATION_EMAIL: 'info@associazionestill.it', MAIL_FROM: 'S <n@associazionestill.it>' });

afterEach(() => vi.clearAllMocks());

describe('GET /api/paypal/capture', () => {
  it('token mancante → redirect annullato', async () => {
    const res = await onRequestGet({ request: reqWith(null), env: baseEnv(makeKv()) });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/iscrizione?annullato=1');
    expect(capturePayPalOrder).not.toHaveBeenCalled();
  });

  it('COMPLETED con KV → PDF+email, cancella KV, redirect completata', async () => {
    capturePayPalOrder.mockResolvedValue({ status: 'COMPLETED', customId: 'isc_1', captureId: 'CAP1' });
    const kv = makeKv({ isc_1: JSON.stringify(value) });
    const res = await onRequestGet({ request: reqWith('ORD1'), env: baseEnv(kv) });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/iscrizione-completata?metodo=paypal');
    expect(generaPdfIscrizione).toHaveBeenCalledOnce();
    expect(generaPdfIscrizione.mock.calls[0][1].provider).toBe('PayPal');
    expect(inviaEmailIscrizione).toHaveBeenCalledOnce();
    expect(kv.store.size).toBe(0);
  });

  it('KV assente → redirect completata, nessun invio (idempotente)', async () => {
    capturePayPalOrder.mockResolvedValue({ status: 'COMPLETED', customId: 'mancante', captureId: 'C' });
    const res = await onRequestGet({ request: reqWith('ORD1'), env: baseEnv(makeKv()) });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/iscrizione-completata?metodo=paypal');
    expect(inviaEmailIscrizione).not.toHaveBeenCalled();
  });

  it('cattura non COMPLETED → redirect annullato, nessun invio', async () => {
    capturePayPalOrder.mockResolvedValue({ status: 'DECLINED', customId: 'isc_1', captureId: '' });
    const kv = makeKv({ isc_1: JSON.stringify(value) });
    const res = await onRequestGet({ request: reqWith('ORD1'), env: baseEnv(kv) });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/iscrizione?annullato=1');
    expect(inviaEmailIscrizione).not.toHaveBeenCalled();
    expect(kv.store.size).toBe(1);
  });

  it('errore di cattura → redirect annullato', async () => {
    capturePayPalOrder.mockRejectedValue(new Error('boom'));
    const res = await onRequestGet({ request: reqWith('ORD1'), env: baseEnv(makeKv()) });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/iscrizione?annullato=1');
  });
});
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/api/paypal/capture.test.js`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare `functions/api/paypal/capture.js`**

```js
import { capturePayPalOrder } from '../../_lib/paypal.js';
import { generaPdfIscrizione } from '../../_lib/pdf.js';
import { inviaEmailIscrizione } from '../../_lib/email.js';

const redirect = (path) => new Response(null, { status: 302, headers: { Location: path } });

export async function onRequestGet({ request, env }) {
  const orderId = new URL(request.url).searchParams.get('token');
  if (!orderId) return redirect('/iscrizione?annullato=1');

  try {
    const { status, customId, captureId } = await capturePayPalOrder(env, orderId);
    if (status !== 'COMPLETED') return redirect('/iscrizione?annullato=1');

    const stored = customId ? await env.ISCRIZIONI_KV.get(customId) : null;
    if (!stored) return redirect('/iscrizione-completata?metodo=paypal'); // idempotenza

    const value = JSON.parse(stored);
    const pdf = await generaPdfIscrizione(value, { stato: 'pagato', provider: 'PayPal', riferimento: captureId });
    await inviaEmailIscrizione(value, pdf, env);
    await env.ISCRIZIONI_KV.delete(customId);
    return redirect('/iscrizione-completata?metodo=paypal');
  } catch {
    return redirect('/iscrizione?annullato=1');
  }
}
```

- [ ] **Step 4: Verificare il passaggio + suite**

Run: `npx vitest run functions/api/paypal/capture.test.js`
Expected: PASS (5 test).
Run: `npm test`
Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/paypal/capture.js functions/api/paypal/capture.test.js
git commit -m "feat: cattura PayPal (PDF+email su COMPLETED, idempotente)"
```

---

### Task 4: Frontend — abilita PayPal ed esito

**Files:**
- Modify: `iscrizione.html`
- Modify: `iscrizione-completata.html`

**Interfaces:**
- Consumes: risposta `submit` `{ ok:true, url }` (redirect già gestito dal Piano 2) e `?metodo=paypal` su `/iscrizione-completata`.

- [ ] **Step 1: Rimuovere la nota "Disponibile a breve" da PayPal**

In `iscrizione.html`, nella sezione "Metodo di pagamento", rimuovere la nota "Disponibile a breve" dall'opzione **PayPal** (ora funziona). Il redirect `if (json.url)` del Piano 2 gestisce già PayPal, quindi NON serve altro nel gestore submit.

- [ ] **Step 2: Messaggio esito per PayPal**

In `iscrizione-completata.html`, nel blocco JS che gestisce `?metodo`, aggiungere un ramo `else if (metodo === 'paypal')`:
```js
  } else if (metodo === 'paypal') {
    box.innerHTML = `<p>Pagamento con PayPal ricevuto. Grazie!</p>
      <p>Ti abbiamo inviato via email una copia del modulo compilato. La tua iscrizione sarà registrata a breve.</p>`;
```
(`metodo` è solo confrontato, non interpolato — nessun rischio XSS.)

- [ ] **Step 3: Verifica manuale (screenshot)**

Run (se non attivo): `node serve.mjs`
Run: `node screenshot.mjs "http://localhost:3000/iscrizione.html" iscrizione-paypal-attivo`
Leggere il PNG: confermare che l'opzione PayPal non riporta più "Disponibile a breve" (nessuna nota "disponibile a breve" resta su nessun metodo).
Run: `node screenshot.mjs "http://localhost:3000/iscrizione-completata.html?metodo=paypal" esito-paypal`
Leggere il PNG: confermare il messaggio PayPal.

- [ ] **Step 4: Commit**

```bash
git add iscrizione.html iscrizione-completata.html
git commit -m "feat: abilita PayPal nel form ed esito paypal"
```

---

## Self-Review (esito)

- **Copertura spec (PayPal, spec §7):** creazione ordine €30 (Task 1-2) ✓; approvazione via redirect (link approve/payer-action) ✓; cattura lato server con PDF+email solo su `COMPLETED` (Task 3) ✓; id KV via `custom_id` letto dalla cattura (nessun parametro fidato dal client) ✓; idempotenza KV (Task 3) ✓; importo server-side (Task 1) ✓; frontend abilitato + esito (Task 4) ✓.
- **Placeholder:** nessuno. Segreti `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET`/`PAYPAL_ENV` forniti in Cloudflare (documentati in `functions/README.md`).
- **Coerenza tipi:** `createPayPalOrder(env,{kvId,origin})→url` e `capturePayPalOrder(env,orderId)→{status,customId,captureId}` usati con firme identiche in `submit.js`, `capture.js` e nei test. `generaPdfIscrizione(value,{stato,provider,riferimento})` e `inviaEmailIscrizione(value,pdfBytes,env)` invariati.
- **Nota redirect:** il redirect `if (json.url)` nel frontend (Piano 2) copre già PayPal; nessuna modifica al gestore submit in Task 4.

## Fuori scope / rimandato
- **Webhook PayPal** (`PAYMENT.CAPTURE.COMPLETED`) come rete di sicurezza in caso di return_url non raggiunto: la cattura via return_url è il percorso primario e affidabile; il webhook resta un'aggiunta di hardening pre-lancio (richiede la verifica firma via `/v1/notifications/verify-webhook-signature`).

## Dipendenze esterne (prima del go-live)
- App PayPal (REST) con `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET`, `PAYPAL_ENV=sandbox` per la QA poi `live`, impostati come variabili Cloudflare Pages.
