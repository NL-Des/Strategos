import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  type GroupDetail,
  type GroupPermissionInput,
  ResourceType,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  deleteGroup,
  getGroup,
  replaceMembers,
  replacePermissions,
  updateGroup,
} from '../../api/groups';
import { listPages } from '../../api/pages';
import { getRightsMatrix } from '../../api/rights';
import { listUsers } from '../../api/users';
import { useConfirmed } from '../../components/Dialog';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useToast } from '../../components/Toast';

/** Fiche d'un groupe : nom, membres et permissions qu'il déclare (vue « par groupe »). */
export function GroupPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const group = useQuery({ queryKey: ['admin', 'group', id], queryFn: () => getGroup(id) });

  return (
    <section>
      <Link to="/admin/groups">{t('admin.groups.back')}</Link>
      <ErrorMessage error={group.error} />
      {group.data && <GroupDetails key={group.data.id} group={group.data} />}
    </section>
  );
}

function useOnGroupUpdated() {
  const queryClient = useQueryClient();
  return (group: GroupDetail) => {
    queryClient.setQueryData(['admin', 'group', group.id], group);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  };
}

function GroupDetails({ group }: { group: GroupDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onUpdated = useOnGroupUpdated();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const toast = useToast();
  const confirmed = useConfirmed();

  const update = useMutation({
    mutationFn: () => updateGroup(group.id, { name, description, version: group.version }),
    onSuccess: (g) => {
      onUpdated(g);
      toast(t('admin.group.saved'));
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteGroup(group.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] });
      void navigate('/admin/groups', { replace: true });
    },
  });

  return (
    <>
      <h1>{group.name}</h1>
      <form
        className="card form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          update.mutate();
        }}
      >
        <label>
          {t('fields.name')}
          <input
            required
            maxLength={GROUP_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t('fields.description')}
          <input
            maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <ErrorMessage error={update.error ?? remove.error} />
        <div className="actions">
          <button type="submit" disabled={update.isPending}>
            {t('common.save')}
          </button>
          <button
            type="button"
            className="danger"
            disabled={remove.isPending}
            onClick={() =>
              confirmed(
                {
                  title: t('admin.group.deleteConfirm', { name: group.name }),
                  confirmLabel: t('common.delete'),
                  danger: true,
                },
                () => remove.mutate(),
              )
            }
          >
            {t('admin.group.delete')}
          </button>
        </div>
      </form>
      <MembersEditor group={group} />
      <PermissionsEditor group={group} />
    </>
  );
}

/** Membres : cases à cocher sur les comptes, avec recherche. */
function MembersEditor({ group }: { group: GroupDetail }) {
  const { t } = useTranslation();
  const onUpdated = useOnGroupUpdated();
  const toast = useToast();
  const [selected, setSelected] = useState(() => new Set(group.members.map((m) => m.id)));
  const [q, setQ] = useState('');
  const users = useQuery({
    queryKey: ['admin', 'users', { page: 1, pageSize: 200, q }],
    queryFn: () => listUsers({ page: 1, pageSize: 200, q: q.trim() || undefined }),
  });
  const save = useMutation({
    mutationFn: () => replaceMembers(group.id, [...selected]),
    onSuccess: (g) => {
      onUpdated(g);
      toast(t('admin.group.membersSaved'));
    },
  });
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  return (
    <div className="card form">
      <h2>{t('admin.group.members', { n: selected.size })}</h2>
      <input
        type="search"
        placeholder={t('admin.users.search')}
        aria-label={t('admin.users.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="check-list">
        {users.data?.items
          .filter((u) => !u.isAdmin)
          .map((user) => (
            <label key={user.id} className="inline">
              <input
                type="checkbox"
                checked={selected.has(user.id)}
                onChange={(e) => toggle(user.id, e.target.checked)}
              />
              <Link to={`/admin/users/${user.id}`}>{user.username}</Link>
            </label>
          ))}
      </div>
      <ErrorMessage error={users.error ?? save.error} />
      <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
        {t('admin.group.saveMembers')}
      </button>
    </div>
  );
}

type SpaceRights = Pick<GroupPermissionInput, 'canRead' | 'canCreateTopic' | 'canPost'>;
const SPACE_RIGHTS = [
  ['canRead', 'read'],
  ['canCreateTopic', 'createTopic'],
  ['canPost', 'post'],
] as const;

/**
 * Permissions (03) : une page n'accorde que la lecture ; un espace de discussion,
 * la lecture, l'ouverture de sujets et la publication de messages. Ouvrir un
 * sujet ou poster suppose de lire l'espace.
 */
function PermissionsEditor({ group }: { group: GroupDetail }) {
  const { t } = useTranslation();
  const onUpdated = useOnGroupUpdated();
  const toast = useToast();
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  // Les espaces existent dès que leur page est publiée ; la matrice des droits les liste.
  const spaces = useQuery({
    queryKey: ['admin', 'rights', 'spaces'],
    queryFn: () => getRightsMatrix({ page: 1, pageSize: 1, type: ResourceType.space }),
  });
  const [readable, setReadable] = useState(
    () =>
      new Set(
        group.permissions
          .filter((p) => p.resourceType === ResourceType.page && p.canRead)
          .map((p) => p.resourceId),
      ),
  );
  const [spaceRights, setSpaceRights] = useState(
    () =>
      new Map<string, SpaceRights>(
        group.permissions
          .filter((p) => p.resourceType === ResourceType.space)
          .map(({ resourceId, canRead, canCreateTopic, canPost }) => [
            resourceId,
            { canRead, canCreateTopic, canPost },
          ]),
      ),
  );
  const save = useMutation({
    mutationFn: () =>
      replacePermissions(group.id, [
        ...[...readable].map((resourceId) => ({
          resourceType: ResourceType.page,
          resourceId,
          canRead: true,
          canCreateTopic: false,
          canPost: false,
        })),
        ...[...spaceRights]
          .filter(([, r]) => r.canRead || r.canCreateTopic || r.canPost)
          .map(([resourceId, rights]) => ({
            resourceType: ResourceType.space,
            resourceId,
            ...rights,
          })),
      ]),
    onSuccess: (g) => {
      onUpdated(g);
      toast(t('admin.group.permissionsSaved'));
    },
  });
  const setSpaceRight = (id: string, right: keyof SpaceRights, checked: boolean) => {
    const current = spaceRights.get(id) ?? {
      canRead: false,
      canCreateTopic: false,
      canPost: false,
    };
    const next =
      right === 'canRead' && !checked
        ? { canRead: false, canCreateTopic: false, canPost: false }
        : { ...current, [right]: checked, ...(checked ? { canRead: true } : {}) };
    setSpaceRights(new Map(spaceRights).set(id, next));
  };
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(readable);
    if (checked) next.add(id);
    else next.delete(id);
    setReadable(next);
  };

  return (
    <div className="card form">
      <h2>{t('admin.group.permissions')}</h2>
      <p className="muted">{t('admin.group.permissionsHint')}</p>
      <fieldset>
        <legend>{t('admin.group.readPages')}</legend>
        <div className="check-list">
          {pages.data?.map((page) => (
            <label key={page.id} className="inline">
              <input
                type="checkbox"
                checked={readable.has(page.id)}
                onChange={(e) => toggle(page.id, e.target.checked)}
              />
              {page.name}
              {!page.publishedAt && (
                <span className="badge muted">{t('builder.pages.neverPublished')}</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>
      {(spaces.data?.resources.length ?? 0) > 0 && (
        <fieldset>
          <legend>{t('admin.group.spaces')}</legend>
          {spaces.data!.resources.map((space) => (
            <div key={space.id} className="space-rights" role="group" aria-label={space.name}>
              <strong>{space.name}</strong>
              {SPACE_RIGHTS.map(([right, name]) => (
                <label key={right} className="inline">
                  <input
                    type="checkbox"
                    checked={spaceRights.get(space.id)?.[right] ?? false}
                    onChange={(e) => setSpaceRight(space.id, right, e.target.checked)}
                  />
                  {t(`rights.names.${name}`)}
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}
      <ErrorMessage error={pages.error ?? spaces.error ?? save.error} />
      <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
        {t('admin.group.savePermissions')}
      </button>
    </div>
  );
}
