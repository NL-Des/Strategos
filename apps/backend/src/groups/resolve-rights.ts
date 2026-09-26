import { type EffectiveRights, type GroupRef, ResourceType } from '@strategos/shared';

/** Ligne de `group_permissions` utile au calcul. */
export interface PermissionRow {
  groupId: string;
  pageId: string | null;
  spaceId: string | null;
  canRead: boolean;
  canCreateTopic: boolean;
  canPost: boolean;
}

export function resourceKey(type: ResourceType, id: string): string {
  return `${type}:${id}`;
}

export function permissionKey(row: PermissionRow): string {
  return row.pageId
    ? resourceKey(ResourceType.page, row.pageId)
    : resourceKey(ResourceType.space, row.spaceId!);
}

export function hasAnyRight(rights: EffectiveRights): boolean {
  return rights.read.length > 0 || rights.createTopic.length > 0 || rights.post.length > 0;
}

/**
 * **La** règle de calcul des droits effectifs (03 — Calcul des droits effectifs) :
 * union simple des permissions des groupes du sujet, avec pour chaque droit les
 * groupes qui l'accordent, dans l'ordre de `groups`. Seules comptent les
 * permissions des groupes fournis : un groupe supprimé, ou dont le sujet n'est
 * pas membre, n'accorde rien. Sans groupe, aucun droit.
 */
export function resolveRights(
  groups: GroupRef[],
  permissions: PermissionRow[],
): Map<string, EffectiveRights> {
  const byGroup = new Map<string, PermissionRow[]>();
  for (const row of permissions) {
    byGroup.set(row.groupId, [...(byGroup.get(row.groupId) ?? []), row]);
  }
  const result = new Map<string, EffectiveRights>();
  for (const group of groups) {
    for (const row of byGroup.get(group.id) ?? []) {
      const key = permissionKey(row);
      const rights = result.get(key) ?? { read: [], createTopic: [], post: [] };
      const ref = { id: group.id, name: group.name };
      if (row.canRead) rights.read.push(ref);
      if (row.canCreateTopic) rights.createTopic.push(ref);
      if (row.canPost) rights.post.push(ref);
      result.set(key, rights);
    }
  }
  for (const [key, rights] of result) if (!hasAnyRight(rights)) result.delete(key);
  return result;
}
