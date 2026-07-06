import { TIPI_ISCRIZIONE, TIPI_SOCIO, CATEGORIE, QUALITA_GENITORE, METODI_PAGAMENTO } from './config.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAP_RE = /^\d{5}$/;
const CF_RE = /^[A-Z0-9]{11,16}$/i; // controllo di forma, non di validità fiscale

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validaPersona(p, prefix, errors) {
  const out = {
    nome: str(p?.nome), cognome: str(p?.cognome),
    luogoNascita: str(p?.luogoNascita), dataNascita: str(p?.dataNascita),
    codiceFiscale: str(p?.codiceFiscale).toUpperCase(),
    telefono: str(p?.telefono), email: str(p?.email),
  };
  if (!out.nome) errors.push(`${prefix}: nome obbligatorio`);
  if (!out.cognome) errors.push(`${prefix}: cognome obbligatorio`);
  if (!out.dataNascita) errors.push(`${prefix}: data di nascita obbligatoria`);
  if (!CF_RE.test(out.codiceFiscale)) errors.push(`${prefix}: codice fiscale non valido`);
  if (!EMAIL_RE.test(out.email)) errors.push(`${prefix}: email non valida`);
  return out;
}

export function validateIscrizione(data) {
  const errors = [];
  const d = data || {};

  const tipologiaIscrizione = str(d.tipologiaIscrizione);
  if (!TIPI_ISCRIZIONE.includes(tipologiaIscrizione)) errors.push('Tipologia iscrizione non valida');

  const tipologiaSocio = str(d.tipologiaSocio);
  if (!TIPI_SOCIO.includes(tipologiaSocio)) errors.push('Tipologia socio non valida');

  const socio = validaPersona(d.socio, 'Socio', errors);
  socio.indirizzo = str(d.socio?.indirizzo);
  socio.cap = str(d.socio?.cap);
  socio.comune = str(d.socio?.comune);
  socio.provincia = str(d.socio?.provincia).toUpperCase();
  if (!CAP_RE.test(socio.cap)) errors.push('Socio: CAP non valido');
  if (!socio.comune) errors.push('Socio: comune obbligatorio');

  const categorie = Array.isArray(d.categorie) ? d.categorie.map(str).filter(Boolean) : [];
  if (categorie.length === 0) errors.push('Selezionare almeno una categoria di appartenenza');
  for (const c of categorie) {
    if (!CATEGORIE.includes(c)) errors.push(`Categoria non ammessa: ${c}`);
  }
  const categoriaAltro = str(d.categoriaAltro);
  if (categorie.includes('Altro') && !categoriaAltro) errors.push('Specificare la categoria "Altro"');

  let genitore = null;
  if (tipologiaSocio === 'minorenne') {
    if (!d.genitore) {
      errors.push('Per un socio minorenne è obbligatoria la sezione genitore/tutore');
    } else {
      genitore = validaPersona(d.genitore, 'Genitore/Tutore', errors);
      genitore.qualita = str(d.genitore?.qualita);
      if (!QUALITA_GENITORE.includes(genitore.qualita)) errors.push('Genitore/Tutore: qualità non valida');
    }
  }

  const metodoPagamento = str(d.metodoPagamento);
  if (!METODI_PAGAMENTO.includes(metodoPagamento)) errors.push('Metodo di pagamento non valido');

  if (d.consensoPrivacy !== true) errors.push('Il consenso privacy è obbligatorio');

  const value = {
    tipologiaIscrizione, tipologiaSocio, socio, categorie, categoriaAltro, genitore,
    metodoPagamento,
    consensoComunicazioni: d.consensoComunicazioni === true,
    consensoPrivacy: true,
    luogo: str(d.luogo),
    dataFirma: str(d.dataFirma),
  };

  return { ok: errors.length === 0, errors, value: errors.length === 0 ? value : undefined };
}
