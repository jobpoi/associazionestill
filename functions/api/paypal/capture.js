import { capturePayPalOrder } from '../../_lib/paypal.js';
import { generaPdfIscrizione } from '../../_lib/pdf.js';
import { inviaEmailIscrizione } from '../../_lib/email.js';

const redirect = (path) => new Response(null, { status: 302, headers: { Location: path } });

export async function onRequestGet({ request, env }) {
  const orderId = new URL(request.url).searchParams.get('token');
  if (!orderId) return redirect('/iscrizione?annullato=1');

  try {
    const { status, customId, captureId } = await capturePayPalOrder(env, orderId);
    if (status !== 'COMPLETED') return redirect('/iscrizione?annullato=1');

    const stored = customId ? await env.ISCRIZIONI_KV.get(customId) : null;
    if (!stored) return redirect('/iscrizione-completata?metodo=paypal'); // idempotenza

    const value = JSON.parse(stored);
    const pdf = await generaPdfIscrizione(value, { stato: 'pagato', provider: 'PayPal', riferimento: captureId });
    await inviaEmailIscrizione(value, pdf, env);
    await env.ISCRIZIONI_KV.delete(customId);
    return redirect('/iscrizione-completata?metodo=paypal');
  } catch {
    return redirect('/iscrizione?annullato=1');
  }
}
