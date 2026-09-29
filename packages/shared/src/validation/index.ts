// Schémas class-validator des contrats partagés : réservés au backend (ils
// nécessitent `reflect-metadata`). Le frontend importe `@strategos/shared`.
export * from './blocks.schema.js';
export * from './links.schema.js';
export * from './groups.schema.js';
export * from './forms.schema.js';
export * from './themes.schema.js';
