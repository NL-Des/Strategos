import {
  BULK_VALIDATE_MAX,
  type BulkValidateResult,
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
  validateSubmissions,
} from '../../api/forms';
import { getAdminPage, listPages } from '../../api/pages';
import { listUsers } from '../../api/users';
import { Warnings } from '../../builder/FormEditor';
import { Modal, useConfirm, usePrompt } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { formatDateTime } from '../../format';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Notice } from '../../components/Notice';
import { Pagination } from '../../components/Pagination';
import { useToast } from '../../components/Toast';

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
  // Sélection pour la validation groupée : propre à la page affichée de la file.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [report, setReport] = useState<BulkReport | null>(null);
  const changePage = (next: number) => {
    setPage(next);
    setSelected(new Set());
  };
  const set = (patch: Partial<QueueFilters>) => {
    setFilters({ ...filters, ...patch });
    changePage(1);
  };
  const searchUser = (username: string) => {
    setUserQuery(username);
    changePage(1);
  };
  const conflicting = new Set(queue.data?.items.flatMap((i) => i.conflicts) ?? []);
  const inConflict = (item: SubmissionQueueItem) =>
    item.conflicts.length > 0 || conflicting.has(item.submission.id);
  const pendingItems = (queue.data?.items ?? []).filter((i) => i.submission.status === 'pending');
  const checked = pendingItems.filter((i) => selected.has(i.submission.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

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
      {pendingItems.length > 0 && (
        <BulkBar
          checked={checked}
          onSelectAll={() =>
            // Les soumissions en conflit se cochent à la main : leur ordre de validation compte.
            setSelected(
              new Set(pendingItems.filter((i) => !inConflict(i)).map((i) => i.submission.id)),
            )
          }
          onClear={() => setSelected(new Set())}
          onReport={setReport}
        />
      )}
      {report && <BulkReportNotice report={report} onClose={() => setReport(null)} />}
      {queue.data?.items.map((item) => (
        <QueueItem
          key={item.submission.id}
          item={item}
          inConflict={inConflict(item)}
          filterByUser={() => searchUser(item.user.username)}
          selected={selected.has(item.submission.id)}
          onSelect={(on) => toggle(item.submission.id, on)}
        />
      ))}
      {userId && (
        <button type="button" className="secondary" onClick={() => searchUser('')}>
          {t('submissions.admin.allUsers')}
        </button>
      )}
      {queue.data?.total === 0 && <EmptyState>{t('submissions.admin.empty')}</EmptyState>}
      {queue.data && queue.data.total > queue.data.pageSize && (
        <Pagination
          page={page}
          total={queue.data.total}
          pageSize={queue.data.pageSize}
          onChange={changePage}
        />
      )}
    </section>
  );
}

/** Bilan d'une validation groupée, avec le libellé des soumissions au moment de l'envoi. */
type BulkReport = {
  validated: number;
  /** Restées en attente : `code` d'erreur, ou `null` si l'écrasement d'une formule n'a pas été confirmé. */
  pending: { id: string; label: string; code: string | null }[];
};

const labelOf = (item: SubmissionQueueItem) => `${item.form.title} — ${item.user.username}`;

/** Barre de la validation groupée : tout cocher, compteur et « Valider la sélection ». */
function BulkBar({
  checked,
  onSelectAll,
  onClear,
  onReport,
}: {
  checked: SubmissionQueueItem[];
  onSelectAll: () => void;
  onClear: () => void;
  onReport: (report: BulkReport) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  // Soumissions qui visent une cellule-formule : validées seulement après confirmation.
  const [toConfirm, setToConfirm] = useState<{
    done: BulkValidateResult;
    labels: Map<string, string>;
  } | null>(null);

  const finish = (result: BulkValidateResult, labels: Map<string, string>) => {
    setToConfirm(null);
    onClear();
    onReport({
      validated: result.validated.length,
      pending: [
        ...result.failed.map((f) => ({ id: f.id, label: labels.get(f.id) ?? '', code: f.code })),
        ...result.confirmationRequired.map((c) => ({
          id: c.id,
          label: labels.get(c.id) ?? '',
          code: null,
        })),
      ],
    });
    if (result.validated.length > 0) {
      toast(t('submissions.admin.bulk.validated', { count: result.validated.length }));
    }
    void queryClient.invalidateQueries({ queryKey: ['admin', 'submissions'] });
    void queryClient.invalidateQueries({ queryKey: ['rows'] });
  };
  const run = useMutation({
    mutationFn: async () => {
      const labels = new Map(checked.map((i) => [i.submission.id, labelOf(i)]));
      const result = await validateSubmissions(checked.map((i) => i.submission.id));
      return { result, labels };
    },
    onSuccess: ({ result, labels }) => {
      if (result.confirmationRequired.length > 0) setToConfirm({ done: result, labels });
      else finish(result, labels);
    },
  });
  const replay = useMutation({
    mutationFn: ({ done }: NonNullable<typeof toConfirm>) =>
      validateSubmissions(
        done.confirmationRequired.map((c) => c.id),
        true,
      ),
    onSuccess: (result, { done, labels }) =>
      finish(
        {
          validated: [...done.validated, ...result.validated],
          failed: [...done.failed, ...result.failed],
          confirmationRequired: result.confirmationRequired,
        },
        labels,
      ),
  });
  const tooMany = checked.length > BULK_VALIDATE_MAX;

  return (
    <div className="bulk-bar">
      <button type="button" className="secondary" onClick={onSelectAll}>
        {t('submissions.admin.bulk.selectAll')}
      </button>
      <button type="button" className="secondary" disabled={checked.length === 0} onClick={onClear}>
        {t('submissions.admin.bulk.clear')}
      </button>
      <span className="muted" role="status">
        {t('submissions.admin.bulk.selected', { count: checked.length })}
      </span>
      <button
        type="button"
        disabled={checked.length === 0 || tooMany || run.isPending}
        onClick={() =>
          void confirm({
            title: t('submissions.admin.bulk.confirmTitle', { count: checked.length }),
            message: t('submissions.admin.bulk.confirmMessage'),
            confirmLabel: t('submissions.admin.bulk.validate'),
          }).then((ok) => {
            if (ok) run.mutate();
          })
        }
      >
        {t('submissions.admin.bulk.validate')}
      </button>
      <ErrorMessage error={run.error ?? replay.error} />
      {toConfirm && (
        <Modal
          title={t('submissions.admin.bulk.formulasTitle', {
            count: toConfirm.done.confirmationRequired.length,
          })}
          onClose={() => finish(toConfirm.done, toConfirm.labels)}
        >
          <ul>
            {toConfirm.done.confirmationRequired.map((c) => (
              <li key={c.id}>{toConfirm.labels.get(c.id)}</li>
            ))}
          </ul>
          <Warnings warnings={mergeWarnings(toConfirm.done.confirmationRequired)} />
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => finish(toConfirm.done, toConfirm.labels)}
            >
              {t('submissions.admin.bulk.leavePending')}
            </button>
            <button
              type="button"
              autoFocus
              disabled={replay.isPending}
              onClick={() => replay.mutate(toConfirm)}
            >
              {t('submissions.admin.validateAnyway')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Un avertissement par code, avec les cellules de toutes les soumissions concernées. */
function mergeWarnings(items: BulkValidateResult['confirmationRequired']): Warning[] {
  const merged = new Map<string, Warning>();
  for (const warning of items.flatMap((i) => i.warnings)) {
    const known = merged.get(warning.code);
    if (!known) {
      merged.set(warning.code, { ...warning });
    } else if (Array.isArray(known.cells) && Array.isArray(warning.cells)) {
      known.cells = [...new Set([...(known.cells as string[]), ...(warning.cells as string[])])];
    }
  }
  return [...merged.values()];
}

function BulkReportNotice({ report, onClose }: { report: BulkReport; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Notice tone={report.pending.length > 0 ? 'warning' : 'success'} role="status">
      <p>{t('submissions.admin.bulk.validated', { count: report.validated })}</p>
      {report.pending.length > 0 && (
        <>
          <p>{t('submissions.admin.bulk.stillPending', { count: report.pending.length })}</p>
          <ul>
            {report.pending.map((p) => (
              <li key={p.id}>
                {p.label} :{' '}
                {p.code ? t(`errors.${p.code}`) : t('submissions.admin.bulk.notConfirmed')}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="link" onClick={onClose}>
        {t('common.close')}
      </button>
    </Notice>
  );
}

type Action = { kind: 'validate' } | { kind: 'modify'; values: SubmissionValues };

function QueueItem({
  item,
  inConflict,
  filterByUser,
  selected,
  onSelect,
}: {
  item: SubmissionQueueItem;
  inConflict: boolean;
  filterByUser: () => void;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { submission, user, form, targets } = item;
  const [editing, setEditing] = useState<Record<string, string | boolean> | null>(null);
  const [toConfirm, setToConfirm] = useState<{ action: Action; warnings: Warning[] } | null>(null);
  const prompt = usePrompt();
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
        {pending && (
          <input
            type="checkbox"
            aria-label={t('submissions.admin.bulk.select', {
              form: form.title,
              user: user.username,
            })}
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
          />
        )}
        <strong>{form.title}</strong>
        <span className={`status status-${submission.status}`}>
          {t(`submissions.status.${submission.status}`)}
        </span>
        <span className="muted">
          <button type="button" className="link" onClick={filterByUser}>
            {user.username}
          </button>{' '}
          · {formatDateTime(submission.submittedAt)} ·{' '}
          <Link to={`/admin/pages/${form.pageId}`}>{t('submissions.admin.openPage')}</Link>
        </span>
      </header>
      {submission.rowKey && <p>{t('submissions.admin.rowKey', { key: submission.rowKey })}</p>}
      {inConflict && pending && (
        <p className="notice warning">
          {t('submissions.admin.conflict', { count: Math.max(item.conflicts.length, 1) })}
        </p>
      )}
      <div className="table-wrap stack-mobile">
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
                <td data-label={t('submissions.admin.field')}>{target.field}</td>
                <td data-label={t('submissions.admin.cell')}>
                  {target.cell
                    ? `${target.sheet}!${target.cell}`
                    : form.mode === 'ajout'
                      ? t('submissions.admin.rowAtValidation')
                      : '—'}
                  {target.error && (
                    <small className="field-error"> {t(`errors.${target.error}`)}</small>
                  )}
                </td>
                <td
                  data-label={
                    pending ? t('submissions.admin.current') : t('submissions.admin.written')
                  }
                >
                  {target.currentValue ?? '—'}
                </td>
                <td data-label={t('submissions.admin.proposed')}>
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
        <Modal title={t('submissions.admin.confirmTitle')} onClose={() => setToConfirm(null)}>
          <Warnings warnings={toConfirm.warnings} />
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={() => setToConfirm(null)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              autoFocus
              disabled={decide.isPending}
              onClick={() => decide.mutate({ action: toConfirm.action, confirm: true })}
            >
              {t('submissions.admin.validateAnyway')}
            </button>
          </div>
        </Modal>
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
                onClick={() =>
                  void prompt({
                    title: t('submissions.admin.rejectTitle', { form: form.title }),
                    label: t('submissions.admin.rejectReason'),
                    confirmLabel: t('submissions.admin.reject'),
                    multiline: true,
                    optional: true,
                  }).then((reason) => {
                    if (reason !== null) reject.mutate(reason);
                  })
                }
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
