import { QUOTA_CENT, annoTessera } from './config.js';

export function paypalBase(env) {
  return env && env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export async function getAccessToken(env) {
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

export async function createPayPalOrder(env, { kvId, origin }) {
  const token = await getAccessToken(env);
  const value = (QUOTA_CENT / 100).toFixed(2);
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'EUR', value },
      custom_id: kvId,
      description: `Quota associativa ${annoTessera()}`,
    }],
    application_context: {
      brand_name: 'Associazione Italiana Malattia di Still',
      user_action: 'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
      return_url: `${origin}/api/paypal/capture`,
      cancel_url: `${origin}/iscrizione?annullato=1`,
    },
  };
  const res = await fetch(`${paypalBase(env)}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PayPal order error ${res.status}: ${await res.text()}`);
  const order = await res.json();
  const link = (order.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
  if (!link) throw new Error('PayPal: link di approvazione mancante');
  return link.href;
}

export async function capturePayPalOrder(env, orderId) {
  const token = await getAccessToken(env);
  const res = await fetch(`${paypalBase(env)}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`PayPal capture error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const cap = data.purchase_units?.[0]?.payments?.captures?.[0] || {};
  return {
    status: data.status,
    customId: cap.custom_id || data.purchase_units?.[0]?.custom_id || '',
    captureId: cap.id || '',
  };
}
