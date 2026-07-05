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
