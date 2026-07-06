import { describe, it, expect } from 'vitest';
import { QUOTA_CENT, IBAN, annoTessera, CATEGORIE } from './config.js';

describe('config', () => {
  it('quota è 3000 cent', () => {
    expect(QUOTA_CENT).toBe(3000);
  });
  it('IBAN corretto', () => {
    expect(IBAN).toBe('IT82 C062 3005 0720 0003 6140 126');
  });
  it('annoTessera è un numero a 4 cifre', () => {
    expect(String(annoTessera())).toMatch(/^\d{4}$/);
  });
  it('categorie includono le voci del modulo', () => {
    expect(CATEGORIE).toContain('Paziente adulto');
    expect(CATEGORIE).toContain('Paziente pediatrico (sJIA)');
    expect(CATEGORIE).toContain('Caregiver/Familiare');
  });
});
