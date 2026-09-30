import { RESOURCE_TYPES, type ResourceType, RIGHTS } from '@strategos/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { listGroups } from '../../api/groups';
import { getRightsMatrix } from '../../api/rights';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Pagination } from '../../components/Pagination';

/**
 * Admin › Droits : matrice globale utilisateurs × ressources (04), en lecture
 * seule, calculée par le backend avec la même fonction que `PermissionsGuard`.
 */
export function RightsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState('');
  const [type, setType] = useState<ResourceType | ''>('');
  const [user, setUser] = useState('');
  const groups = useQuery({ queryKey: ['admin', 'groups'], queryFn: listGroups });
  const matrix = useQuery({
    queryKey: ['admin', 'rights', 'matrix', { page, group, type, user }],
    queryFn: () =>
      getRightsMatrix({
        page,
        group: group || undefined,
        type: type || undefined,
        user: user.trim() || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const filter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };
  const letters = RIGHTS.map((right) => [right, t(`rights.letters.${right}`)] as const);

  return (
    <section>
      <h1>{t('rights.title')}</h1>
      <p className="muted">{t('rights.intro')}</p>
      <ul className="muted rights-legend">
        {letters.map(([right, l]) => (
          <li key={right}>
            {l} : {t(`rights.names.${right}`)}
          </li>
        ))}
      </ul>
      <div className="filters">
        <input
          type="search"
          placeholder={t('admin.users.search')}
          aria-label={t('admin.users.search')}
          value={user}
          onChange={(e) => filter(setUser)(e.target.value)}
        />
        <select
          aria-label={t('rights.group')}
          value={group}
          onChange={(e) => filter(setGroup)(e.target.value)}
        >
          <option value="">{t('rights.allGroups')}</option>
          {groups.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('rights.type')}
          value={type}
          onChange={(e) => filter(setType)(e.target.value as ResourceType | '')}
        >
          <option value="">{t('rights.allTypes')}</option>
          {RESOURCE_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {t(`rights.resourceTypes.${rt}`)}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage error={matrix.error} />
      {matrix.data && (
        <>
          <div className="table-wrap">
            <table className="rights-matrix">
              <thead>
                <tr>
                  <th>{t('fields.username')}</th>
                  {matrix.data.resources.map((r) => (
                    <th key={`${r.type}:${r.id}`} className="resource">
                      <Link to={`/admin/rights/${r.type}/${r.id}`}>{r.name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.data.users.items.map(({ user: u, cells }) => (
                  <tr key={u.id}>
                    <td>
                      <Link to={`/admin/users/${u.id}`}>{u.username}</Link>
                    </td>
                    {matrix.data.resources.map((r) => {
                      const cell = cells[`${r.type}:${r.id}`];
                      return (
                        <td key={`${r.type}:${r.id}`} className="cell">
                          {cell
                            ? letters
                                .filter(([right]) => cell[right])
                                .map(([, l]) => l)
                                .join('')
                            : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matrix.data.users.items.length === 0 && <p className="muted">{t('rights.noUsers')}</p>}
          <Pagination
            page={page}
            total={matrix.data.users.total}
            pageSize={matrix.data.users.pageSize}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}
