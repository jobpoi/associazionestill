# Iscrizione Socio Online — Piano 4: Pagina Informativa Privacy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Creare la pagina `/privacy` con l'informativa sul trattamento dei dati (GDPR) linkata dal modulo di iscrizione, coerente col brand. Il testo è una **bozza template** con segnaposto da far validare dall'Associazione/DPO — NON è consulenza legale.

**Architecture:** Pagina statica `privacy.html` servita da Cloudflare Pages su `/privacy` (già linkata da `iscrizione.html` con `target="_blank"`). Nessun backend, nessun test automatico: verifica per screenshot + controllo del link dal form.

**Tech Stack:** HTML/CSS inline, stile riusato da `iscrizione.html`.

## Global Constraints

- Stile coerente con `iscrizione.html`/`index.html`: variabili CSS (`--red:#C0392B`), font e card. Riusare l'header (logo + "Torna al sito").
- Titolare noto: **Associazione Italiana Malattia di Still ODV**, email `info@associazionestill.it`, PEC `associazionestill@pec.it`, C.F. `96658340581`.
- L'informativa DEVE coprire i **dati particolari relativi alla salute** (categorie "Paziente adulto/pediatrico"), base giuridica art. 9 GDPR = consenso esplicito.
- I responsabili/fornitori da citare: **Cloudflare** (hosting), **Resend** (invio email), **Stripe** e **PayPal** (pagamenti).
- Ogni dato non certo va lasciato come **segnaposto esplicito tra parentesi quadre** (es. `[indirizzo sede legale]`, `[tempi di conservazione]`, `[eventuale DPO e contatti]`) — così l'Associazione sa cosa completare. NON inventare indirizzi, nomi di DPO o durate di conservazione precise.
- In cima alla pagina, una nota visibile: "Bozza da validare — testo provvisorio in attesa di verifica legale."
- La pagina NON deve contenere la sezione "Riservato all'Associazione".

---

### Task 1: Pagina `privacy.html`

**Files:**
- Create: `privacy.html`
- Verify: link `/privacy` dal form `iscrizione.html` (già presente) risolve alla pagina.

**Interfaces:**
- Consumes: nessuna (pagina statica). Linkata da `iscrizione.html` (checkbox consenso → `<a href="/privacy" target="_blank">`).

- [ ] **Step 1: Creare `privacy.html`**

Requisiti:
- `<head>`: `<meta viewport>`, `<title>Informativa Privacy — Associazione Italiana Malattia di Still</title>`, e gli STESSI stili base di `iscrizione.html` (copiare il blocco `<style>` con le variabili CSS, i font, `.card`, e gli stili tipografici; adattare i selettori se servono per il testo lungo — paragrafi, elenchi, titoli di sezione).
- Header identico a `iscrizione.html`: logo `Logo_Still.jpeg` + titolo pagina + link "← Torna al sito" (`/`). Sotto l'header, un link "← Torna al modulo" verso `/iscrizione`.
- Un banner/nota in cima (stile avviso, sfondo tenue): **"Bozza da validare — testo provvisorio in attesa di verifica legale."**
- Contenuto dell'informativa, in una `.card`, con queste sezioni (testo verbatim sotto, italiano corretto con accenti):

**Titolo:** `Informativa sul trattamento dei dati personali (art. 13 Reg. UE 2016/679 - GDPR)`

**1. Titolare del trattamento**
"Il Titolare del trattamento è l'Associazione Italiana Malattia di Still ODV (C.F. 96658340581), con sede in [indirizzo sede legale]. Email: info@associazionestill.it - PEC: associazionestill@pec.it. [Eventuale Responsabile della Protezione dei Dati (DPO) e relativi contatti, se nominato]."

**2. Tipologie di dati trattati**
"Trattiamo: dati anagrafici e identificativi (nome, cognome, luogo e data di nascita, codice fiscale), dati di contatto (indirizzo, email, telefono) e, per i soci minorenni, i dati del genitore/tutore. La categoria di appartenenza selezionata (es. 'Paziente adulto', 'Paziente pediatrico') può rivelare **dati relativi alla salute**, che costituiscono categoria particolare di dati ai sensi dell'art. 9 GDPR."

**3. Finalità e base giuridica**
"I dati sono trattati per: (a) gestione della richiesta di iscrizione e del rapporto associativo (base giuridica: esecuzione di misure precontrattuali e contrattuali, art. 6.1.b); (b) adempimenti relativi alla copertura assicurativa obbligatoria dei soci; (c) invio di comunicazioni dell'Associazione, solo previo consenso (art. 6.1.a). Il trattamento dei dati relativi alla salute avviene sulla base del **consenso esplicito** dell'interessato (art. 9.2.a)."

**4. Modalità e conservazione**
"I dati sono trattati con strumenti elettronici e cartacei, con misure di sicurezza adeguate. I dati sono conservati per la durata del rapporto associativo e successivamente per [tempi di conservazione da definire, es. termini di legge fiscali/assicurativi]. I dati del modulo online in attesa di pagamento sono conservati temporaneamente ed eliminati dopo l'invio della conferma."

**5. Destinatari dei dati**
"I dati possono essere comunicati a: la compagnia assicurativa per la copertura dei soci; i fornitori tecnici che agiscono come responsabili del trattamento, tra cui Cloudflare, Inc. (hosting del sito), Resend (invio delle email) e Stripe / PayPal (gestione dei pagamenti). Alcuni di questi fornitori possono trattare i dati anche al di fuori dell'UE, con adeguate garanzie previste dagli artt. 44 e ss. GDPR."

**6. Diritti dell'interessato**
"L'interessato può in ogni momento esercitare i diritti di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità (artt. 15-22 GDPR), nonché revocare il consenso prestato senza pregiudicare la liceità del trattamento precedente. Le richieste vanno inviate a info@associazionestill.it. È inoltre possibile proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it)."

**7. Conferimento dei dati**
"Il conferimento dei dati contrassegnati come obbligatori è necessario per perfezionare l'iscrizione; il mancato conferimento rende impossibile l'accettazione della domanda. Il consenso alle comunicazioni è facoltativo."

In fondo: "Ultimo aggiornamento: [data]." (segnaposto).

- [ ] **Step 2: Verifica del link dal form**

Confermare (lettura di `iscrizione.html`) che il consenso privacy linka `/privacy`. Se il link fosse `privacy.html` o altro, allinearlo a `/privacy` (rotta servita da Cloudflare Pages). NON modificare altra logica del form.

- [ ] **Step 3: Verifica manuale (screenshot)**

Run (se non attivo): `node serve.mjs`
Run: `node screenshot.mjs "http://localhost:3000/privacy.html" privacy`
Leggere il PNG: confermare header col logo, banner "Bozza da validare", tutte le 7 sezioni presenti, stile coerente col sito, presenza dei segnaposto tra parentesi quadre, assenza di qualsiasi sezione "Riservato all'Associazione".

- [ ] **Step 4: Commit**

```bash
git add privacy.html
git commit -m "feat: pagina informativa privacy (bozza GDPR da validare)"
```
(Se è stato necessario allineare il link nel form: `git add iscrizione.html` nello stesso commit.)

---

## Self-Review (esito)

- **Copertura spec:** pagina `/privacy` con informativa GDPR completa (titolare, dati inclusi salute art. 9, finalità/base giuridica, conservazione, destinatari con Cloudflare/Resend/Stripe/PayPal, diritti, conferimento) ✓; banner "bozza da validare" ✓; segnaposto espliciti per i dati non certi ✓; link dal form verificato ✓; stile brand ✓.
- **Placeholder:** i segnaposto tra parentesi quadre sono **voluti** (dati che solo l'Associazione può fornire) — non sono placeholder di codice.
- **Coerenza:** stile riusato da `iscrizione.html`; nessuna logica JS necessaria.

## Dipendenze esterne (a carico dell'Associazione)
- Validazione legale del testo e compilazione dei segnaposto: indirizzo sede legale, eventuale DPO, tempi di conservazione, data di aggiornamento, conferma dei fornitori/responsabili e degli accordi di trattamento (DPA) con Cloudflare/Resend/Stripe/PayPal.
