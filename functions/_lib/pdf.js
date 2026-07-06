import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { EMBLEM_PNG_BASE64 } from './emblem-base64.js';
import { annoTessera, IBAN, CATEGORIE } from './config.js';

const RED = rgb(0.753, 0.224, 0.169); // #C0392B
const DARK = rgb(0.24, 0.24, 0.24);
const A4 = [595.28, 841.89];

function b64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function chk(v) { return v ? '[X] ' : '[ ] '; }

// Converte una data ISO "AAAA-MM-GG" nel formato italiano "GG/MM/AAAA".
// Lascia invariato ciò che non è nel formato atteso (o stringa vuota).
export function formatData(iso) {
  if (typeof iso !== 'string' || iso === '') return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export async function generaPdfIscrizione(value, pagamento) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const emblem = await doc.embedPng(b64ToBytes(EMBLEM_PNG_BASE64));

  let page = doc.addPage(A4);
  const M = 50;
  let y = A4[1] - M;

  const line = (text, { size = 10, f = font, color = DARK, dx = 0 } = {}) => {
    page.drawText(String(text ?? ''), { x: M + dx, y, size, font: f, color });
    y -= size + 6;
  };
  const gap = (n = 6) => { y -= n; };
  const ensure = (need = 60) => {
    if (y < M + need) { page = doc.addPage(A4); y = A4[1] - M; }
  };

  // Header
  page.drawImage(emblem, { x: M, y: y - 40, width: 50, height: 50 });
  page.drawText('ASSOCIAZIONE ITALIANA MALATTIA DI STILL ODV', { x: M + 62, y: y - 12, size: 12, font: bold, color: DARK });
  page.drawText('info@associazionestill.it  -  www.associazionestill.it', { x: M + 62, y: y - 28, size: 9, font, color: DARK });
  y -= 60;
  page.drawText(`MODULO ISCRIZIONE ANNO ${annoTessera()}`, { x: M, y, size: 15, font: bold, color: DARK });
  y -= 28;

  // Tipologie
  line('TIPOLOGIA DI ISCRIZIONE', { f: bold });
  line(`${chk(value.tipologiaIscrizione === 'primo')}Primo tesseramento    ${chk(value.tipologiaIscrizione === 'rinnovo')}Rinnovo`);
  gap();
  line('TIPOLOGIA DI SOCIO', { f: bold });
  line(`${chk(value.tipologiaSocio === 'maggiorenne')}Socio maggiorenne    ${chk(value.tipologiaSocio === 'minorenne')}Socio minorenne`);
  gap();

  // 1) Dati socio
  line('1) DATI DEL SOCIO', { f: bold });
  const s = value.socio;
  line(`Nome: ${s.nome}    Cognome: ${s.cognome}`);
  line(`Luogo di nascita: ${s.luogoNascita}    Data di nascita: ${formatData(s.dataNascita)}`);
  line(`Codice fiscale: ${s.codiceFiscale}`);
  line(`Indirizzo: ${s.indirizzo}  CAP: ${s.cap}  Comune: ${s.comune}  Prov: ${s.provincia}`);
  line(`Telefono: ${s.telefono}    E-mail: ${s.email}`);
  gap();

  // 2) Categoria
  ensure(120);
  line('2) CATEGORIA DI APPARTENENZA', { f: bold });
  for (const c of CATEGORIE) {
    if (c === 'Altro') {
      const sel = value.categorie.includes('Altro');
      line(`${chk(sel)}Altro: ${sel ? value.categoriaAltro : ''}`);
    } else {
      line(`${chk(value.categorie.includes(c))}${c}`);
    }
  }
  gap();

  // 3) Genitore/Tutore (solo minorenni)
  if (value.tipologiaSocio === 'minorenne' && value.genitore) {
    ensure(110);
    const g = value.genitore;
    line('3) DATI DEL GENITORE / TUTORE LEGALE', { f: bold });
    line(`Nome: ${g.nome}    Cognome: ${g.cognome}`);
    line(`Luogo di nascita: ${g.luogoNascita}    Data di nascita: ${formatData(g.dataNascita)}`);
    line(`Codice fiscale: ${g.codiceFiscale}`);
    line(`Telefono: ${g.telefono}    E-mail: ${g.email}`);
    line(`In qualità di: ${g.qualita}`);
    gap();
  }

  // 4) Quota + pagamento
  ensure(90);
  line('4) QUOTA ASSOCIATIVA', { f: bold });
  line('La quota associativa annuale è pari a € 30,00, comprensiva della copertura assicurativa obbligatoria.');
  if (pagamento.provider === 'bonifico') {
    line(`Pagamento: bonifico bancario (IBAN ${IBAN}) - ${pagamento.stato}`, { f: bold });
  } else {
    line(`Pagamento: effettuato online via ${pagamento.provider} - € 30,00${pagamento.riferimento ? ' - rif. ' + pagamento.riferimento : ''}`, { f: bold });
  }
  gap();

  // 5) Comunicazioni
  ensure(120);
  line('5) COMUNICAZIONI DELL\'ASSOCIAZIONE', { f: bold });
  line(`${chk(value.consensoComunicazioni)}Acconsento a ricevere comunicazioni via e-mail e/o WhatsApp.`);
  gap();

  // 6) Privacy
  line('6) PRIVACY', { f: bold });
  line(`${chk(value.consensoPrivacy)}Acconsento al trattamento dei dati personali (Reg. UE 2016/679).`);
  gap();

  // 7) Genitore/tutore dichiarazione (minorenni)
  if (value.tipologiaSocio === 'minorenne') {
    line('7) DICHIARAZIONE DEL GENITORE/TUTORE', { f: bold });
    line('Il/La sottoscritto/a, esercente la responsabilità genitoriale o tutore legale, chiede l\'iscrizione del minore sopra indicato.');
    gap();
  }

  // Firma elettronica
  const firmatario = value.tipologiaSocio === 'minorenne' && value.genitore
    ? `${value.genitore.nome} ${value.genitore.cognome}`
    : `${value.socio.nome} ${value.socio.cognome}`;
  line(`Luogo: ${value.luogo}    Data: ${formatData(value.dataFirma)}`);
  line(`Firma: ${firmatario} (consenso elettronico prestato online il ${formatData(value.dataFirma)})`, { f: bold });

  return await doc.save();
}
