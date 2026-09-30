import {
  type PageConfig,
  SubmissionStatus,
  type SubmissionQueueItem,
  type SubmissionValue,
  type SubmissionValues,
  type Warning,
} from '@strategos/shared';
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiRequestError } from '../../api/client';
import {
  getAdminForm,
  listSubmissions,
  modifySubmission,
  type QueueFilters,
  rejectSubmission,
  validateSubmission,
} from '../../api/forms';
import { getAdminPage, listPages } from '../../api/pages';
import { listUsers } from '../../api/users';
import { Warnings } from '../../builder/FormEditor';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Pagination } from '../../components/Pagination';

const show = (value: SubmissionValue | undefined) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'boolean'
      ? value
        ? '✓'
        : '✗'
      : String(value);

/** Mouvement signé : « +3 », « −1 ». */
const signed = (value: SubmissionValue) =>
  typeof value === 'number' ? (value > 0 ? `+${value}` : `−${Math.abs(value)}`) : show(value);

/** Identifiants des formulaires placés dans une configuration de page. */
function formIdsOf(config: PageConfig | null): string[] {
  if (!config) return [];
  return [...(config.zones.main ?? []), ...(config.zones.sidebar ?? [])].flatMap((row) =>
    row.columns.flatMap((c) => (c.block?.type === 'form' ? [c.block.config.formId] : [])),
  );
}

/**
 * Tableau de bord des soumissions (04) : file triable et filtrable, cellules
 * visées avec leur valeur actuelle, conflits mis en évidence.
 */
export function SubmissionsPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<QueueFilters>({
    status: SubmissionStatus.pending,
    sort: 'createdAt:asc',
  });
  const [page, setPage] = useState(1);
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  // Formulaires de la page filtrée (brouillon et version publiée), pour le filtre « Formulaire ».
  const filteredPage = useQuery({
    queryKey: ['admin', 'page', filters.pageId],
    queryFn: () => getAdminPage(filters.pageId!),
    enabled: !!filters.pageId,
  });
  const formIds = filteredPage.data
    ? [
        ...new Set([
          ...formIdsOf(filteredPage.data.draft),
          ...formIdsOf(filteredPage.data.published),
        ]),
      ]
    : [];
  const forms = useQueries({
    queries: formIds.map((id) => ({
      queryKey: ['admin', 'form', id],
      queryFn: () => getAdminForm(id),
    })),
  });
  // Recherche d'un utilisateur par pseudo : les suggestions viennent de `/admin/users?q=`.
  // La file n'est filtrée que lorsque le pseudo saisi correspond exactement à un compte.
  const [userQuery, setUserQuery] = useState('');
  const users = useQuery({
    queryKey: ['admin', 'users', 'search', userQuery],
    queryFn: () => listUsers({ page: 1, pageSize: 10, q: userQuery }),
    enabled: userQuery.trim().length > 0,
    placeholderData: keepPreviousData,
  });
  const userId = userQuery.trim()
    ? users.data?.items.find((u) => u.username.toLowerCase() === userQuery.trim().toLowerCase())?.id
    : undefined;
  const query = { ...filters, userId };
  const queue = useQuery({
    queryKey: ['admin', 'submissions', query, page],
    queryFn: () => listSubmissions(query, page),
    placeholderData: keepPreviousData,
  });
  const set = (patch: Partial<QueueFilters>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
  };
  const searchUser = (username: string) => {
    setUserQuery(username);
    setPage(1);
  };
  const conflicting = new Set(queue.data?.items.flatMap((i) => i.conflicts) ?? []);

  return (
    <section>
      <h1>{t('submissions.admin.title')}</h1>
      <p className="muted">{t('submissions.admin.intro')}</p>
      <div className="card form inline-fields">
        <label>
          {t('submissions.admin.status')}
          <select
            value={filters.status ?? ''}
            onChange={(e) => set({ status: e.target.value as QueueFilters['status'] })}
          >
            <option value="">{t('submissions.admin.all')}</option>
            {Object.values(SubmissionStatus).map((s) => (
              <option key={s} value={s}>
                {t(`submissions.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('submissions.admin.page')}
          <select
            value={filters.pageId ?? ''}
            onChange={(e) => set({ pageId: e.target.value, formId: undefined })}
          >
            <option value="">{t('submissions.admin.all')}</option>
            {pages.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('submissions.admin.form')}
          <select
            value={filters.formId ?? ''}
            disabled={!filters.pageId}
            onChange={(e) => set({ formId: e.target.value || undefined })}
          >
            <option value="">
              {filters.pageId ? t('submissions.admin.all') : t('submissions.admin.formNone')}
            </option>
            {forms.map(({ data: form }) =>
              form ? (
                <option key={form.id} value={form.id}>
                  {(form.published ?? form.draft).title || t('submissions.admin.untitledForm')}
                </option>
              ) : null,
            )}
          </select>
        </label>
        <label>
          {t('submissions.admin.user')}
          <input
            type="search"
            list="submission-users"
            placeholder={t('submissions.admin.userSearch')}
            value={userQuery}
            onChange={(e) => searchUser(e.target.value)}
          />
          <datalist id="submission-users">
            {users.data?.items.map((u) => (
              <option key={u.id} value={u.username} />
            ))}
          </datalist>
        </label>
        <label>
          {t('submissions.admin.from')}
          <input
            type="date"
            value={filters.from?.slice(0, 10) ?? ''}
            onChange={(e) =>
              set({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })
            }
          />
        </label>
        <label>
          {t('submissions.admin.to')}
          <input
            type="date"
            value={filters.to?.slice(0, 10) ?? ''}
            onChange={(e) =>
              set({
                to: e.target.value
                  ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString()
                  : undefined,
              })
            }
          />
        </label>
        <label>
          {t('submissions.admin.sort')}
          <select
            value={filters.sort}
            onChange={(e) => set({ sort: e.target.value as QueueFilters['sort'] })}
          >
            <option value="createdAt:asc">{t('submissions.admin.oldest')}</option>
            <option value="createdAt:desc">{t('submissions.admin.newest')}</option>
          </select>
        </label>
      </div>
      <ErrorMessage error={queue.error} />
      {queue.data?.items.map((item) => (
        <QueueItem
          key={item.submission.id}
          item={item}
          inConflict={item.conflicts.length > 0 || conflicting.has(item.submission.id)}
          filterByUser={() => searchUser(item.user.username)}
        />
      ))}
      {userId && (
        <button type="button" className="secondary" onClick={() => searchUser('')}>
          {t('submissions.admin.allUsers')}
        </button>
      )}
      {queue.data?.total === 0 && <p className="muted">{t('submissions.admin.empty')}</p>}
      {queue.data && queue.data.total > queue.data.pageSize && (
        <Pagination
          page={page}
          total={queue.data.total}
          pageSize={queue.data.pageSize}
          onChange={setPage}
        />
      )}
    </section>
  );
}

type Action = { kind: 'validate' } | { kind: 'modify'; values: SubmissionValues };

function QueueItem({
  item,
  inConflict,
  filterByUser,
}: {
  item: SubmissionQueueItem;
  inConflict: boolean;
  filterByUser: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { submission, user, form, targets } = item;
  const [editing, setEditing] = useState<Record<string, string | boolean> | null>(null);
  const [toConfirm, setToConfirm] = useState<{ action: Action; warnings: Warning[] } | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'submissions'] });
    void queryClient.invalidateQueries({ queryKey: ['rows'] });
  };
  const decide = useMutation({
    mutationFn: ({ action, confirm }: { action: Action; confirm: boolean }) =>
      action.kind === 'validate'
        ? validateSubmission(submission.id, confirm)
        : modifySubmission(submission.id, action.values, confirm),
    onSuccess: () => {
      setToConfirm(null);
      setEditing(null);
      refresh();
    },
    onError: (error, { action }) => {
      if (error instanceof ApiRequestError && error.code === 'CONFIRMATION_REQUIRED') {
        setToConfirm({ action, warnings: (error.error.details.warnings ?? []) as Warning[] });
      }
    },
  });
  const reject = useMutation({
    mutationFn: (reason: string) => rejectSubmission(submission.id, reason),
    onSuccess: refresh,
  });
  const pending = submission.status === 'pending';
  const error =
    decide.error instanceof ApiRequestError && decide.error.code === 'CONFIRMATION_REQUIRED'
      ? null
      : (decide.error ?? reject.error);

  const modifiedValues = (): SubmissionValues =>
    Object.fromEntries(
      Object.entries(editing ?? {}).map(([key, v]) => [
        key,
        typeof v === 'boolean' ? v : v.trim() === '' ? null : v.trim(),
      ]),
    );

  return (
    <article className={`card submission-item${inConflict && pending ? ' conflict' : ''}`}>
      <header className="submission-header">
        <strong>{form.title}</strong>
        <span className={`status status-${submission.status}`}>
          {t(`submissions.status.${submission.status}`)}
        </span>
        <span className="muted">
          <button type="button" className="link" onClick={filterByUser}>
            {user.username}
          </button>{' '}
          · {new Date(submission.submittedAt).toLocaleString('fr-FR')} ·{' '}
          <Link to={`/admin/pages/${form.pageId}`}>{t('submissions.admin.openPage')}</Link>
        </span>
      </header>
      {submission.rowKey && <p>{t('submissions.admin.rowKey', { key: submission.rowKey })}</p>}
      {inConflict && pending && (
        <p className="notice warning">
          {t('submissions.admin.conflict', { count: Math.max(item.conflicts.length, 1) })}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('submissions.admin.field')}</th>
              <th>{t('submissions.admin.cell')}</th>
              <th>{pending ? t('submissions.admin.current') : t('submissions.admin.written')}</th>
              <th>{t('submissions.admin.proposed')}</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((target) => (
              <tr key={target.field}>
                <td>{target.field}</td>
                <td>
                  {target.cell
                    ? `${target.sheet}!${target.cell}`
                    : form.mode === 'ajout'
                      ? t('submissions.admin.rowAtValidation')
                      : '—'}
                  {target.error && (
                    <small className="field-error"> {t(`errors.${target.error}`)}</small>
                  )}
                </td>
                <td>{target.currentValue ?? '—'}</td>
                <td>
                  {editing && target.field in editing ? (
                    typeof editing[target.field] === 'boolean' ? (
                      <input
                        type="checkbox"
                        aria-label={target.field}
                        checked={editing[target.field] === true}
                        onChange={(e) =>
                          setEditing({ ...editing, [target.field]: e.target.checked })
                        }
                      />
                    ) : (
                      <input
                        aria-label={target.field}
                        value={editing[target.field] as string}
                        onChange={(e) => setEditing({ ...editing, [target.field]: e.target.value })}
                      />
                    )
                  ) : target.movement ? (
                    signed(target.proposed)
                  ) : (
                    show(target.proposed)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {submission.reason && (
        <p className="muted">
          {t('submissions.reason', {
            reason: t(`submissions.reasons.${submission.reason}`, {
              defaultValue: submission.reason,
            }),
          })}
        </p>
      )}
      <Warnings warnings={item.warnings} />
      {toConfirm && (
        <div className="card warning" role="alertdialog">
          <Warnings warnings={toConfirm.warnings} />
          <div className="actions">
            <button
              type="button"
              onClick={() => decide.mutate({ action: toConfirm.action, confirm: true })}
            >
              {t('submissions.admin.validateAnyway')}
            </button>
            <button type="button" className="secondary" onClick={() => setToConfirm(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <ErrorMessage error={error} />
      {pending && (
        <div className="actions">
          {editing ? (
            <>
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    action: { kind: 'modify', values: modifiedValues() },
                    confirm: false,
                  })
                }
              >
                {t('submissions.admin.validateModified')}
              </button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ action: { kind: 'validate' }, confirm: false })}
              >
                {t('submissions.admin.validate')}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setEditing(
                    Object.fromEntries(
                      Object.entries(submission.values).map(([key, v]) => [
                        key,
                        typeof v === 'boolean' ? v : v === null ? '' : String(v),
                      ]),
                    ),
                  )
                }
              >
                {t('submissions.admin.modify')}
              </button>
              <button
                type="button"
                className="danger"
                disabled={reject.isPending}
                onClick={() => {
                  const reason = window.prompt(t('submissions.admin.rejectReason'));
                  if (reason !== null) reject.mutate(reason);
                }}
              >
                {t('submissions.admin.reject')}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
