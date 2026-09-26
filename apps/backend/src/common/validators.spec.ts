import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsNewPassword, IsUsername } from './validators.js';

class Dto {
  @IsUsername()
  username: string;

  @IsNewPassword()
  password: string;
}

function errors(input: object): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const e of validateSync(plainToInstance(Dto, input))) {
    result[e.property] = Object.keys(e.constraints ?? {});
  }
  return result;
}

describe('règles de pseudo et de mot de passe', () => {
  it('accepte un pseudo de 2 à 32 caractères et un mot de passe de 12 à 128', () => {
    expect(errors({ username: 'Kî', password: 'a'.repeat(12) })).toEqual({});
    expect(errors({ username: 'k'.repeat(32), password: 'a'.repeat(128) })).toEqual({});
  });

  it('refuse un mot de passe hors bornes', () => {
    expect(errors({ username: 'kira', password: 'a'.repeat(11) }).password).toContain('isLength');
    expect(errors({ username: 'kira', password: 'a'.repeat(129) }).password).toContain('isLength');
  });

  it('retire les espaces autour du pseudo, refuse les caractères de contrôle', () => {
    const dto = plainToInstance(Dto, { username: '  kira  ', password: 'a'.repeat(12) });
    expect(dto.username).toBe('kira');
    expect(errors({ username: ' k ', password: 'a'.repeat(12) }).username).toContain('isLength');
    expect(errors({ username: 'ki\nra', password: 'a'.repeat(12) }).username).toContain('matches');
  });
});
