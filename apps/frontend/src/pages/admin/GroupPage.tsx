import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  type GroupDetail,
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
import { listUsers } from '../../api/users';
import { ErrorMessage } from '../../components/ErrorMessage';

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
  const [notice, setNotice] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () => updateGroup(group.id, { name, description, version: group.version }),
    onSuccess: (g) => {
      onUpdated(g);
      setNotice(t('admin.group.saved'));
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
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
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
            onClick={() => {
              if (window.confirm(t('admin.group.deleteConfirm', { name: group.name }))) {
                remove.mutate();
              }
            }}
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
  const [selected, setSelected] = useState(() => new Set(group.members.map((m) => m.id)));
  const [q, setQ] = useState('');
  const users = useQuery({
    queryKey: ['admin', 'users', { page: 1, pageSize: 200, q }],
    queryFn: () => listUsers({ page: 1, pageSize: 200, q: q.trim() || undefined }),
  });
  const save = useMutation({
    mutationFn: () => replaceMembers(group.id, [...selected]),
    onSuccess: onUpdated,
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

/**
 * Permissions : une page n'accorde que la lecture (03). Les permissions sur les
 * espaces de discussion arrivent avec eux (étape 8) et sont conservées telles quelles.
 */
function PermissionsEditor({ group }: { group: GroupDetail }) {
  const { t } = useTranslation();
  const onUpdated = useOnGroupUpdated();
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  const [readable, setReadable] = useState(
    () =>
      new Set(
        group.permissions
          .filter((p) => p.resourceType === ResourceType.page && p.canRead)
          .map((p) => p.resourceId),
      ),
  );
  const save = useMutation({
    mutationFn: () =>
      replacePermissions(group.id, [
        ...group.permissions
          .filter((p) => p.resourceType !== ResourceType.page)
          .map(({ resourceName: _name, ...p }) => p),
        ...[...readable].map((resourceId) => ({
          resourceType: ResourceType.page,
          resourceId,
          canRead: true,
          canCreateTopic: false,
          canPost: false,
        })),
      ]),
    onSuccess: onUpdated,
  });
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
      <ErrorMessage error={pages.error ?? save.error} />
      <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
        {t('admin.group.savePermissions')}
      </button>
    </div>
  );
}
