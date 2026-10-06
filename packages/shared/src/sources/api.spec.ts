import { describe, expect, it } from 'vitest';
import { spreadsheetIdFromUrl } from './api.js';

describe('spreadsheetIdFromUrl', () => {
  const id = '1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789abcd';

  it('lien de partage, avec ou sans suite', () => {
    expect(
      spreadsheetIdFromUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`),
    ).toBe(id);
    expect(spreadsheetIdFromUrl(` https://docs.google.com/spreadsheets/d/${id} `)).toBe(id);
    expect(spreadsheetIdFromUrl(`https://docs.google.com/spreadsheets/d/${id}#gid=0`)).toBe(id);
  });

  it('autre adresse, autre hôte, lien « Publier sur le Web »', () => {
    expect(spreadsheetIdFromUrl(id)).toBeNull();
    expect(spreadsheetIdFromUrl(`http://docs.google.com/spreadsheets/d/${id}/edit`)).toBeNull();
    expect(spreadsheetIdFromUrl(`https://exemple.fr/spreadsheets/d/${id}/edit`)).toBeNull();
    expect(
      spreadsheetIdFromUrl(`https://docs.google.com.exemple.fr/spreadsheets/d/${id}`),
    ).toBeNull();
    expect(
      spreadsheetIdFromUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vT/pubhtml'),
    ).toBeNull();
    expect(spreadsheetIdFromUrl('https://docs.google.com/spreadsheets/d/court/edit')).toBeNull();
  });
});
