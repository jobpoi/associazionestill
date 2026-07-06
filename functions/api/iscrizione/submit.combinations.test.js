import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequestPost } from './submit.js';

vi.mock('../../_lib/email.js', () => ({ inviaEmailIscrizione: vi.fn().mockResolvedValue(undefined) }));
import { inviaEmailIscrizione } from '../../_lib/email.js';

vi.mock('../../_lib/stripe.js', () => ({
  createCheckoutSession: vi.fn().mockResolvedValue('https://checkout.stripe.com/c/pay/xyz'),
}));
vi.mock('../../_lib/paypal.js', () => ({
  createPayPalOrder: vi.fn().mockResolvedValue('https://www.paypal.com/checkoutnow?token=ORD1'),
}));

function makeEnv() {
  const kv = {
    store: new Map(),
    put(k, v) { this.store.set(k, v); return Promise.resolve(); },
    get(k) { return Promise.resolve(this.store.get(k) ?? null); },
    delete(k) { this.store.delete(k); return Promise.resolve(); },
  };
  return {
    ISCRIZIONI_KV: kv,
    RESEND_API_KEY: 'k', ASSOCIATION_EMAIL: 'info@associazionestill.it',
    MAIL_FROM: 'Associazione <noreply@associazionestill.it>',
    STRIPE_SECRET_KEY: 'sk_test',
  };
}
function reqOf(body) {
  return new Request('http://x/api/iscrizione/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
// Ogni chiamata deve restituire una Response JSON, mai lanciare.
async function run(body) {
  const env = makeEnv();
  let res;
  try { res = await onRequestPost({ request: reqOf(body), env }); }
  catch (e) { return { threw: true, error: e, env }; }
  expect(res).toBeInstanceOf(Response);
  expect(res.headers.get('Content-Type')).toContain('application/json');
  const json = await res.json();
  return { threw: false, status: res.status, json, env };
}

const socioBase = {
  nome: 'Mario', cognome: 'Rossi', luogoNascita: 'Roma', dataNascita: '1980-05-10',
  codiceFiscale: 'RSSMRA80E10H501U', indirizzo: 'Via Roma 1', cap: '00100', comune: 'Roma',
  provincia: 'RM', telefono: '3331234567', email: 'mario@example.it',
};
const base = {
  tipologiaIscrizione: 'primo', tipologiaSocio: 'maggiorenne',
  socio: { ...socioBase }, categorie: ['Paziente adulto'], categoriaAltro: '', genitore: null,
  metodoPagamento: 'bonifico', consensoComunicazioni: false, consensoPrivacy: true,
  luogo: 'Roma', dataFirma: '2026-07-06',
};
const genitoreValido = {
  nome: 'Anna', cognome: 'Bianchi', luogoNascita: 'Milano', dataNascita: '1975-03-02',
  codiceFiscale: 'BNCNNA75C42F205X', telefono: '3401112222', email: 'anna@example.it', qualita: 'Madre',
};

const CATEGORIE = [
  'Paziente adulto', 'Paziente pediatrico (sJIA)', 'Caregiver/Familiare',
  'Medico o Professionista sanitario', 'Ricercatore/Studente', 'Sostenitore',
];
const EMAIL_VALIDE = [
  'mario@example.it', 'm.rossi@sub.dominio.co.uk', 'mario+socio@gmail.com',
  'MARIO@EXAMPLE.IT', 'a@b.co', 'nome.cognome-01@azienda-spa.it',
];
const EMAIL_INVALIDE = ['', 'plain', 'no@domain', '@nodomain.it', 'ha spazio@x.it', 'mario@', 'mario@.it'];
const TELEFONI = ['3331234567', '+39 333 1234567', '333-123-4567', '(06) 1234567', '06 1234 5678', '333 12 34 567'];
const CAP_INVALIDI = ['', '123', 'abcde', '001000', '12 45'];
const CF_INVALIDI = ['', 'SHORT', 'CON SPAZIO12', 'TROPPOLUNGOCODICE99'];

describe('submit — combinazioni VALIDE (devono passare)', () => {
  afterEach(() => vi.clearAllMocks());

  for (const tipo of ['primo', 'rinnovo']) {
    for (const metodo of ['bonifico', 'stripe', 'paypal']) {
      it(`iscrizione=${tipo} pagamento=${metodo} → successo`, async () => {
        const r = await run({ ...base, tipologiaIscrizione: tipo, metodoPagamento: metodo });
        expect(r.threw).toBe(false);
        expect(r.status).toBe(200);
        expect(r.json.ok).toBe(true);
        if (metodo === 'bonifico') { expect(r.json.iban).toMatch(/IT/); expect(inviaEmailIscrizione).toHaveBeenCalledOnce(); }
        else { expect(r.json.url).toBeTruthy(); expect(inviaEmailIscrizione).not.toHaveBeenCalled(); }
      });
    }
  }

  CATEGORIE.forEach((cat) => {
    it(`categoria singola "${cat}" → successo`, async () => {
      const r = await run({ ...base, categorie: [cat] });
      expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
    });
  });

  it('tutte le categorie insieme → successo', async () => {
    const r = await run({ ...base, categorie: [...CATEGORIE] });
    expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
  });

  it('categoria "Altro" con testo → successo', async () => {
    const r = await run({ ...base, categorie: ['Altro'], categoriaAltro: 'Associazione partner' });
    expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
  });

  EMAIL_VALIDE.forEach((email) => {
    it(`email valida "${email}" → successo`, async () => {
      const r = await run({ ...base, socio: { ...socioBase, email } });
      expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
    });
  });

  TELEFONI.forEach((tel) => {
    it(`telefono "${tel}" → accettato`, async () => {
      const r = await run({ ...base, socio: { ...socioBase, telefono: tel } });
      expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
    });
  });

  it('minorenne con genitore completo → successo', async () => {
    const r = await run({ ...base, tipologiaSocio: 'minorenne', genitore: { ...genitoreValido } });
    expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
  });

  ['Padre', 'Madre', 'Tutore legale', 'Altro'].forEach((q) => {
    it(`minorenne qualità genitore "${q}" → successo`, async () => {
      const r = await run({ ...base, tipologiaSocio: 'minorenne', genitore: { ...genitoreValido, qualita: q } });
      expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
    });
  });

  it('consensoComunicazioni true → successo', async () => {
    const r = await run({ ...base, consensoComunicazioni: true });
    expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
  });
});

describe('submit — combinazioni INVALIDE (devono dare 400, mai crash)', () => {
  afterEach(() => vi.clearAllMocks());

  EMAIL_INVALIDE.forEach((email) => {
    it(`email invalida "${email}" → 400`, async () => {
      const r = await run({ ...base, socio: { ...socioBase, email } });
      expect(r.threw).toBe(false);
      expect(r.status).toBe(400);
      expect(r.json.ok).toBe(false);
      expect(inviaEmailIscrizione).not.toHaveBeenCalled();
    });
  });

  CAP_INVALIDI.forEach((cap) => {
    it(`CAP invalido "${cap}" → 400`, async () => {
      const r = await run({ ...base, socio: { ...socioBase, cap } });
      expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
    });
  });

  CF_INVALIDI.forEach((cf) => {
    it(`CF invalido "${cf}" → 400`, async () => {
      const r = await run({ ...base, socio: { ...socioBase, codiceFiscale: cf } });
      expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
    });
  });

  ['', 'carta', 'bitcoin', 'STRIPE'].forEach((m) => {
    it(`metodo pagamento invalido "${m}" → 400`, async () => {
      const r = await run({ ...base, metodoPagamento: m });
      expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
    });
  });

  it('categorie vuote → 400', async () => {
    const r = await run({ ...base, categorie: [] });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
  it('categoria non ammessa → 400', async () => {
    const r = await run({ ...base, categorie: ['Hacker'] });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
  it('"Altro" senza testo → 400', async () => {
    const r = await run({ ...base, categorie: ['Altro'], categoriaAltro: '' });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
  it('minorenne senza genitore → 400', async () => {
    const r = await run({ ...base, tipologiaSocio: 'minorenne', genitore: null });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
  it('minorenne con qualità genitore invalida → 400', async () => {
    const r = await run({ ...base, tipologiaSocio: 'minorenne', genitore: { ...genitoreValido, qualita: 'Zio' } });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
  it('consenso privacy mancante → 400', async () => {
    const r = await run({ ...base, consensoPrivacy: false });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
  it('tipologia iscrizione invalida → 400', async () => {
    const r = await run({ ...base, tipologiaIscrizione: 'boh' });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
  it('tipologia socio invalida → 400', async () => {
    const r = await run({ ...base, tipologiaSocio: 'boh' });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
  it('comune mancante → 400', async () => {
    const r = await run({ ...base, socio: { ...socioBase, comune: '' } });
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
});
