import { GROUP_DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH } from '@strategos/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { createGroup, listGroups } from '../../api/groups';
import { ErrorMessage } from '../../components/ErrorMessage';

/** Admin › Groupes : liste et création (03 — Gestion des groupes). */
export function GroupsPage() {
  const { t } = useTranslation();
  const groups = useQuery({ queryKey: ['admin', 'groups'], queryFn: listGroups });

  return (
    <section>
      <h1>{t('admin.groups.title')}</h1>
      <p className="muted">{t('admin.groups.intro')}</p>
      <CreateGroupForm />
      <ErrorMessage error={groups.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('fields.name')}</th>
              <th>{t('fields.description')}</th>
              <th>{t('admin.groups.members')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.data?.map((group) => (
              <tr key={group.id}>
                <td>
                  <Link to={`/admin/groups/${group.id}`}>{group.name}</Link>
                </td>
                <td>{group.description ?? ''}</td>
                <td>{group.memberCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groups.data?.length === 0 && <p className="muted">{t('admin.groups.empty')}</p>}
    </section>
  );
}

function CreateGroupForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const mutation = useMutation({
    mutationFn: () => createGroup({ name, description }),
    onSuccess: (group) => void navigate(`/admin/groups/${group.id}`),
  });

  return (
    <form
      className="card form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2>{t('admin.groups.create')}</h2>
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
      <ErrorMessage error={mutation.error} />
      <button type="submit" disabled={mutation.isPending}>
        {t('admin.groups.createSubmit')}
      </button>
    </form>
  );
}
