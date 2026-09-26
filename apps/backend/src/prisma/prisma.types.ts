import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';

/** Client utilisable dans ou hors d'une transaction. */
export type Db = PrismaService | Prisma.TransactionClient;

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
