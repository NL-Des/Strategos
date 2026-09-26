import type { ValidationError } from '@nestjs/common';
import { toFieldErrors } from './validation.pipe.js';

describe('toFieldErrors', () => {
  it('liste les contraintes violées par champ, y compris imbriqué', () => {
    const errors: ValidationError[] = [
      { property: 'title', constraints: { isString: '', isNotEmpty: '' }, children: [] },
      {
        property: 'config',
        children: [{ property: 'color', constraints: { isHexColor: '' }, children: [] }],
      },
    ];
    expect(toFieldErrors(errors)).toEqual({
      title: ['isString', 'isNotEmpty'],
      'config.color': ['isHexColor'],
    });
  });
});
