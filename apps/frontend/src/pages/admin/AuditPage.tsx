import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type ActorKind,
  type AuditEntry,
} from '@strategos/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listAudit } from '../../api/audit';
import { listUsers } from '../../api/users';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Pagination } from '../../components/Pagination';
import { describeChanges, targetLabel } from './audit-format';
import { EmptyState } from '../../components/EmptyState';

/** Début du jour local, en ISO ; `offsetDays = 1` donne le lendemain (borne exclue). */
function dayBoundary(date: string, offsetDays = 0): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d! + offsetDays).toISOString();
}

/** Admin › Journal : consultable et filtrable, jamais modifiable. */
export function AuditPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const users = useQuery({
    queryKey: ['admin', 'users', 'all'],
    queryFn: () => listUsers({ page: 1, pageSize: 200 }),
  });
  const actorFilter =
    actor === 'system' || actor === 'cli'
      ? { actorKind: actor as ActorKind }
      : actor
        ? { actorId: actor }
        : {};
  const filters = {
    ...actorFilter,
    action: action || undefined,
    targetType: targetType || undefined,
    from: dayBoundary(from),
    to: dayBoundary(to, 1),
  };
  const audit = useQuery({
    queryKey: ['admin', 'audit', page, filters],
    queryFn: () => listAudit({ page, ...filters }),
    placeholderData: keepPreviousData,
  });

  const filter =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };

  return (
    <section>
      <h1>{t('audit.title')}</h1>
      <p className="muted">{t('audit.intro')}</p>

      <div className="filters">
        <select
          aria-label={t('audit.actor')}
          value={actor}
          onChange={(e) => filter(setActor)(e.target.value)}
        >
          <option value="">{t('audit.allActors')}</option>
          <option value="system">{t('audit.actorKinds.system')}</option>
          <option value="cli">{t('audit.actorKinds.cli')}</option>
          {users.data?.items.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </select>
        <select
          aria-label={t('audit.action')}
          value={action}
          onChange={(e) => filter(setAction)(e.target.value)}
        >
          <option value="">{t('audit.allActions')}</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {t(`audit.actions.${a}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('audit.targetType')}
          value={targetType}
          onChange={(e) => filter(setTargetType)(e.target.value)}
        >
          <option value="">{t('audit.allTargetTypes')}</option>
          {AUDIT_TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`audit.targetTypes.${type}`)}
            </option>
          ))}
        </select>
        <label className="inline">
          {t('audit.from')}
          <input type="date" value={from} onChange={(e) => filter(setFrom)(e.target.value)} />
        </label>
        <label className="inline">
          {t('audit.to')}
          <input type="date" value={to} onChange={(e) => filter(setTo)(e.target.value)} />
        </label>
      </div>

      <ErrorMessage error={audit.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('audit.date')}</th>
              <th>{t('audit.actor')}</th>
              <th>{t('audit.action')}</th>
              <th>{t('audit.target')}</th>
              <th>{t('audit.changes')}</th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>
      {audit.data?.items.length === 0 && <EmptyState>{t('audit.empty')}</EmptyState>}
      {audit.data && (
        <Pagination
          page={page}
          total={audit.data.total}
          pageSize={audit.data.pageSize}
          onChange={setPage}
        />
      )}
    </section>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation();
  const changes = describeChanges(t, entry);
  return (
    <tr>
      <td>
        {/* Le journal garde les secondes : l'ordre exact des actions compte. */}
        {new Date(entry.createdAt).toLocaleString('fr-FR', {
          dateStyle: 'short',
          timeStyle: 'medium',
        })}
      </td>
      <td>
        {entry.actor?.username ?? t(`audit.actorKinds.${entry.actorKind}`)}
        {entry.ip && <small className="block">{entry.ip}</small>}
      </td>
      <td>{t(`audit.actions.${entry.action}`, { defaultValue: entry.action })}</td>
      <td>
        {t(`audit.targetTypes.${entry.targetType}`, { defaultValue: entry.targetType })}{' '}
        <strong>{targetLabel(entry)}</strong>
      </td>
      <td>
        {changes.length > 0 && (
          <ul className="changes">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}
