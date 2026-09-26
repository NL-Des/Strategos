import { RESOURCE_TYPES, type ResourceType, RIGHTS } from '@strategos/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { getResourceRights } from '../../api/rights';
import { ErrorMessage } from '../../components/ErrorMessage';

/** Vue « par ressource » (04) : qui peut lire, ouvrir un sujet ou poster, et via quel groupe. */
export function ResourceRightsPage() {
  const { t } = useTranslation();
  const { type = '', id = '' } = useParams();
  const valid = (RESOURCE_TYPES as readonly string[]).includes(type);
  const rights = useQuery({
    queryKey: ['admin', 'rights', type, id],
    queryFn: () => getResourceRights(type as ResourceType, id),
    enabled: valid,
  });
  if (!valid) return <p>{t('errors.NOT_FOUND')}</p>;

  return (
    <section>
      <Link to="/admin/rights">{t('rights.back')}</Link>
      <ErrorMessage error={rights.error} />
      {rights.data && (
        <>
          <h1>
            {t('rights.resourceTitle', {
              type: t(`rights.resourceTypes.${rights.data.resource.type}`),
              name: rights.data.resource.name,
            })}
          </h1>
          {rights.data.resource.type === 'page' && (
            <p>
              <Link to={`/admin/pages/${rights.data.resource.id}`}>{t('rights.openEditor')}</Link>
            </p>
          )}

          <h2>{t('rights.declaringGroups')}</h2>
          {rights.data.groups.length === 0 ? (
            <p className="muted">{t('rights.adminOnly')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('rights.group')}</th>
                    {RIGHTS.map((right) => (
                      <th key={right}>{t(`rights.names.${right}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rights.data.groups.map(({ group, permission }) => (
                    <tr key={group.id}>
                      <td>
                        <Link to={`/admin/groups/${group.id}`}>{group.name}</Link>
                      </td>
                      {RIGHTS.map((right) => (
                        <td key={right}>{permission[right] ? t('common.yes') : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>{t('rights.users')}</h2>
          {rights.data.users.length === 0 ? (
            <p className="muted">{t('rights.noUsers')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('fields.username')}</th>
                    {RIGHTS.map((right) => (
                      <th key={right}>{t(`rights.names.${right}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rights.data.users.map(({ user, rights: granted }) => (
                    <tr key={user.id}>
                      <td>
                        <Link to={`/admin/users/${user.id}`}>{user.username}</Link>
                      </td>
                      {RIGHTS.map((right) => (
                        <td key={right}>
                          {granted[right].length > 0
                            ? t('rights.via', {
                                groups: granted[right].map((g) => g.name).join(', '),
                              })
                            : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
