import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequestPost } from './submit.js';

vi.mock('../../_lib/email.js', () => ({ inviaEmailIscrizione: vi.fn().mockResolvedValue(undefined) }));
import { inviaEmailIscrizione } from '../../_lib/email.js';

vi.mock('../../_lib/stripe.js', () => ({
  createCheckoutSession: vi.fn().mockResolvedValue('https://checkout.stripe.com/c/pay/xyz'),
}));
import { createCheckoutSession } from '../../_lib/stripe.js';

vi.mock('../../_lib/paypal.js', () => ({
  createPayPalOrder: vi.fn().mockResolvedValue('https://www.paypal.com/checkoutnow?token=ORD1'),
}));

function kvMock() {
  return {
    store: new Map(),
    put(k, v) { this.store.set(k, v); return Promise.resolve(); },
    get(k) { return Promise.resolve(this.store.get(k) ?? null); },
    delete(k) { this.store.delete(k); return Promise.resolve(); },
  };
}

function fullEnv(overrides = {}) {
  return {
    ISCRIZIONI_KV: kvMock(),
    RESEND_API_KEY: 'k',
    ASSOCIATION_EMAIL: 'info@associazionestill.it',
    MAIL_FROM: 'S <n@associazionestill.it>',
    STRIPE_SECRET_KEY: 'sk_test_x',
    ...overrides,
  };
}

function req(body, { raw } = {}) {
  return new Request('http://x/api/iscrizione/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
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

// Un handler robusto NON deve MAI lanciare: qualunque input/ambiente deve
// produrre una Response JSON (altrimenti Cloudflare risponde HTML e il client
// mostra il fuorviante "Errore di rete").
async function callSafe(body, env) {
  let res;
  try {
    res = await onRequestPost({ request: req(body), env });
  } catch (e) {
    return { threw: true, error: e };
  }
  return { threw: false, res };
}

describe('submit — robustezza (nessun throw non gestito)', () => {
  afterEach(() => vi.clearAllMocks());

  it('BUG1: binding KV assente → risponde JSON 5xx, NON lancia', async () => {
    const env = fullEnv({ ISCRIZIONI_KV: undefined });
    const out = await callSafe(valido, env);
    expect(out.threw).toBe(false); // oggi lancia → "Errore di rete" lato client
    expect(out.res.headers.get('Content-Type')).toContain('application/json');
    expect(out.res.status).toBeGreaterThanOrEqual(500);
    const json = await out.res.json();
    expect(json.ok).toBe(false);
    expect(Array.isArray(json.errors)).toBe(true);
  });

  it('KV.put che rigetta → risponde JSON 5xx, NON lancia', async () => {
    const env = fullEnv();
    env.ISCRIZIONI_KV.put = () => Promise.reject(new Error('KV down'));
    const out = await callSafe(valido, env);
    expect(out.threw).toBe(false);
    expect(out.res.status).toBeGreaterThanOrEqual(500);
    const json = await out.res.json();
    expect(json.ok).toBe(false);
  });

  it('body JSON malformato → 400 JSON', async () => {
    const env = fullEnv();
    const res = await onRequestPost({ request: req(null, { raw: '{ non-json' }), env });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('body vuoto → 400 JSON con errori di validazione', async () => {
    const env = fullEnv();
    const res = await onRequestPost({ request: req({}), env });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  const casiInvalidi = [
    ['campi mancanti', {}],
    ['socio null', { ...valido, socio: null }],
    ['categorie non array', { ...valido, categorie: 'Paziente adulto' }],
    ['categoria non ammessa', { ...valido, categorie: ['Hacker'] }],
    ['email non valida', { ...valido, socio: { ...valido.socio, email: 'non-email' } }],
    ['CAP non valido', { ...valido, socio: { ...valido.socio, cap: '1' } }],
    ['CF non valido', { ...valido, socio: { ...valido.socio, codiceFiscale: '???' } }],
    ['metodo pagamento ignoto', { ...valido, metodoPagamento: 'bitcoin' }],
    ['minorenne senza genitore', { ...valido, tipologiaSocio: 'minorenne', genitore: null }],
    ['consenso privacy mancante', { ...valido, consensoPrivacy: false }],
    ['tipologiaIscrizione ignota', { ...valido, tipologiaIscrizione: 'boh' }],
    ['nome enorme (100k char)', { ...valido, socio: { ...valido.socio, nome: 'A'.repeat(100000) } }],
    ['unicode/emoji', { ...valido, socio: { ...valido.socio, nome: '日本語 😀 <script>' } }],
    ['iniezione prototype', { ...valido, __proto__: { polluted: true } }],
  ];

  for (const [nome, body] of casiInvalidi) {
    it(`stress: "${nome}" → Response JSON, mai throw`, async () => {
      const out = await callSafe(body, fullEnv());
      expect(out.threw).toBe(false);
      expect(out.res).toBeInstanceOf(Response);
      expect(out.res.headers.get('Content-Type')).toContain('application/json');
      const json = await out.res.json();
      expect(typeof json.ok).toBe('boolean');
    });
  }

  it('emoji/unicode valido nei campi testuali → accettato (bonifico ok)', async () => {
    const body = { ...valido, socio: { ...valido.socio, nome: 'José', cognome: "D'Amoré" }, luogo: 'Città' };
    const res = await onRequestPost({ request: req(body), env: fullEnv() });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(inviaEmailIscrizione).toHaveBeenCalledOnce();
  });

  it('invio email fallito (Resend down) → 500 JSON leggibile, NON "Errore di rete"', async () => {
    inviaEmailIscrizione.mockRejectedValueOnce(new Error('Resend 401'));
    const res = await onRequestPost({ request: req(valido), env: fullEnv() });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(JSON.stringify(json.errors)).toContain('Resend');
  });
});
