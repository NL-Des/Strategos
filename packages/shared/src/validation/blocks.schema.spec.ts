import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AVAILABLE_BLOCK_TYPES } from '../pages/blocks.js';
import { BLOCK_CONFIG_SCHEMAS } from './blocks.schema.js';

describe('schémas des modules', () => {
  it('un schéma pour chaque module disponible, et seulement eux', () => {
    expect(Object.keys(BLOCK_CONFIG_SCHEMAS).sort()).toEqual([...AVAILABLE_BLOCK_TYPES].sort());
  });
});
