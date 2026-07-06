import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./functions/api/iscrizione/submit.js', () => ({
  onRequestPost: vi.fn(async () => new Response(JSON.stringify({ ok: true, from: 'submit' }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })),
}));
vi.mock('./functions/api/stripe/webhook.js', () => ({
  onRequestPost: vi.fn(async () => new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })),
}));
vi.mock('./functions/api/paypal/capture.js', () => ({
  onRequestGet: vi.fn(async () => new Response(null, {
    status: 302, headers: { Location: '/iscrizione-completata?metodo=paypal' },
  })),
}));

import worker from './worker.js';
import { onRequestPost as submitPost } from './functions/api/iscrizione/submit.js';
import { onRequestPost as webhookPost } from './functions/api/stripe/webhook.js';
import { onRequestGet as captureGet } from './functions/api/paypal/capture.js';

function envWithAssets() {
  return {
    ISCRIZIONI_KV: {},
    ASSETS: { fetch: vi.fn(async () => new Response('ASSET', { status: 200 })) },
  };
}
const post = (path, body = '{}') => new Request('http://x' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
});
const get = (path) => new Request('http://x' + path, { method: 'GET' });

describe('worker router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /api/iscrizione/submit → chiama submit e passa {request, env}', async () => {
    const env = envWithAssets();
    const res = await worker.fetch(post('/api/iscrizione/submit'), env);
    expect(res.status).toBe(200);
    expect((await res.json()).from).toBe('submit');
    expect(submitPost).toHaveBeenCalledOnce();
    const arg = submitPost.mock.calls[0][0];
    expect(arg.env).toBe(env);
    expect(arg.request).toBeInstanceOf(Request);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('POST /api/stripe/webhook → chiama webhook', async () => {
    const res = await worker.fetch(post('/api/stripe/webhook'), envWithAssets());
    expect(res.status).toBe(200);
    expect(webhookPost).toHaveBeenCalledOnce();
  });

  it('GET /api/paypal/capture → chiama capture (redirect 302)', async () => {
    const res = await worker.fetch(get('/api/paypal/capture?token=ORD1'), envWithAssets());
    expect(res.status).toBe(302);
    expect(captureGet).toHaveBeenCalledOnce();
  });

  it('metodo sbagliato su rotta esistente → 405 JSON', async () => {
    const res = await worker.fetch(get('/api/iscrizione/submit'), envWithAssets());
    expect(res.status).toBe(405);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(submitPost).not.toHaveBeenCalled();
  });

  it('rotta /api sconosciuta → 404 JSON', async () => {
    const res = await worker.fetch(post('/api/inesistente'), envWithAssets());
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('trailing slash tollerato', async () => {
    await worker.fetch(post('/api/iscrizione/submit/'), envWithAssets());
    expect(submitPost).toHaveBeenCalledOnce();
  });

  it('richiesta non-API → delega a env.ASSETS.fetch', async () => {
    const env = envWithAssets();
    const res = await worker.fetch(get('/iscrizione'), env);
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(await res.text()).toBe('ASSET');
    expect(submitPost).not.toHaveBeenCalled();
  });

  it('root / → asset', async () => {
    const env = envWithAssets();
    await worker.fetch(get('/'), env);
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
  });
});
