export const QUOTA_CENT = 3000;
export const IBAN = 'IT82 C062 3005 0720 0003 6140 126';

export function annoTessera() {
  // Costante di dominio: anno di tesseramento corrente.
  return new Date().getUTCFullYear();
}

export const TIPI_ISCRIZIONE = ['primo', 'rinnovo'];
export const TIPI_SOCIO = ['maggiorenne', 'minorenne'];

export const CATEGORIE = [
  'Paziente adulto',
  'Paziente pediatrico (sJIA)',
  'Caregiver/Familiare',
  'Medico o Professionista sanitario',
  'Ricercatore/Studente',
  'Sostenitore',
  'Altro',
];

export const QUALITA_GENITORE = ['Padre', 'Madre', 'Tutore legale', 'Altro'];

export const METODI_PAGAMENTO = ['stripe', 'paypal', 'bonifico'];
