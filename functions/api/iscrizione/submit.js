import { validateIscrizione } from '../../_lib/validate.js';
import { generaPdfIscrizione } from '../../_lib/pdf.js';
import { inviaEmailIscrizione } from '../../_lib/email.js';
import { IBAN } from '../../_lib/config.js';
import { createCheckoutSession } from '../../_lib/stripe.js';
import { createPayPalOrder } from '../../_lib/paypal.js';

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

  if (typeof data.website === 'string' && data.website.trim() !== '') {
    return json({ ok: false, errors: ['Invio non valido'] }, 400);
  }

  const { ok, errors, value } = validateIscrizione(data);
  if (!ok) return json({ ok: false, errors }, 400);

  const id = newId();
  // Storage transitorio: TTL 24h; cancellato dopo l'invio (o dal webhook Stripe).
  await env.ISCRIZIONI_KV.put(id, JSON.stringify(value), { expirationTtl: 86400 });

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

  if (value.metodoPagamento === 'stripe') {
    try {
      const origin = new URL(request.url).origin;
      const url = await createCheckoutSession(env, { kvId: id, email: value.socio.email, origin });
      return json({ ok: true, metodo: 'stripe', url });
    } catch (e) {
      return json({ ok: false, errors: ['Errore nell\'avvio del pagamento: ' + e.message] }, 502);
    }
  }

  if (value.metodoPagamento === 'paypal') {
    try {
      const origin = new URL(request.url).origin;
      const url = await createPayPalOrder(env, { kvId: id, origin });
      return json({ ok: true, metodo: 'paypal', url });
    } catch (e) {
      return json({ ok: false, errors: ['Errore nell\'avvio del pagamento: ' + e.message] }, 502);
    }
  }

  return json({ ok: false, errors: ['Metodo di pagamento non gestito'] }, 400);
}
