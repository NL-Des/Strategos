import { IsBoolean, IsOptional } from 'class-validator';

/** Avertissements à confirmer (13) : même appel avec `"confirm": true`. */
export class ConfirmDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
