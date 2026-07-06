import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildEmailPayload, inviaEmailIscrizione } from './email.js';

const env = { RESEND_API_KEY: 'k', ASSOCIATION_EMAIL: 'info@associazionestill.it', MAIL_FROM: 'Still <noreply@associazionestill.it>' };
const value = { socio: { nome: 'Mario', cognome: 'Rossi', email: 'mario@example.it' },
  metodoPagamento: 'bonifico', tipologiaSocio: 'maggiorenne' };

describe('buildEmailPayload', () => {
  it('invia a info@ e in copia al socio, con allegato PDF', () => {
    const p = buildEmailPayload(value, 'QkFTRTY0', env);
    expect(p.from).toBe(env.MAIL_FROM);
    expect(p.to).toContain('info@associazionestill.it');
    expect(p.to).toContain('mario@example.it');
    expect(p.subject).toMatch(/Rossi/);
    expect(p.attachments[0].content).toBe('QkFTRTY0');
    expect(p.attachments[0].filename).toMatch(/\.pdf$/);
  });
});

describe('inviaEmailIscrizione', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POST a Resend con Authorization; ok se 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    await inviaEmailIscrizione(value, new Uint8Array([1, 2, 3]), env);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer k');
  });

  it('lancia se Resend risponde non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'err' }));
    await expect(inviaEmailIscrizione(value, new Uint8Array([1]), env)).rejects.toThrow();
  });
});
