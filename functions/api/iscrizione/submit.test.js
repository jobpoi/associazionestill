import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequestPost } from './submit.js';

vi.mock('../../_lib/email.js', () => ({ inviaEmailIscrizione: vi.fn().mockResolvedValue(undefined) }));
import { inviaEmailIscrizione } from '../../_lib/email.js';

function makeCtx(body) {
  const kv = { store: new Map(),
    put(k, v, o) { this.store.set(k, v); return Promise.resolve(); },
    get(k) { return Promise.resolve(this.store.get(k) ?? null); },
    delete(k) { this.store.delete(k); return Promise.resolve(); } };
  const request = new Request('http://x/api/iscrizione/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const env = { ISCRIZIONI_KV: kv, RESEND_API_KEY: 'k', ASSOCIATION_EMAIL: 'info@associazionestill.it', MAIL_FROM: 'S <n@associazionestill.it>' };
  return { request, env, kv };
}

const valido = {
  tipologiaIscrizione: 'primo', tipologiaSocio: 'maggiorenne',
  socio: { nome: 'Mario', cognome: 'Rossi', luogoNascita: 'Roma', dataNascita: '1980-05-10',
    codiceFiscale: 'RSSMRA80E10H501U', indirizzo: 'Via Roma 1', cap: '00100', comune: 'Roma',
    provincia: 'RM', telefono: '3331234567', email: 'mario@example.it' },
  categorie: ['Paziente adulto'], categoriaAltro: '', genitore: null,
  metodoPagamento: 'bonifico', consensoComunicazioni: true, consensoPrivacy: true,
  luogo: 'Roma', dataFirma: '2026-07-04',
};

describe('POST /api/iscrizione/submit', () => {
  afterEach(() => vi.clearAllMocks());

  it('bonifico: genera PDF, invia email, risponde 200 con IBAN', async () => {
    const { request, env, kv } = makeCtx(valido);
    const res = await onRequestPost({ request, env });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.metodo).toBe('bonifico');
    expect(json.iban).toMatch(/IT82/);
    expect(inviaEmailIscrizione).toHaveBeenCalledOnce();
    expect(kv.store.size).toBe(0); // KV ripulito dopo invio
  });

  it('validazione fallita: 400 con errori', async () => {
    const { request, env } = makeCtx({ ...valido, consensoPrivacy: false });
    const res = await onRequestPost({ request, env });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.errors.length).toBeGreaterThan(0);
    expect(inviaEmailIscrizione).not.toHaveBeenCalled();
  });

  it('stripe: 501 finché non implementato', async () => {
    const { request, env } = makeCtx({ ...valido, metodoPagamento: 'stripe' });
    const res = await onRequestPost({ request, env });
    expect(res.status).toBe(501);
  });
});
