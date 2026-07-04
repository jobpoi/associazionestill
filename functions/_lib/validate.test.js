import { describe, it, expect } from 'vitest';
import { validateIscrizione } from './validate.js';

const base = {
  tipologiaIscrizione: 'primo',
  tipologiaSocio: 'maggiorenne',
  socio: {
    nome: 'Mario', cognome: 'Rossi', luogoNascita: 'Roma',
    dataNascita: '1980-05-10', codiceFiscale: 'RSSMRA80E10H501U',
    indirizzo: 'Via Roma 1', cap: '00100', comune: 'Roma', provincia: 'RM',
    telefono: '3331234567', email: 'mario@example.it',
  },
  categorie: ['Paziente adulto'],
  categoriaAltro: '',
  genitore: null,
  metodoPagamento: 'bonifico',
  consensoComunicazioni: true,
  consensoPrivacy: true,
  luogo: 'Roma',
  dataFirma: '2026-07-04',
};

describe('validateIscrizione', () => {
  it('accetta un socio maggiorenne valido', () => {
    const r = validateIscrizione(base);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.value.socio.nome).toBe('Mario');
  });

  it('rifiuta senza consenso privacy', () => {
    const r = validateIscrizione({ ...base, consensoPrivacy: false });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/privacy/i);
  });

  it('rifiuta email socio non valida', () => {
    const r = validateIscrizione({ ...base, socio: { ...base.socio, email: 'non-una-email' } });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/email/i);
  });

  it('rifiuta metodo di pagamento sconosciuto', () => {
    const r = validateIscrizione({ ...base, metodoPagamento: 'contanti' });
    expect(r.ok).toBe(false);
  });

  it('per minorenne richiede la sezione genitore', () => {
    const r = validateIscrizione({ ...base, tipologiaSocio: 'minorenne', genitore: null });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/genitore|tutore/i);
  });

  it('accetta minorenne con genitore completo', () => {
    const r = validateIscrizione({
      ...base,
      tipologiaSocio: 'minorenne',
      genitore: {
        nome: 'Anna', cognome: 'Rossi', luogoNascita: 'Roma',
        dataNascita: '1975-01-01', codiceFiscale: 'RSSNNA75A41H501K',
        telefono: '3339876543', email: 'anna@example.it', qualita: 'Madre',
      },
    });
    expect(r.ok).toBe(true);
  });

  it('rifiuta categoria non ammessa', () => {
    const r = validateIscrizione({ ...base, categorie: ['Inventata'] });
    expect(r.ok).toBe(false);
  });
});
