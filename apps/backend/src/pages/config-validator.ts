import { HttpStatus } from '@nestjs/common';
import {
  AVAILABLE_BLOCK_TYPES,
  type AvailableBlockType,
  BLOCK_TYPES,
  type Block,
  type BlockType,
  ErrorCode,
  LAYOUT_FORBIDDEN_BLOCK_TYPES,
  type LayoutConfig,
  type PageConfig,
  ROW_LAYOUTS,
  type Row,
} from '@strategos/shared';
import { BLOCK_CONFIG_SCHEMAS } from '@strategos/shared/validation';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { AppException } from '../common/app-exception.js';
import { sanitizeRichHtml } from '../common/html-sanitizer.js';
import { toFieldErrors } from '../common/validation.pipe.js';

const MAX_ROWS_PER_ZONE = 100;

type Fields = Record<string, string[]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valide et normalise une structure de zones (06 — Points techniques). Les erreurs
 * sont collectées par chemin (`zones.main[0].columns[1].block.config.alt`).
 */
class StructureValidator {
  readonly fields: Fields = {};
  readonly forbiddenBlockIds: string[] = [];
  private readonly ids = new Set<string>();

  constructor(private readonly forbidden: readonly BlockType[] = []) {}

  fail(path: string, constraint: string): void {
    (this.fields[path] ??= []).push(constraint);
  }

  private uniqueId(path: string, id: unknown): string | null {
    if (typeof id !== 'string' || !isUUID(id)) {
      this.fail(path, 'isUuid');
      return null;
    }
    if (this.ids.has(id)) this.fail(path, 'duplicateId');
    this.ids.add(id);
    return id;
  }

  rows(path: string, value: unknown): Row[] {
    if (!Array.isArray(value)) {
      this.fail(path, 'isArray');
      return [];
    }
    if (value.length > MAX_ROWS_PER_ZONE) this.fail(path, 'arrayMaxSize');
    return value.map((row, i) => this.row(`${path}[${i}]`, row));
  }

  private row(path: string, value: unknown): Row {
    if (!isRecord(value) || !Array.isArray(value.columns)) {
      this.fail(path, 'isRow');
      return { id: '', columns: [] };
    }
    const id = this.uniqueId(`${path}.id`, value.id) ?? '';
    const columns: unknown[] = value.columns;
    const widths = columns.map((c) => (isRecord(c) ? c.width : undefined));
    if (
      !ROW_LAYOUTS.some((l) => l.length === widths.length && l.every((w, i) => w === widths[i]))
    ) {
      this.fail(`${path}.columns`, 'rowLayout');
    }
    return {
      id,
      columns: columns.map((column, i) => ({
        width: widths[i] as Row['columns'][number]['width'],
        block: isRecord(column) ? this.block(`${path}.columns[${i}].block`, column.block) : null,
      })),
    };
  }

  private block(path: string, value: unknown): Block | null {
    if (value === null || value === undefined) return null;
    if (!isRecord(value)) {
      this.fail(path, 'isBlock');
      return null;
    }
    const id = this.uniqueId(`${path}.id`, value.id) ?? '';
    const type = value.type as BlockType;
    if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
      this.fail(`${path}.type`, 'isIn');
      return null;
    }
    if (this.forbidden.includes(type)) {
      this.forbiddenBlockIds.push(id);
      return null;
    }
    if (!(AVAILABLE_BLOCK_TYPES as readonly string[]).includes(type)) {
      this.fail(`${path}.type`, 'notAvailable');
      return null;
    }
    const config = this.config(`${path}.config`, type as AvailableBlockType, value.config);
    return { id, type, config } as Block;
  }

  private config(path: string, type: AvailableBlockType, value: unknown): Block['config'] {
    if (!isRecord(value)) {
      this.fail(path, 'isObject');
      return value as Block['config'];
    }
    const instance = plainToInstance(BLOCK_CONFIG_SCHEMAS[type] as new () => object, value);
    const errors = validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
    for (const [field, constraints] of Object.entries(toFieldErrors(errors, path))) {
      for (const c of constraints) this.fail(field, c);
    }
    // JSON pur : pas d'instances de classes dans la base.
    const config = JSON.parse(JSON.stringify(instance)) as Block['config'];
    if (type === 'rich_content') {
      const rich = config as { html: string };
      rich.html = sanitizeRichHtml(rich.html);
    }
    return config;
  }

  throwIfInvalid(): void {
    if (this.forbiddenBlockIds.length > 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.BLOCK_NOT_ALLOWED_IN_LAYOUT,
        { blockIds: this.forbiddenBlockIds },
      );
    }
    if (Object.keys(this.fields).length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: this.fields,
      });
    }
  }
}

/** Brouillon d'une page : zones Main et Sidebar (ou `null`), thème, header et footer affichés. */
export function validatePageConfig(value: unknown): PageConfig {
  const v = new StructureValidator();
  if (!isRecord(value) || !isRecord(value.zones)) {
    v.fail('config', 'isPageConfig');
    v.throwIfInvalid();
  }
  const raw = value as Record<string, unknown>;
  const zones = raw.zones as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!['zones', 'themeId', 'showHeader', 'showFooter'].includes(key)) {
      v.fail(`config.${key}`, 'whitelistValidation');
    }
  }
  for (const key of Object.keys(zones)) {
    if (!['main', 'sidebar'].includes(key)) v.fail(`config.zones.${key}`, 'whitelistValidation');
  }
  const zone = (name: 'main' | 'sidebar') =>
    zones[name] === null || zones[name] === undefined
      ? null
      : v.rows(`config.zones.${name}`, zones[name]);
  const config: PageConfig = {
    zones: { main: zone('main'), sidebar: zone('sidebar') },
    themeId: raw.themeId === null || raw.themeId === undefined ? null : String(raw.themeId),
    showHeader: raw.showHeader !== false,
    showFooter: raw.showFooter !== false,
  };
  if (config.themeId !== null && !isUUID(config.themeId)) v.fail('config.themeId', 'isUuid');
  for (const key of ['showHeader', 'showFooter'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'boolean')
      v.fail(`config.${key}`, 'isBoolean');
  }
  v.throwIfInvalid();
  return config;
}

/** Brouillon du header ou du footer : formulaires, espaces et chats refusés (`422`). */
export function validateLayoutConfig(value: unknown): LayoutConfig {
  const v = new StructureValidator(LAYOUT_FORBIDDEN_BLOCK_TYPES);
  if (!isRecord(value)) {
    v.fail('config', 'isLayoutConfig');
    v.throwIfInvalid();
  }
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (key !== 'rows') v.fail(`config.${key}`, 'whitelistValidation');
  }
  const config: LayoutConfig = { rows: v.rows('config.rows', raw.rows) };
  v.throwIfInvalid();
  return config;
}

/** Nombre de modules d'une structure (résumé du journal). */
export function countBlocks(rows: (Row[] | null)[]): number {
  return rows
    .flatMap((zone) => zone ?? [])
    .flatMap((row) => row.columns)
    .filter((column) => column.block !== null).length;
}
