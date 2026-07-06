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
