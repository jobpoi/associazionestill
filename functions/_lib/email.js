function bytesToBase64(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function buildEmailPayload(value, pdfBase64, env) {
  const nome = `${value.socio.nome} ${value.socio.cognome}`.trim();
  const metodo = value.metodoPagamento === 'bonifico'
    ? 'bonifico bancario (da verificare)'
    : `online (${value.metodoPagamento})`;
  const to = [env.ASSOCIATION_EMAIL];
  if (value.socio.email && !to.includes(value.socio.email)) to.push(value.socio.email);

  return {
    from: env.MAIL_FROM,
    to,
    subject: `Nuova iscrizione socio — ${nome}`,
    html: `<p>Nuova iscrizione ricevuta.</p>
<ul>
  <li><strong>Socio:</strong> ${nome}</li>
  <li><strong>Tipologia:</strong> ${value.tipologiaSocio}</li>
  <li><strong>Pagamento:</strong> ${metodo}</li>
</ul>
<p>In allegato il modulo compilato in PDF.</p>`,
    attachments: [{ filename: `iscrizione-${value.socio.cognome || 'socio'}.pdf`, content: pdfBase64 }],
  };
}

export async function inviaEmailIscrizione(value, pdfBytes, env) {
  const payload = buildEmailPayload(value, bytesToBase64(pdfBytes), env);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}
