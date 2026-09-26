import { type ResourceRef, RIGHTS, type UserRights } from '@strategos/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/**
 * Droits effectifs d'un compte, ressource par ressource, avec pour chaque droit
 * les groupes qui l'accordent (04 — vue « par utilisateur », 05 — profil).
 */
export function RightsTable({
  rights,
  linkTo,
}: {
  rights: UserRights;
  linkTo: (resource: ResourceRef) => string;
}) {
  const { t } = useTranslation();
  if (rights.resources.length === 0) return <p className="muted">{t('rights.none')}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('rights.resource')}</th>
            <th>{t('rights.type')}</th>
            {RIGHTS.map((right) => (
              <th key={right}>{t(`rights.names.${right}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rights.resources.map(({ resource, rights: granted }) => (
            <tr key={`${resource.type}:${resource.id}`}>
              <td>
                <Link to={linkTo(resource)}>{resource.name}</Link>
              </td>
              <td>{t(`rights.resourceTypes.${resource.type}`)}</td>
              {RIGHTS.map((right) => (
                <td key={right}>
                  {granted[right].length > 0
                    ? t('rights.via', { groups: granted[right].map((g) => g.name).join(', ') })
                    : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
