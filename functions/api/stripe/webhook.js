import { verifyStripeSignature } from '../../_lib/stripe.js';
import { generaPdfIscrizione } from '../../_lib/pdf.js';
import { inviaEmailIscrizione } from '../../_lib/email.js';

const ok200 = () =>
  new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  const valid = await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('invalid signature', { status: 400 });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') return ok200();

  const session = event.data?.object || {};
  const kvId = session.client_reference_id;
  const stored = kvId ? await env.ISCRIZIONI_KV.get(kvId) : null;
  if (!stored) return ok200(); // idempotenza: già processato o scaduto

  const value = JSON.parse(stored);
  const pdf = await generaPdfIscrizione(value, {
    stato: 'pagato',
    provider: 'Stripe',
    riferimento: session.payment_intent || session.id || '',
  });
  await inviaEmailIscrizione(value, pdf, env);
  await env.ISCRIZIONI_KV.delete(kvId);
  return ok200();
}
