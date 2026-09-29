// Stockage des métadonnées de class-transformer (`@Type`), sans déclaration
// propre dans le paquet : utilisé pour la spécification OpenAPI (openapi.ts).
declare module 'class-transformer/cjs/storage.js' {
  export { defaultMetadataStorage } from 'class-transformer/types/storage';
}
