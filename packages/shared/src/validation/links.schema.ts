import { IsIn, IsUrl, IsUUID, ValidateIf } from 'class-validator';
import type { LinkKind, LinkTarget } from '../pages/links.js';

export class LinkTargetSchema implements LinkTarget {
  @IsIn(['page', 'url', 'personal_page'])
  kind: LinkKind;

  @ValidateIf((o: LinkTarget) => o.kind === 'page')
  @IsUUID()
  pageId?: string;

  @ValidateIf((o: LinkTarget) => o.kind === 'url')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;
}
