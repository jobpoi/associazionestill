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
