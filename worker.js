// Entry-point del Worker (modello "Worker + Static Assets").
//
// Cloudflare serve prima gli asset statici (index.html, iscrizione.html, ...):
// solo le richieste che NON corrispondono a un file arrivano qui. Instradiamo
// le rotte /api/* alle Function esistenti (identiche a quelle Pages) e
// deleghiamo tutto il resto al binding ASSETS.
import { onRequestPost as submitPost } from './functions/api/iscrizione/submit.js';
import { onRequestPost as stripeWebhookPost } from './functions/api/stripe/webhook.js';
import { onRequestGet as paypalCaptureGet } from './functions/api/paypal/capture.js';

const ROUTES = [
  { method: 'POST', path: '/api/iscrizione/submit', handler: submitPost },
  { method: 'POST', path: '/api/stripe/webhook', handler: stripeWebhookPost },
  { method: 'GET', path: '/api/paypal/capture', handler: paypalCaptureGet },
];

const jsonError = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Normalizza eventuali slash finali (es. /api/.../submit/ → /api/.../submit).
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (pathname.startsWith('/api/')) {
      const matches = ROUTES.filter((r) => r.path === pathname);
      if (matches.length === 0) {
        return jsonError({ ok: false, errors: ['Endpoint non trovato'] }, 404);
      }
      const route = matches.find((r) => r.method === request.method);
      if (!route) {
        return jsonError({ ok: false, errors: ['Metodo non consentito'] }, 405);
      }
      return route.handler({ request, env });
    }

    // Non-API: lascia servire il file statico (o la 404 di Cloudflare).
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
};
