# CLAUDE.md — Regole per Siti Web Frontend

## Progetto: Sito Associazione Italiana Malattia di Still

### Struttura
- **Sorgente unico: `index.html` nella root** (stili inline, Tailwind via CDN). È il file servito in locale e deployato. Tutte le modifiche vanno qui.
- `dist/` è un build **non tracciato** da git — non modificarlo: le modifiche si perdono. Lavorare solo su `index.html` nella root.
- Contenuti dinamici in `content/site.json` (nav, hero, statistiche, testimonianze, footer) e `content/news.json` (notizie): caricati via `fetch` a runtime e iniettati nel DOM.

### Brand
- Logo: `Logo_Still.jpeg` nella root (mandala di petali + scritta "Associazione Italiana – Malattia di Still"). Per usi piccoli (es. centro di un QR) ritagliare **solo l'emblema circolare**, la scritta diventa illeggibile.
- Colore primario: rosso `#C0392B` (variabile CSS `--red`). Non inventare altri colori brand.

### Deep-link e ancore (IMPORTANTE)
- I contenuti caricati via `fetch` (notizie con immagini, statistiche) si inseriscono **dopo** il render iniziale e **allungano la pagina**: un link `#sezione` salta a una posizione che poi si sposta, atterrando sulla sezione sbagliata.
- Convenzione: ogni target di ancora ha `scroll-margin-top:110px` (compensa la nav fissa).
- In fondo a `index.html` c'è uno script che **riallinea l'ancora finché il layout non si assesta** (e si ferma se l'utente scorre). Mantenerlo e testare ogni nuova sezione linkabile caricando la pagina direttamente su `localhost:3000/#ancora`.
- Ancore note: `#cinquepermille` (riquadro 5×1000), `#modulo-info` (form contatti).

### QR code
- File definitivi (committati) in `qr-code/`: PNG brand + PNG nero + SVG, con logo al centro.
- Si rigenerano con script di utilità **locali** (non nel repo, esclusi da `.gitignore`): `generate-qr*.mjs` (QR base), `make-emblem.mjs` (ritaglio emblema dal logo), `add-logo.mjs` / `add-logo-svg.mjs` (composizione logo al centro). Dipendenze: `qrcode`, `sharp`, `jsqr`, `pngjs`. Sempre correzione errori livello `H`; **verificare la decodifica** dopo aver inserito il logo.
- I QR sono statici (URL nel codice): gratuiti e senza scadenza, ma se cambia il dominio vanno rigenerati.

### Deploy
- `git push origin main` (remote `jobpoi/associazionestill`) → deploy automatico. Sito live: `https://associazionestill.it`.
- Committare **solo i file sorgente** (`index.html`, `content/`, ecc.). Non committare `node_modules/`, `dist/`, `temporary screenshots/`, né gli script di utilità temporanei.

## Da Fare Sempre per Primo
- **Richiamare la skill `frontend-design`** prima di scrivere qualsiasi codice frontend, ad ogni sessione, senza eccezioni.

## Immagini di Riferimento
- Se viene fornita un'immagine di riferimento: riprodurre layout, spaziatura, tipografia e colori esattamente. Sostituire con contenuti segnaposto (immagini via `https://placehold.co/`, testi generici). Non migliorare né aggiungere elementi al design.
- Se non viene fornita un'immagine di riferimento: progettare da zero con alta qualità artigianale (vedi guardrail sotto).
- Fare uno screenshot dell'output, confrontarlo con il riferimento, correggere le discrepanze, riprendere lo screenshot. Eseguire almeno 2 cicli di confronto. Fermarsi solo quando non rimangono differenze visibili o l'utente lo indica.

## Server Locale
- **Servire sempre su localhost** — non fare mai screenshot da un URL `file:///`.
- Avviare il server di sviluppo: `node serve.mjs` (serve la root del progetto su `http://localhost:3000`)
- `serve.mjs` si trova nella root del progetto. Avviarlo in background prima di qualsiasi screenshot.
- Se il server è già in esecuzione, non avviarne una seconda istanza.

## Workflow Screenshot
- Puppeteer è una dipendenza del progetto (in `node_modules/`), insieme a `sharp`, `qrcode`, `jsqr` e `pngjs` usati per generare e verificare i QR code.
- **Fare sempre screenshot da localhost:** `node screenshot.mjs http://localhost:3000`
- Gli screenshot vengono salvati automaticamente in `./temporary screenshots/screenshot-N.png` (auto-incrementale, mai sovrascritto).
- Suffisso etichetta opzionale: `node screenshot.mjs http://localhost:3000 etichetta` → salva come `screenshot-N-etichetta.png`
- `screenshot.mjs` si trova nella root del progetto. Usarlo così com'è.
- Dopo lo screenshot, leggere il PNG da `temporary screenshots/` con il tool Read — Claude può vedere e analizzare l'immagine direttamente.
- Nel confronto, essere specifici: "il titolo è 32px ma il riferimento mostra ~24px", "il gap tra le card è 16px ma dovrebbe essere 24px"
- Controllare: spaziatura/padding, dimensione/peso/interlinea del font, colori (hex esatto), allineamento, border-radius, ombre, dimensioni delle immagini

## Output Predefiniti
- File singolo `index.html`, tutti gli stili inline, salvo diversa indicazione dell'utente
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Immagini segnaposto: `https://placehold.co/LARGHEZZAxALTEZZA`
- Responsive con approccio mobile-first

## Asset del Brand
- Controllare sempre la cartella `brand_assets/` prima di progettare. Potrebbe contenere loghi, guide ai colori, guide di stile o immagini.
- Se esistono asset, usarli. Non usare segnaposto dove sono disponibili asset reali.
- Se è presente un logo, usarlo. Se è definita una palette di colori, usare quei valori esatti — non inventare colori del brand.

## Guardrail Anti-Genericità
- **Colori:** Non usare mai la palette predefinita di Tailwind (indigo-500, blue-600, ecc.). Scegliere un colore brand personalizzato e derivare da quello.
- **Ombre:** Non usare mai il semplice `shadow-md`. Usare ombre stratificate, tinte di colore con bassa opacità.
- **Tipografia:** Non usare mai lo stesso font per titoli e corpo del testo. Abbinare un display/serif con un sans pulito. Applicare tracking stretto (`-0.03em`) sui titoli grandi, interlinea generosa (`1.7`) sul corpo.
- **Gradienti:** Stratificare più gradienti radiali. Aggiungere grana/texture tramite filtro SVG noise per profondità.
- **Animazioni:** Animare solo `transform` e `opacity`. Mai `transition-all`. Usare easing stile spring.
- **Stati interattivi:** Ogni elemento cliccabile necessita di stati hover, focus-visible e active. Nessuna eccezione.
- **Immagini:** Aggiungere un overlay con gradiente (`bg-gradient-to-t from-black/60`) e un layer di trattamento colore con `mix-blend-multiply`.
- **Spaziatura:** Usare token di spaziatura intenzionali e coerenti — non step Tailwind casuali.
- **Profondità:** Le superfici devono avere un sistema a livelli (base → elevato → fluttuante), non tutte allo stesso piano z.

## Regole Assolute
- Non aggiungere sezioni, funzionalità o contenuti non presenti nel riferimento
- Non "migliorare" un design di riferimento — riprodurlo fedelmente
- Non fermarsi dopo un solo ciclo di screenshot
- Non usare `transition-all`
- Non usare il colore blu/indigo predefinito di Tailwind come colore primario
