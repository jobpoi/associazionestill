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

  if (typeof data.website === 'string' && data.website.trim() !== '') {
    return json({ ok: false, errors: ['Invio non valido'] }, 400);
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
