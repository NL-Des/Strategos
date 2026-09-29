import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { defaultMetadataStorage } from 'class-transformer/cjs/storage.js';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';

type Schemas = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>;

const REF_PREFIX = '#/components/schemas/';

/** Noms des schémas visés par un `$ref`, à toute profondeur. */
function refsOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => refsOf(v, found));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (key === '$ref' && typeof v === 'string' && v.startsWith(REF_PREFIX)) {
        found.add(v.slice(REF_PREFIX.length));
      } else refsOf(v, found);
    }
  }
  return found;
}

/**
 * Les schémas de `@strategos/shared/validation` sont compilés sans le plugin
 * `@nestjs/swagger` : leurs propriétés sont reconstruites depuis les décorateurs
 * `class-validator`, avec les schémas qu'ils visent à leur tour.
 */
function completeSharedSchemas(schemas: Schemas): void {
  const fromValidators = validationMetadatasToSchemas({
    refPointerPrefix: REF_PREFIX,
    classTransformerMetadataStorage: defaultMetadataStorage,
  }) as Schemas;
  const isEmpty = (name: string) => {
    const schema = schemas[name] as { properties?: object } | undefined;
    return !schema || !schema.properties || Object.keys(schema.properties).length === 0;
  };
  let pending = [...refsOf(schemas)].filter((name) => isEmpty(name) && fromValidators[name]);
  while (pending.length > 0) {
    for (const name of pending) schemas[name] = fromValidators[name]!;
    pending = [...refsOf(pending.map((name) => schemas[name]))].filter(
      (name) => isEmpty(name) && fromValidators[name],
    );
  }
}

/**
 * Spécification OpenAPI générée depuis le code : routes et paramètres lus sur
 * les contrôleurs, corps de requête tirés des DTO `class-validator` (plugin
 * `@nestjs/swagger` du build). La conception de référence reste 13 — API.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Strategos')
    .setDescription(
      'API de Strategos (`/api/v1`). Session par cookie `strategos_session` ; toute requête ' +
        'qui modifie des données envoie le jeton de `GET /auth/csrf` dans `X-CSRF-Token`. ' +
        'Erreurs : `{ code, message, details }`. Référence : references/conception/13-api.md.',
    )
    .setVersion('1')
    .addCookieAuth('strategos_session')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) =>
      `${controller.replace(/Controller$/, '')}_${method}`,
  });
  completeSharedSchemas(((document.components ??= {}).schemas ??= {}));
  return document;
}
