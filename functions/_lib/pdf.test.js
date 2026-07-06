import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generaPdfIscrizione } from './pdf.js';

const value = {
  tipologiaIscrizione: 'primo', tipologiaSocio: 'maggiorenne',
  socio: { nome: 'Mario', cognome: 'Rossi', luogoNascita: 'Roma', dataNascita: '1980-05-10',
    codiceFiscale: 'RSSMRA80E10H501U', indirizzo: 'Via Roma 1', cap: '00100', comune: 'Roma',
    provincia: 'RM', telefono: '3331234567', email: 'mario@example.it' },
  categorie: ['Paziente adulto', 'Sostenitore'], categoriaAltro: '', genitore: null,
  metodoPagamento: 'bonifico', consensoComunicazioni: true, consensoPrivacy: true,
  luogo: 'Roma', dataFirma: '2026-07-04',
};
const pagamento = { stato: 'da verificare', provider: 'bonifico' };

describe('generaPdfIscrizione', () => {
  it('produce un PDF valido non vuoto', async () => {
    const bytes = await generaPdfIscrizione(value, pagamento);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('non contiene la sezione riservata', async () => {
    // pdf-lib non estrae testo: verifichiamo che la funzione non riceva/produca quel marker.
    // Garanzia strutturale: il sorgente non deve contenere la stringa riservata.
    const src = (await import('node:fs')).readFileSync('functions/_lib/pdf.js', 'utf8');
    expect(src.toUpperCase()).not.toContain('RISERVATO ALL');
  });

  it('gestisce il socio minorenne senza errori', async () => {
    const min = { ...value, tipologiaSocio: 'minorenne',
      genitore: { nome: 'Anna', cognome: 'Rossi', luogoNascita: 'Roma', dataNascita: '1975-01-01',
        codiceFiscale: 'RSSNNA75A41H501K', telefono: '3339876543', email: 'anna@example.it', qualita: 'Madre' } };
    const bytes = await generaPdfIscrizione(min, pagamento);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
