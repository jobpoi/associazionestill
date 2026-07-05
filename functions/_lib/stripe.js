import { QUOTA_CENT, annoTessera } from './config.js';

export async function createCheckoutSession(env, { kvId, email, origin }) {
  // Nota: non usiamo URLSearchParams per l'intero body perché codifica anche
  // le parentesi quadre nelle chiavi (es. "line_items[0]" -> "line_items%5B0%5D"),
  // producendo un body form-urlencoded comunque valido per Stripe ma che
  // rompe i controlli di sottostringa letterale nei test. Codifichiamo solo i valori.
  const pairs = [];
  const add = (key, value) => pairs.push(`${key}=${encodeURIComponent(value)}`);

  add('mode', 'payment');
  add('client_reference_id', kvId);
  add('success_url', `${origin}/iscrizione-completata?metodo=stripe`);
  add('cancel_url', `${origin}/iscrizione?annullato=1`);
  if (email) add('customer_email', email);
  add('line_items[0][quantity]', '1');
  add('line_items[0][price_data][currency]', 'eur');
  add('line_items[0][price_data][unit_amount]', String(QUOTA_CENT));
  add('line_items[0][price_data][product_data][name]', `Quota associativa ${annoTessera()}`);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: pairs.join('&'),
  });
  if (!res.ok) {
    throw new Error(`Stripe error ${res.status}: ${await res.text()}`);
  }
  const session = await res.json();
  return session.url;
}

export async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const kv of sigHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1);
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`));
  const expected = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
