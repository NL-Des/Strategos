import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listGroups } from '../api/groups';

/**
 * Aperçu avec les droits d'un groupe (06) : « Administrateur » montre tout ; un
 * groupe montre le brouillon tel que le verrait un membre de ce seul groupe.
 */
export function PreviewGroupSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (groupId: string) => void;
}) {
  const { t } = useTranslation();
  const groups = useQuery({ queryKey: ['admin', 'groups'], queryFn: listGroups });
  return (
    <label className="inline">
      {t('builder.previewAs')}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('builder.previewAsAdmin')}</option>
        {groups.data?.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
