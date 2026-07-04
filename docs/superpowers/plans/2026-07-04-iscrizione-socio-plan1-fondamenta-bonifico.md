# Iscrizione Socio Online — Piano 1: Fondamenta + Ramo Bonifico

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere funzionante end-to-end l'iscrizione socio via **bonifico**: pagina `/iscrizione`, validazione server, generazione PDF del modulo compilato e invio email a `info@associazionestill.it` + copia al socio.

**Architecture:** Sito statico su Cloudflare Pages + Cloudflare Pages Functions (backend serverless in `functions/`) + KV per dati transitori. In questo piano il ramo online (Stripe/PayPal) risponde "non ancora disponibile"; verrà completato nei Piani 2 e 3.

**Tech Stack:** HTML/CSS/JS inline (stile del sito), Cloudflare Pages Functions (ES modules), `pdf-lib` (PDF), Resend (email), `vitest` (test), `wrangler` (dev locale delle Functions).

## Global Constraints

- Importo quota: **€30,00 = 3000 cent**, definito **solo lato server** (`functions/_lib/config.js`), mai dal client.
- Anno tessera: **2026** (costante configurabile, default anno corrente).
- La sezione **"RISERVATO ALL'ASSOCIAZIONE" NON deve mai comparire** nel form né nel PDF.
- **Nessuno storage permanente**: i dati stanno in KV con TTL breve e vengono **cancellati dopo l'invio email**.
- **Consenso privacy obbligatorio** (`consensoPrivacy === true`) per accettare la submission.
- PDF inviato a **`info@associazionestill.it` + email del socio**.
- Colore brand: rosso **`#C0392B`**; font e stile coerenti con `index.html`.
- IBAN bonifico: **`IT82 C062 3005 0720 0003 6140 126`**.
- Categoria di appartenenza: **selezione multipla**. Firma: **checkbox dichiarazione + nome digitato + data**.

---

### Task 1: Tooling, dipendenze e config Cloudflare

**Files:**
- Modify: `package.json` (aggiunge dipendenze e script)
- Create: `wrangler.toml`
- Create: `vitest.config.js`
- Create: `functions/README.md` (istruzioni dev/deploy per l'Associazione)

**Interfaces:**
- Produces: script `npm test` (vitest), binding KV `ISCRIZIONI_KV`, comando dev `npm run dev:functions`.

- [ ] **Step 1: Aggiungere dipendenze**

Run:
```bash
npm install pdf-lib
npm install -D vitest wrangler
```

- [ ] **Step 2: Aggiungere gli script a `package.json`**

In `package.json`, dentro `"scripts"`, sostituire il blocco con:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "dev:functions": "wrangler pages dev . --kv ISCRIZIONI_KV --port 8788"
}
```

- [ ] **Step 3: Creare `wrangler.toml`**

```toml
name = "associazionestill"
pages_build_output_dir = "."
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "ISCRIZIONI_KV"
id = "PLACEHOLDER_DA_CREARE_IN_CLOUDFLARE"
```

Nota: `id` va sostituito con l'id reale del namespace KV creato nel pannello Cloudflare (istruzioni in `functions/README.md`). In dev locale `--kv` crea un namespace simulato.

- [ ] **Step 4: Creare `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['functions/**/*.test.js'],
  },
});
```

- [ ] **Step 5: Creare `functions/README.md`**

````markdown
# Backend iscrizione — setup

## Segreti/variabili (Cloudflare Pages → Settings → Environment variables)
- `RESEND_API_KEY` — chiave API Resend
- `ASSOCIATION_EMAIL` — info@associazionestill.it
- `MAIL_FROM` — es. "Associazione Still <noreply@associazionestill.it>" (dominio verificato in Resend)
- (Piano 2) `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- (Piano 3) `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV`

## KV
Creare un namespace KV chiamato `ISCRIZIONI_KV` e incollarne l'id in `wrangler.toml`
e nel binding di Cloudflare Pages (Settings → Functions → KV namespace bindings).

## Dev locale
`npm run dev:functions` → sito + Functions su http://localhost:8788
````

- [ ] **Step 6: Verificare che vitest parta (nessun test ancora)**

Run: `npm test`
Expected: vitest gira e riporta "No test files found" (exit 0) oppure 0 test — nessun errore di config.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json wrangler.toml vitest.config.js functions/README.md
git commit -m "chore: tooling per Functions iscrizione (vitest, wrangler, pdf-lib)"
```

---

### Task 2: Config condivisa

**Files:**
- Create: `functions/_lib/config.js`
- Test: `functions/_lib/config.test.js`

**Interfaces:**
- Produces:
  - `QUOTA_CENT = 3000`
  - `annoTessera(): number` (default anno corrente)
  - `IBAN = 'IT82 C062 3005 0720 0003 6140 126'`
  - `CATEGORIE` (array di stringhe ammesse)
  - `QUALITA_GENITORE` (array), `TIPI_ISCRIZIONE` (array), `TIPI_SOCIO` (array)

- [ ] **Step 1: Scrivere il test (fallisce)**

`functions/_lib/config.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { QUOTA_CENT, IBAN, annoTessera, CATEGORIE } from './config.js';

describe('config', () => {
  it('quota è 3000 cent', () => {
    expect(QUOTA_CENT).toBe(3000);
  });
  it('IBAN corretto', () => {
    expect(IBAN).toBe('IT82 C062 3005 0720 0003 6140 126');
  });
  it('annoTessera è un numero a 4 cifre', () => {
    expect(String(annoTessera())).toMatch(/^\d{4}$/);
  });
  it('categorie includono le voci del modulo', () => {
    expect(CATEGORIE).toContain('Paziente adulto');
    expect(CATEGORIE).toContain('Paziente pediatrico (sJIA)');
    expect(CATEGORIE).toContain('Caregiver/Familiare');
  });
});
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/_lib/config.test.js`
Expected: FAIL — "Failed to resolve import './config.js'".

- [ ] **Step 3: Implementare `functions/_lib/config.js`**

```js
export const QUOTA_CENT = 3000;
export const IBAN = 'IT82 C062 3005 0720 0003 6140 126';

export function annoTessera() {
  // Costante di dominio: anno di tesseramento corrente.
  return new Date().getUTCFullYear();
}

export const TIPI_ISCRIZIONE = ['primo', 'rinnovo'];
export const TIPI_SOCIO = ['maggiorenne', 'minorenne'];

export const CATEGORIE = [
  'Paziente adulto',
  'Paziente pediatrico (sJIA)',
  'Caregiver/Familiare',
  'Medico o Professionista sanitario',
  'Ricercatore/Studente',
  'Sostenitore',
  'Altro',
];

export const QUALITA_GENITORE = ['Padre', 'Madre', 'Tutore legale', 'Altro'];

export const METODI_PAGAMENTO = ['stripe', 'paypal', 'bonifico'];
```

- [ ] **Step 4: Verificare il passaggio**

Run: `npx vitest run functions/_lib/config.test.js`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/config.js functions/_lib/config.test.js
git commit -m "feat: config condivisa iscrizione (quota, iban, categorie)"
```

---

### Task 3: Validazione server

**Files:**
- Create: `functions/_lib/validate.js`
- Test: `functions/_lib/validate.test.js`

**Interfaces:**
- Consumes: da `config.js`: `TIPI_ISCRIZIONE`, `TIPI_SOCIO`, `CATEGORIE`, `QUALITA_GENITORE`, `METODI_PAGAMENTO`.
- Produces: `validateIscrizione(data): { ok: boolean, errors: string[], value?: object }`
  - `value` è l'oggetto normalizzato descritto nel §6 della spec.

- [ ] **Step 1: Scrivere i test (falliscono)**

`functions/_lib/validate.test.js`:
```js
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
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/_lib/validate.test.js`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare `functions/_lib/validate.js`**

```js
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
```

- [ ] **Step 4: Verificare il passaggio**

Run: `npx vitest run functions/_lib/validate.test.js`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/validate.js functions/_lib/validate.test.js
git commit -m "feat: validazione server del modulo iscrizione"
```

---

### Task 4: Asset emblema per il PDF

**Files:**
- Create: `functions/_lib/emblem-base64.js` (asset generato dal logo)
- Create (temporaneo, non committato): `gen-emblem-b64.mjs`

**Interfaces:**
- Produces: `export const EMBLEM_PNG_BASE64` (stringa base64 dell'emblema del logo, senza prefisso data URI).

- [ ] **Step 1: Creare lo script locale di generazione**

`gen-emblem-b64.mjs` (usa `sharp`, già dipendenza):
```js
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// Ritaglia l'emblema (mandala) dal logo, come in make-emblem.mjs
const cropped = await sharp('Logo_Still.jpeg')
  .extract({ left: 280, top: 230, width: 470, height: 470 })
  .png().toBuffer();
const emblem = await sharp(cropped)
  .trim({ background: '#ffffff', threshold: 20 })
  .resize(300, 300, { fit: 'inside' })
  .png().toBuffer();

const b64 = emblem.toString('base64');
writeFileSync('functions/_lib/emblem-base64.js',
  `// Emblema del logo (PNG base64) per l'header del PDF. Generato da gen-emblem-b64.mjs.\nexport const EMBLEM_PNG_BASE64 = '${b64}';\n`);
console.log('Scritto functions/_lib/emblem-base64.js (', b64.length, 'char )');
```

- [ ] **Step 2: Eseguire lo script**

Run: `node gen-emblem-b64.mjs`
Expected: stampa "Scritto functions/_lib/emblem-base64.js" e crea il file.

- [ ] **Step 3: Verificare che l'asset sia importabile**

Run:
```bash
node --input-type=module -e "import('./functions/_lib/emblem-base64.js').then(m => console.log('len', m.EMBLEM_PNG_BASE64.length))"
```
Expected: stampa una lunghezza > 1000.

- [ ] **Step 4: Rimuovere lo script temporaneo e committare l'asset**

```bash
rm -f gen-emblem-b64.mjs
git add functions/_lib/emblem-base64.js
git commit -m "chore: asset emblema base64 per header PDF iscrizione"
```

Nota: `gen-emblem-b64.mjs` non va committato (è già coperto da `.gitignore`? se no, non aggiungerlo — è temporaneo).

---

### Task 5: Generazione PDF

**Files:**
- Create: `functions/_lib/pdf.js`
- Test: `functions/_lib/pdf.test.js`

**Interfaces:**
- Consumes: `pdf-lib`, `EMBLEM_PNG_BASE64` da `emblem-base64.js`, `annoTessera`/`IBAN` da `config.js`.
- Produces: `async generaPdfIscrizione(value, pagamento): Uint8Array`
  - `value` = output di `validateIscrizione`.
  - `pagamento` = `{ stato: string, provider: string, riferimento?: string }`.

- [ ] **Step 1: Scrivere i test (falliscono)**

`functions/_lib/pdf.test.js`:
```js
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
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/_lib/pdf.test.js`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare `functions/_lib/pdf.js`**

```js
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
  line(`Luogo di nascita: ${s.luogoNascita}    Data di nascita: ${s.dataNascita}`);
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
    line(`Luogo di nascita: ${g.luogoNascita}    Data di nascita: ${g.dataNascita}`);
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
  line(`Luogo: ${value.luogo}    Data: ${value.dataFirma}`);
  line(`Firma: ${firmatario} (consenso elettronico prestato online il ${value.dataFirma})`, { f: bold });

  return await doc.save();
}
```

- [ ] **Step 4: Verificare il passaggio**

Run: `npx vitest run functions/_lib/pdf.test.js`
Expected: PASS (3 test).

- [ ] **Step 5: Verifica manuale visiva del PDF**

Run:
```bash
node --input-type=module -e "import('./functions/_lib/pdf.js').then(async m => { const {writeFileSync}=await import('node:fs'); const b=await m.generaPdfIscrizione({tipologiaIscrizione:'primo',tipologiaSocio:'maggiorenne',socio:{nome:'Mario',cognome:'Rossi',luogoNascita:'Roma',dataNascita:'1980-05-10',codiceFiscale:'RSSMRA80E10H501U',indirizzo:'Via Roma 1',cap:'00100',comune:'Roma',provincia:'RM',telefono:'333',email:'m@e.it'},categorie:['Paziente adulto'],categoriaAltro:'',genitore:null,metodoPagamento:'bonifico',consensoComunicazioni:true,consensoPrivacy:true,luogo:'Roma',dataFirma:'2026-07-04'},{stato:'da verificare',provider:'bonifico'}); writeFileSync('scratch-modulo.pdf', b); console.log('scritto scratch-modulo.pdf'); })"
```
Aprire `scratch-modulo.pdf`, verificare header/campi/checkbox e **assenza** della sezione riservata. Poi `rm -f scratch-modulo.pdf`.

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/pdf.js functions/_lib/pdf.test.js
git commit -m "feat: generazione PDF del modulo iscrizione (senza sezione riservata)"
```

---

### Task 6: Invio email (Resend)

**Files:**
- Create: `functions/_lib/email.js`
- Test: `functions/_lib/email.test.js`

**Interfaces:**
- Produces:
  - `buildEmailPayload(value, pdfBase64, env): object` (payload Resend, senza effetti collaterali)
  - `async inviaEmailIscrizione(value, pdfBytes, env): Promise<void>` (usa `fetch`, lancia se non 2xx)
- Consumes: `env.RESEND_API_KEY`, `env.ASSOCIATION_EMAIL`, `env.MAIL_FROM`.

- [ ] **Step 1: Scrivere i test (falliscono)**

`functions/_lib/email.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildEmailPayload, inviaEmailIscrizione } from './email.js';

const env = { RESEND_API_KEY: 'k', ASSOCIATION_EMAIL: 'info@associazionestill.it', MAIL_FROM: 'Still <noreply@associazionestill.it>' };
const value = { socio: { nome: 'Mario', cognome: 'Rossi', email: 'mario@example.it' },
  metodoPagamento: 'bonifico', tipologiaSocio: 'maggiorenne' };

describe('buildEmailPayload', () => {
  it('invia a info@ e in copia al socio, con allegato PDF', () => {
    const p = buildEmailPayload(value, 'QkFTRTY0', env);
    expect(p.from).toBe(env.MAIL_FROM);
    expect(p.to).toContain('info@associazionestill.it');
    expect(p.to).toContain('mario@example.it');
    expect(p.subject).toMatch(/Rossi/);
    expect(p.attachments[0].content).toBe('QkFTRTY0');
    expect(p.attachments[0].filename).toMatch(/\.pdf$/);
  });
});

describe('inviaEmailIscrizione', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POST a Resend con Authorization; ok se 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    await inviaEmailIscrizione(value, new Uint8Array([1, 2, 3]), env);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer k');
  });

  it('lancia se Resend risponde non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'err' }));
    await expect(inviaEmailIscrizione(value, new Uint8Array([1]), env)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/_lib/email.test.js`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare `functions/_lib/email.js`**

```js
function bytesToBase64(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function buildEmailPayload(value, pdfBase64, env) {
  const nome = `${value.socio.nome} ${value.socio.cognome}`.trim();
  const metodo = value.metodoPagamento === 'bonifico'
    ? 'bonifico bancario (da verificare)'
    : `online (${value.metodoPagamento})`;
  const to = [env.ASSOCIATION_EMAIL];
  if (value.socio.email && !to.includes(value.socio.email)) to.push(value.socio.email);

  return {
    from: env.MAIL_FROM,
    to,
    subject: `Nuova iscrizione socio — ${nome}`,
    html: `<p>Nuova iscrizione ricevuta.</p>
<ul>
  <li><strong>Socio:</strong> ${nome}</li>
  <li><strong>Tipologia:</strong> ${value.tipologiaSocio}</li>
  <li><strong>Pagamento:</strong> ${metodo}</li>
</ul>
<p>In allegato il modulo compilato in PDF.</p>`,
    attachments: [{ filename: `iscrizione-${value.socio.cognome || 'socio'}.pdf`, content: pdfBase64 }],
  };
}

export async function inviaEmailIscrizione(value, pdfBytes, env) {
  const payload = buildEmailPayload(value, bytesToBase64(pdfBytes), env);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}
```

- [ ] **Step 4: Verificare il passaggio**

Run: `npx vitest run functions/_lib/email.test.js`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/email.js functions/_lib/email.test.js
git commit -m "feat: invio email iscrizione via Resend (info@ + socio, allegato PDF)"
```

---

### Task 7: Function `submit` — ramo bonifico end-to-end

**Files:**
- Create: `functions/api/iscrizione/submit.js`
- Test: `functions/api/iscrizione/submit.test.js`

**Interfaces:**
- Consumes: `validateIscrizione`, `generaPdfIscrizione`, `inviaEmailIscrizione`, `IBAN`.
- Produces: handler `onRequestPost({ request, env })`.
  - **bonifico** → genera PDF, invia email, cancella KV, `200 { ok:true, metodo:'bonifico', iban }`.
  - **stripe|paypal** → `501 { ok:false, error:'pagamento online non ancora disponibile' }` (completato nei Piani 2/3).
  - validazione fallita → `400 { ok:false, errors }`.

- [ ] **Step 1: Scrivere i test (falliscono)**

`functions/api/iscrizione/submit.test.js`:
```js
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
```

- [ ] **Step 2: Verificare il fallimento**

Run: `npx vitest run functions/api/iscrizione/submit.test.js`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare `functions/api/iscrizione/submit.js`**

```js
import { validateIscrizione } from '../../_lib/validate.js';
import { generaPdfIscrizione } from '../../_lib/pdf.js';
import { inviaEmailIscrizione } from '../../_lib/email.js';
import { IBAN } from '../../_lib/config.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function newId() {
  return 'isc_' + crypto.randomUUID();
}

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, errors: ['Body non valido'] }, 400);
  }

  const { ok, errors, value } = validateIscrizione(data);
  if (!ok) return json({ ok: false, errors }, 400);

  const id = newId();
  // Storage transitorio: TTL 1h; cancellato dopo l'invio.
  await env.ISCRIZIONI_KV.put(id, JSON.stringify(value), { expirationTtl: 3600 });

  if (value.metodoPagamento === 'bonifico') {
    try {
      const pdf = await generaPdfIscrizione(value, { stato: 'da verificare', provider: 'bonifico' });
      await inviaEmailIscrizione(value, pdf, env);
      await env.ISCRIZIONI_KV.delete(id);
      return json({ ok: true, metodo: 'bonifico', iban: IBAN });
    } catch (e) {
      return json({ ok: false, errors: ['Errore nell\'invio del modulo: ' + e.message] }, 500);
    }
  }

  // Stripe/PayPal completati nei Piani 2 e 3.
  return json({ ok: false, error: 'pagamento online non ancora disponibile' }, 501);
}
```

- [ ] **Step 4: Verificare il passaggio**

Run: `npx vitest run functions/api/iscrizione/submit.test.js`
Expected: PASS (3 test).

- [ ] **Step 5: Eseguire l'intera suite**

Run: `npm test`
Expected: tutti i test PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/api/iscrizione/submit.js functions/api/iscrizione/submit.test.js
git commit -m "feat: endpoint submit iscrizione con ramo bonifico end-to-end"
```

---

### Task 8: Pagina `/iscrizione` (form) + ripuntamento "Diventa socio"

**Files:**
- Create: `iscrizione.html`
- Modify: `index.html` (button "Diventa socio" → `/iscrizione`)

**Interfaces:**
- Consumes: `POST /api/iscrizione/submit` (JSON del §6 spec).
- Produces: form completo con validazione client e invio fetch; su bonifico mostra esito con IBAN.

- [ ] **Step 1: Creare `iscrizione.html`**

Requisiti del markup (stile coerente con `index.html`: variabile `--red:#C0392B`, font di sistema del sito, card bianche con ombra tenue):
- `<head>` con `<meta viewport>`, `<title>Iscrizione Socio — Associazione Italiana Malattia di Still</title>`, stessi stili base del sito (copiare le variabili CSS e i font da `index.html`).
- Header con logo (`Logo_Still.jpeg`) e titolo "Modulo Iscrizione Anno 2026".
- `<form id="form-iscrizione">` con i campi (usare `name` coerenti col JSON):
  - Radio `tipologiaIscrizione` (primo|rinnovo) — obbligatorio.
  - Radio `tipologiaSocio` (maggiorenne|minorenne) — obbligatorio; onchange mostra/nasconde `#sezione-genitore`.
  - Fieldset "Dati del socio": input `socio.nome`, `socio.cognome`, `socio.luogoNascita`, `socio.dataNascita` (type=date), `socio.codiceFiscale`, `socio.indirizzo`, `socio.cap`, `socio.comune`, `socio.provincia`, `socio.telefono`, `socio.email` (type=email) — tutti `required`.
  - Fieldset "Categoria di appartenenza": checkbox multipli con i valori di `CATEGORIE`; input testo `categoriaAltro` abilitato quando "Altro" è spuntato.
  - Fieldset `#sezione-genitore` (nascosto di default): input `genitore.*` + select `genitore.qualita` (Padre|Madre|Tutore legale|Altro). `required` applicati solo se minorenne (via JS).
  - Fieldset "Quota €30,00" (testo informativo).
  - Radio `metodoPagamento` (stripe|paypal|bonifico) — obbligatorio. In questo piano stripe/paypal mostrano nota "disponibile a breve" ma restano selezionabili (il submit risponde 501 e la UI mostra un messaggio).
  - Checkbox `consensoComunicazioni` (facoltativo).
  - Checkbox `consensoPrivacy` (obbligatorio) con link a `/privacy` (target `_blank`).
  - Input `luogo` (testo) e `dataFirma` (type=date, default oggi).
  - Checkbox dichiarazione firma (obbligatorio) — "Dichiaro che i dati sono veritieri e presto il consenso".
  - Honeypot: input nascosto `website` (se compilato → il JS annulla l'invio).
  - Bottone submit "Invia e prosegui".
- Area esito `#esito` (nascosta) per messaggi di successo/errore.

- [ ] **Step 2: Aggiungere lo script del form in `iscrizione.html`**

Prima di `</body>`:
```html
<script>
  const form = document.getElementById('form-iscrizione');
  const esito = document.getElementById('esito');
  const radiosSocio = form.querySelectorAll('input[name="tipologiaSocio"]');
  const sezGenitore = document.getElementById('sezione-genitore');

  function aggiornaGenitore() {
    const min = form.querySelector('input[name="tipologiaSocio"]:checked')?.value === 'minorenne';
    sezGenitore.style.display = min ? 'block' : 'none';
    sezGenitore.querySelectorAll('input,select').forEach(el => { el.required = min; });
  }
  radiosSocio.forEach(r => r.addEventListener('change', aggiornaGenitore));
  aggiornaGenitore();

  // data firma default = oggi
  const oggi = new Date().toISOString().slice(0, 10);
  form.querySelector('input[name="dataFirma"]').value = oggi;

  function raccogliDati() {
    const g = (n) => form.querySelector(`[name="${n}"]`)?.value.trim() ?? '';
    const min = form.querySelector('input[name="tipologiaSocio"]:checked')?.value === 'minorenne';
    const categorie = [...form.querySelectorAll('input[name="categorie"]:checked')].map(c => c.value);
    return {
      tipologiaIscrizione: form.querySelector('input[name="tipologiaIscrizione"]:checked')?.value || '',
      tipologiaSocio: form.querySelector('input[name="tipologiaSocio"]:checked')?.value || '',
      socio: {
        nome: g('socio.nome'), cognome: g('socio.cognome'), luogoNascita: g('socio.luogoNascita'),
        dataNascita: g('socio.dataNascita'), codiceFiscale: g('socio.codiceFiscale'),
        indirizzo: g('socio.indirizzo'), cap: g('socio.cap'), comune: g('socio.comune'),
        provincia: g('socio.provincia'), telefono: g('socio.telefono'), email: g('socio.email'),
      },
      categorie, categoriaAltro: g('categoriaAltro'),
      genitore: min ? {
        nome: g('genitore.nome'), cognome: g('genitore.cognome'), luogoNascita: g('genitore.luogoNascita'),
        dataNascita: g('genitore.dataNascita'), codiceFiscale: g('genitore.codiceFiscale'),
        telefono: g('genitore.telefono'), email: g('genitore.email'), qualita: g('genitore.qualita'),
      } : null,
      metodoPagamento: form.querySelector('input[name="metodoPagamento"]:checked')?.value || '',
      consensoComunicazioni: form.querySelector('input[name="consensoComunicazioni"]').checked,
      consensoPrivacy: form.querySelector('input[name="consensoPrivacy"]').checked,
      luogo: g('luogo'), dataFirma: g('dataFirma'),
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.querySelector('[name="website"]').value) return; // honeypot
    if (!form.reportValidity()) return;
    esito.style.display = 'block';
    esito.textContent = 'Invio in corso…';
    try {
      const res = await fetch('/api/iscrizione/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(raccogliDati()),
      });
      const json = await res.json();
      if (res.status === 501) {
        esito.textContent = 'Il pagamento online sarà disponibile a breve. Per ora seleziona "Bonifico".';
        return;
      }
      if (!res.ok || !json.ok) {
        esito.innerHTML = '<strong>Errori:</strong><br>' + (json.errors || [json.error || 'Errore']).join('<br>');
        return;
      }
      if (json.metodo === 'bonifico') {
        window.location.href = '/iscrizione-completata?metodo=bonifico';
      }
    } catch (err) {
      esito.textContent = 'Errore di rete. Riprova.';
    }
  });
</script>
```

- [ ] **Step 3: Ripuntare il button "Diventa socio" in `index.html`**

Cercare in `index.html`:
```html
<a href="#modulo-info" onclick="preselezionaInteresse('socio')" class="btn-outline" style="font-size:16px;padding:15px 39px;">Diventa socio</a>
```
Sostituire con:
```html
<a href="/iscrizione" class="btn-outline" style="font-size:16px;padding:15px 39px;">Diventa socio</a>
```

- [ ] **Step 4: Verifica manuale del form (screenshot)**

Run (in due terminali o background):
```bash
npm run dev:functions
```
Poi:
```bash
node screenshot.mjs http://localhost:8788/iscrizione iscrizione-form
```
Leggere il PNG in `temporary screenshots/`: verificare che il form sia completo, in stile col sito, con la sezione genitore nascosta di default.

- [ ] **Step 5: Test manuale end-to-end bonifico (con env di test)**

Impostare in locale un `.dev.vars` (già ignorato da git) con:
```
RESEND_API_KEY=... (chiave di test)
ASSOCIATION_EMAIL=indirizzo-di-test@example.it
MAIL_FROM=Test <onboarding@resend.dev>
```
Compilare il form scegliendo **Bonifico**, inviare, verificare: redirect a `/iscrizione-completata`, ricezione email con PDF alla casella di test.

- [ ] **Step 6: Commit**

```bash
git add iscrizione.html index.html
git commit -m "feat: pagina /iscrizione (form) e ripuntamento button Diventa socio"
```

---

### Task 9: Pagina esito `/iscrizione-completata`

**Files:**
- Create: `iscrizione-completata.html`

**Interfaces:**
- Consumes: query param `?metodo=bonifico` (in futuro `stripe`/`paypal`).

- [ ] **Step 1: Creare `iscrizione-completata.html`**

- Stile coerente col sito.
- Messaggio base: "Grazie! La tua richiesta di iscrizione è stata registrata."
- Blocco condizionale via JS in base a `?metodo`:
  - `bonifico`: mostra istruzioni bonifico con **IBAN `IT82 C062 3005 0720 0003 6140 126`**, causale "Iscrizione 2026 — Nome Cognome", importo €30,00, e nota "riceverai il modulo via email".
  - altro/assente: messaggio generico di conferma pagamento e invio email.
- Link "Torna alla home" → `/`.

```html
<script>
  const metodo = new URLSearchParams(location.search).get('metodo');
  const box = document.getElementById('dettaglio');
  if (metodo === 'bonifico') {
    box.innerHTML = `<p>Completa il pagamento con un bonifico di <strong>€30,00</strong>:</p>
      <p><strong>IBAN:</strong> IT82 C062 3005 0720 0003 6140 126<br>
      <strong>Causale:</strong> Iscrizione 2026 — Nome Cognome</p>
      <p>Hai ricevuto via email una copia del modulo compilato.</p>`;
  } else {
    box.innerHTML = `<p>Pagamento ricevuto. Ti abbiamo inviato via email la copia del modulo compilato.</p>`;
  }
</script>
```

- [ ] **Step 2: Verifica manuale (screenshot)**

Run: `node screenshot.mjs "http://localhost:8788/iscrizione-completata?metodo=bonifico" esito-bonifico`
Leggere il PNG: verificare IBAN e messaggio.

- [ ] **Step 3: Commit**

```bash
git add iscrizione-completata.html
git commit -m "feat: pagina esito iscrizione con istruzioni bonifico"
```

---

## Self-Review (esito)

- **Copertura spec (Piano 1):** form `/iscrizione` (Task 8) ✓; validazione server (Task 3) ✓; PDF senza sezione riservata (Task 5) ✓; email info@ + socio (Task 6) ✓; ramo bonifico end-to-end (Task 7) ✓; KV transitorio + cancellazione (Task 7) ✓; importo/anno/IBAN in config (Task 2) ✓; button ripuntato (Task 8) ✓; pagina esito (Task 9) ✓. Rimandati ai piani successivi: Stripe (P2), PayPal (P3), pagina `/privacy` (P4), copertura assicurativa/tessera (fuori scope).
- **Placeholder:** l'unico placeholder volontario è l'`id` del KV in `wrangler.toml` (valore reale fornito dall'Associazione, documentato in `functions/README.md`). Nessun placeholder di codice.
- **Coerenza tipi:** `validateIscrizione → {ok,errors,value}` usato coerentemente in `submit.js`; `generaPdfIscrizione(value, pagamento)` e `inviaEmailIscrizione(value, pdfBytes, env)` usati con le stesse firme nei test e nell'endpoint.

## Dipendenze esterne prima del go-live (a carico dell'Associazione)
- Namespace KV creato e id inserito in `wrangler.toml` + binding in Cloudflare Pages.
- Account Resend + verifica DNS del dominio + `MAIL_FROM` su dominio verificato.
- Le variabili elencate in `functions/README.md` impostate su Cloudflare Pages.
