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
