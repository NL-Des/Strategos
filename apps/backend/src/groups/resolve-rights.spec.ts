import { type PermissionRow, resolveRights, resourceKey } from './resolve-rights.js';

const common = { id: 'g-common', name: 'Partie commune' };
const members = { id: 'g-members', name: 'Membres' };

const onPage = (groupId: string, pageId: string, canRead = true): PermissionRow => ({
  groupId,
  pageId,
  spaceId: null,
  canRead,
  canCreateTopic: false,
  canPost: false,
});

const onSpace = (groupId: string, spaceId: string, rights: Partial<PermissionRow>) => ({
  groupId,
  pageId: null,
  spaceId,
  canRead: true,
  canCreateTopic: false,
  canPost: false,
  ...rights,
});

describe('resolveRights', () => {
  it('sans groupe, aucun droit', () => {
    expect(resolveRights([], [onPage(common.id, 'p1')]).size).toBe(0);
  });

  it('fait l’union des groupes et nomme ceux qui accordent chaque droit', () => {
    const rights = resolveRights(
      [common, members],
      [
        onPage(common.id, 'home'),
        onPage(members.id, 'home'),
        onPage(members.id, 'tournoi'),
        onSpace(common.id, 's1', {}),
        onSpace(members.id, 's1', { canCreateTopic: true, canPost: true }),
      ],
    );
    expect(rights.get(resourceKey('page', 'home'))).toEqual({
      read: [common, members],
      createTopic: [],
      post: [],
    });
    expect(rights.get(resourceKey('page', 'tournoi'))?.read).toEqual([members]);
    expect(rights.get(resourceKey('space', 's1'))).toEqual({
      read: [common, members],
      createTopic: [members],
      post: [members],
    });
  });

  it('ignore les permissions des groupes absents (supprimés ou dont le sujet n’est pas membre)', () => {
    const rights = resolveRights([common], [onPage(members.id, 'tournoi')]);
    expect(rights.has(resourceKey('page', 'tournoi'))).toBe(false);
  });

  it('ne garde pas une ressource sans aucun droit', () => {
    expect(resolveRights([common], [onPage(common.id, 'p1', false)]).size).toBe(0);
  });

  it('suit l’ordre des groupes fournis', () => {
    const rights = resolveRights(
      [members, common],
      [onPage(common.id, 'home'), onPage(members.id, 'home')],
    );
    expect(rights.get(resourceKey('page', 'home'))?.read).toEqual([members, common]);
  });
});
