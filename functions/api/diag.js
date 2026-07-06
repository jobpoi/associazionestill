// ENDPOINT DIAGNOSTICO TEMPORANEO — da rimuovere dopo aver risolto il problema
// Resend. NON espone il valore del segreto: solo forma (lunghezza/prefisso/spazi)
// e l'esito di un test live contro Resend con la stessa chiave usata dall'invio.
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ env }) {
  const k = env.RESEND_API_KEY;
  const isStr = typeof k === 'string';
  const info = {
    resend_key_present: isStr && k.length > 0,
    resend_key_type: typeof k,
    resend_key_len: isStr ? k.length : null,
    resend_key_prefix: isStr ? k.slice(0, 3) : null,   // atteso "re_"
    resend_key_last4: isStr ? k.slice(-4) : null,
    resend_key_ha_spazi_ai_bordi: isStr ? (k !== k.trim()) : null,
    mail_from: env.MAIL_FROM ?? null,
    association_email: env.ASSOCIATION_EMAIL ?? null,
    has_kv: !!(env.ISCRIZIONI_KV && typeof env.ISCRIZIONI_KV.put === 'function'),
  };
  // Test live: stessa chiave, contro Resend. Interpretazione:
  //  - status 200            → chiave full-access valida
  //  - "restricted_api_key"  → chiave "solo invio" VALIDA (va bene per noi)
  //  - "validation_error"    → chiave NON valida / corrotta
  try {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${isStr ? k : ''}` },
    });
    info.resend_test_status = r.status;
    info.resend_test_body = (await r.text()).slice(0, 300);
  } catch (e) {
    info.resend_test_error = String(e && e.message ? e.message : e);
  }
  return json(info);
}
