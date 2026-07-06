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
    // Stripe richiede la sintassi nidificata con parentesi quadre per line_items[0][price_data][...];
    // la chiave termina sempre con ']' subito prima di '=', quindi la sottostringa corretta include
    // la parentesi di chiusura (usare 'unit_amount=3000' senza ']' non può mai comparire).
    expect(opts.body).toContain('unit_amount]=3000');
    expect(opts.body).toContain('currency]=eur');
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
