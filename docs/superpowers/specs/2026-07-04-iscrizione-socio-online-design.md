# Design — Iscrizione Socio Online (modulo + pagamento €30 + PDF via email)

**Data:** 2026-07-04
**Stato:** approvato (architettura e micro-decisioni confermate dall'utente)

## 1. Obiettivo

Permettere a qualsiasi utente di compilare online il **Modulo Iscrizione Anno 2026** dell'Associazione, pagare la quota di **€30,00** (scegliendo tra Stripe, PayPal o bonifico) e ricevere/inviare il modulo compilato in **PDF** via email a `info@associazionestill.it` e in copia al socio.

Il button **"Diventa socio"** del sito deve aprire questo modulo.

### Fonte del modulo
Riproduzione di `Modulo_Adesione_Associazione Italiana Malattia di Still_ODV.pdf`, **esclusa** la sezione finale "RISERVATO ALL'ASSOCIAZIONE".

## 2. Non-obiettivi (YAGNI)

- Nessuna area riservata soci / login.
- Nessun gestionale libro soci (l'inserimento resta manuale in Associazione).
- Nessuno storage permanente dei dati (vedi §8 GDPR).
- Nessuna emissione automatica di tessera o ricevuta fiscale (fase futura eventuale).

## 3. Decisioni confermate

| Tema | Decisione |
|------|-----------|
| Flusso pagamento | Il socio sceglie: online (Stripe/PayPal) **oppure** bonifico |
| Backend | Sì — Cloudflare Pages Functions + KV |
| Provider | **Stripe + PayPal + bonifico**, tutti in fase 1 |
| Email PDF | A `info@associazionestill.it` **+ copia al socio** |
| Firma | Checkbox di dichiarazione + nome digitato + data automatica (firma elettronica). Niente firma grafica |
| Categoria appartenenza | Selezione **multipla** (checkbox) + campo "Altro" |
| Informativa privacy | Bozza pagina `/privacy` predisposta da noi, **testo legale da validare dall'Associazione** |
| Importo | €30,00 = **3000 cent**, fissato lato server |
| Anno tessera | "ANNO 2026", costante configurabile (default anno corrente) |

## 4. Architettura

```
Browser (iscrizione.html)
   │  submit (fetch JSON)
   ▼
Cloudflare Pages Function  POST /api/iscrizione/submit
   │  valida → salva in KV (id, TTL ~1h)
   ├── bonifico → genera PDF → email (info@ + socio) → cancella KV → risposta "istruzioni bonifico"
   ├── stripe   → crea Checkout Session (€30, client_reference_id=id) → risponde {url} → redirect
   └── paypal   → crea Order (€30, custom_id=id) → risponde {orderID} → approvazione via SDK
                                   │
Stripe  ──webhook──▶ POST /api/stripe/webhook  (checkout.session.completed)
PayPal  ──capture──▶ POST /api/paypal/capture  (+ webhook di riserva)
                                   │  recupera KV → genera PDF → email → cancella KV
                                   ▼
                     Pagina "iscrizione-completata"
```

- **Hosting:** Cloudflare Pages (esistente). Le Functions vivono in `functions/` nello stesso repo e si deployano con il push.
- **KV:** namespace dedicato (es. `ISCRIZIONI_KV`) per il JSON del form in attesa di pagamento. TTL breve + cancellazione esplicita dopo l'invio email.
- **Importo autoritativo lato server:** il client non trasmette mai l'importo.

## 5. Componenti

### 5.1 Frontend — `iscrizione.html` (route `/iscrizione`)
- Stile coerente col brand (rosso `#C0392B`, stessi font, `scroll-margin` per la nav se riusata).
- Struttura a sezioni fedele al modulo:
  1. Tipologia iscrizione (radio: Primo tesseramento / Rinnovo)
  2. Tipologia socio (radio: Maggiorenne / Minorenne) → mostra/nasconde §"Genitore/Tutore"
  3. Dati del socio
  4. Categoria di appartenenza (checkbox multipli + "Altro")
  5. Dati genitore/tutore (condizionale, obbligatori se minorenne)
  6. Metodo di pagamento (radio: Stripe / PayPal / Bonifico)
  7. Comunicazioni (checkbox facoltativo)
  8. Privacy (checkbox **obbligatorio**, con link a `/privacy`)
  9. Dichiarazione + Luogo + data automatica; per minorenni la dichiarazione del genitore/tutore
- Validazione client (campi obbligatori, formato email/CF/CAP) **e** validazione server (autoritativa).
- Stati UI: caricamento, errore, redirect al pagamento, esito.
- Pagine esito: `iscrizione-completata.html` (successo, con messaggio diverso per online vs bonifico) e gestione `?cancelled=1` (pagamento annullato → torna al form con dati preservati se possibile).
- Il link del button **"Diventa socio"** in `index.html` passa da `#modulo-info` a `/iscrizione`.

### 5.2 Backend — Pages Functions (`functions/api/...`)
- `iscrizione/submit.js` — validazione, KV put, branch per metodo di pagamento.
- `stripe/webhook.js` — verifica firma Stripe, gestisce `checkout.session.completed`.
- `paypal/capture.js` — capture ordine PayPal lato server; `paypal/webhook.js` come riserva.
- `_lib/pdf.js` — generazione PDF con `pdf-lib`.
- `_lib/email.js` — invio via Resend (allegato PDF base64).
- `_lib/validate.js` — schema di validazione condiviso.
- `_lib/config.js` — costanti (importo, anno, email associazione, IBAN).

### 5.3 Generazione PDF (`pdf-lib`)
- Riproduce il modulo su 2 pagine, con logo (emblema) in alto.
- Checkbox rese come ☑/☐ in base ai dati.
- Sezione "Riservato all'Associazione" **omessa**.
- Riga stato pagamento:
  - online: "Pagamento effettuato online via **Stripe/PayPal** — €30,00 — rif. {id pagamento}"
  - bonifico: "Pagamento tramite **bonifico bancario** (IBAN …) — **da verificare**"
- Firma: "Firma: {Nome Cognome} — consenso elettronico prestato online il {gg/mm/aaaa}".
- Logo emblema incluso come asset base64 nel bundle della function.

### 5.4 Email (Resend)
- **A:** `info@associazionestill.it` — **CC/secondo invio:** email del socio.
- **Mittente:** dominio `associazionestill.it` verificato in Resend (SPF/DKIM).
- **Oggetto:** "Nuova iscrizione socio — {Nome Cognome} (Anno 2026)".
- **Corpo:** riepilogo essenziale + nota sul metodo/stato di pagamento.
- **Allegato:** `iscrizione-{cognome}-{anno}.pdf`.

## 6. Modello dati (JSON in KV, transitorio)

```
{
  id, createdAt,
  tipologiaIscrizione,           // "primo" | "rinnovo"
  tipologiaSocio,                // "maggiorenne" | "minorenne"
  socio: { nome, cognome, luogoNascita, dataNascita, codiceFiscale,
           indirizzo, cap, comune, provincia, telefono, email },
  categorie: [ ... ], categoriaAltro,
  genitore: { nome, cognome, luogoNascita, dataNascita, codiceFiscale,
              telefono, email, qualita } | null,
  metodoPagamento,               // "stripe" | "paypal" | "bonifico"
  consensoComunicazioni,         // bool
  consensoPrivacy,               // bool (obbligatorio true)
  luogo, dataFirma,
  pagamento: { stato, provider, riferimento } // aggiornato dopo conferma
}
```
Cancellato da KV subito dopo l'invio email (online e bonifico).

## 7. Flussi di pagamento

- **Bonifico:** submit → PDF + email immediati (stato "da verificare") → pagina istruzioni con IBAN.
- **Stripe:** submit → Checkout Session (`mode=payment`, importo server) → redirect Stripe → ritorno su success_url → **conferma reale via webhook** `checkout.session.completed` → PDF + email.
- **PayPal:** submit → create Order (importo server) → approvazione con PayPal JS SDK → `POST /api/paypal/capture` → su `COMPLETED` → PDF + email. Webhook come rete di sicurezza.

## 8. Sicurezza e GDPR

- **Dati sanitari** (categoria particolare, art. 9 GDPR): raccolti solo se l'utente li seleziona; base giuridica = consenso esplicito (checkbox privacy obbligatorio).
- **Nessuno storage permanente**: solo KV transitorio con TTL breve, cancellato dopo l'invio. Nessun database.
- Trasmissione sempre in **HTTPS**.
- **Segreti** solo lato server (variabili d'ambiente Cloudflare), mai nel client. Chiavi pubbliche (PayPal client id) esposte come previsto dall'SDK.
- **Verifica firma webhook** Stripe e verifica ordine PayPal lato server (mai fidarsi del client per l'esito del pagamento).
- **Importo** validato lato server.
- **Anti-abuso base**: honeypot + eventuale rate-limit soft sulla function di submit.
- **Informativa privacy** `/privacy` linkata dal form; contenuto legale definitivo a cura dell'Associazione/DPO.

## 9. Configurazione (segreti/variabili — fornite dall'utente in Cloudflare)

| Nome | Uso |
|------|-----|
| `STRIPE_SECRET_KEY` | creazione Checkout Session |
| `STRIPE_WEBHOOK_SECRET` | verifica firma webhook |
| `PAYPAL_CLIENT_ID` | SDK + API (client id anche lato frontend) |
| `PAYPAL_SECRET` | API server PayPal |
| `PAYPAL_ENV` | `sandbox` \| `live` |
| `RESEND_API_KEY` | invio email |
| `ISCRIZIONI_KV` | binding namespace KV |
| `ASSOCIATION_EMAIL` | `info@associazionestill.it` |

Dipendenza esterna: **verifica DNS del dominio in Resend** (SPF/DKIM) per l'invio come mittente ufficiale.

## 10. Gestione errori

- Validazione fallita → 400 con elenco campi, il form evidenzia gli errori.
- Errore creazione pagamento → messaggio + possibilità di riprovare/scegliere bonifico.
- Errore invio email dopo pagamento riuscito → **il pagamento NON si perde**: si logga, si ritenta, e comunque il pagamento resta tracciato su Stripe/PayPal per riconciliazione manuale. (Il PDF può essere rigenerato dai dati finché il KV non è scaduto; oltre, si recupera dai dati del pagamento.)
- Pagamento annullato dall'utente → ritorno al form.

## 11. Testing

- **Unit:** validazione schema; generazione PDF (campi/checkbox corretti; sezione riservata assente); costruzione payload email.
- **Integrazione (sandbox/test mode):** flusso Stripe test, PayPal sandbox, ramo bonifico; verifica firma webhook.
- **Manuale/E2E:** compilazione reale su `/iscrizione` in locale (`node serve.mjs` per il frontend; Functions via `wrangler pages dev`), screenshot del form (workflow CLAUDE.md), decodifica/apertura del PDF risultante, ricezione email su casella di test.
- Caso minorenne (sezione genitore obbligatoria) e maggiorenne.

## 12. Dipendenze e ordine di build (indicativo)

1. Pagina `/iscrizione` (form + validazione client) e ripuntamento del button "Diventa socio".
2. Function `submit` + validazione server + KV.
3. Generazione PDF + invio email (ramo **bonifico** end-to-end per primo, è il più semplice).
4. Stripe (Checkout + webhook).
5. PayPal (order + capture + webhook).
6. Pagina `/privacy` (bozza) e pagine di esito.
7. Documentazione setup segreti/KV/Resend per l'Associazione.

## 13. Questioni aperte / a carico dell'Associazione

- Testo legale definitivo dell'informativa privacy (dati sanitari, titolare, tempi).
- Creazione/consegna di: account Stripe (chiavi live), app PayPal (client id/secret), account Resend + verifica dominio.
- Conferma indirizzo mittente email (es. `noreply@associazionestill.it`).
- Conferma IBAN e intestazione per la sezione bonifico (dal modulo: `IT82 C062 3005 0720 0003 6140 126`).
