import type { TFunction } from 'i18next';
import { describeField } from './ErrorMessage';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts && 'n' in opts
    ? `${key}:${String(opts.n)}`
    : ((opts?.defaultValue as string | undefined) ?? key)) as TFunction;

describe('describeField', () => {
  it('décrit un champ de module dans une zone de page', () => {
    expect(describeField(t, 'config.zones.main[0].columns[1].block.config.alt')).toBe(
      'builder.zoneNames.main, builder.rowLabel:1, builder.columnLabel:2 — alt',
    );
  });

  it('décrit un bouton du header', () => {
    expect(
      describeField(t, 'config.rows[2].columns[0].block.config.buttons[1].target.pageId'),
    ).toBe('builder.rowLabel:3, builder.columnLabel:1 — buttons');
  });

  it('laisse les autres champs à leur traduction', () => {
    expect(describeField(t, 'username')).toBe('username');
  });
});
