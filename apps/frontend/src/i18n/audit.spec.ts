import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@strategos/shared';
import fr from './fr.json';

describe('traductions du journal', () => {
  it.each(AUDIT_ACTIONS)('traduit l’action %s', (action) => {
    expect((fr.audit.actions as Record<string, string>)[action]).toBeTruthy();
  });

  it.each(AUDIT_TARGET_TYPES)('traduit le type de cible %s', (type) => {
    expect((fr.audit.targetTypes as Record<string, string>)[type]).toBeTruthy();
  });
});
