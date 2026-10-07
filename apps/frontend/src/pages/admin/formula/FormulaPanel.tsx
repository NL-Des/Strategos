import { type FormulaFunction, type ParsedFormula, callAt, functionFor } from '@strategos/shared';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArgumentGuide } from './ArgumentGuide';
import { FormulaTree, type TreeContext } from './FormulaTree';
import { FunctionCatalog } from './FunctionCatalog';

type Tab = 'decompose' | 'functions';

/**
 * Assistant de formules, à droite de la grille (04 — Sources) : la formule
 * de la cellule choisie, décomposée pour la lire (arbre, références colorées
 * et leurs valeurs enregistrées) et guidée pour l'écrire (arguments de la
 * fonction sous le curseur, catalogue de fonctions). Rien n'est calculé.
 */
export function FormulaPanel({
  hasCell,
  parsed,
  cursor,
  refMode,
  ctx,
  onInsert,
}: {
  hasCell: boolean;
  /** Formule en cours (brouillon), `null` si la cellule contient une valeur. */
  parsed: ParsedFormula | null;
  /** Position du curseur dans la formule sans « = ». */
  cursor: number;
  refMode: boolean;
  ctx: TreeContext;
  onInsert: (fn: FormulaFunction) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('decompose');
  const call = parsed && callAt(parsed.tokens, cursor, 'fr');
  const guided = call?.fn && functionFor(call.fn, ctx.target);

  return (
    <aside className="formula-panel" aria-label={t('sources.grid.formula.tabs')}>
      <div className="actions" role="group" aria-label={t('sources.grid.formula.title')}>
        {(['decompose', 'functions'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'button' : 'button secondary'}
            aria-pressed={tab === key}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(key)}
          >
            {t(`sources.grid.formula.${key}`)}
          </button>
        ))}
      </div>

      {call && guided && <ArgumentGuide fn={guided} argIndex={call.argIndex} />}
      {refMode && <p className="formula-hint">{t('sources.grid.formula.refMode')}</p>}

      {tab === 'functions' ? (
        <FunctionCatalog target={ctx.target} disabled={!hasCell} onInsert={onInsert} />
      ) : !hasCell ? (
        <p className="muted">{t('sources.grid.formula.noCell')}</p>
      ) : !parsed ? (
        <p className="muted">{t('sources.grid.formula.noFormula')}</p>
      ) : (
        <>
          <p className="formula-colored">
            <code>
              =
              {parsed.tokens.map((token) => {
                const color = token.type === 'ref' ? ctx.colorAt(token.start) : undefined;
                return (
                  <Fragment key={token.start}>
                    {color === undefined ? (
                      token.text
                    ) : (
                      <span className={`ref-color-${color}`}>{token.text}</span>
                    )}
                  </Fragment>
                );
              })}
            </code>
          </p>
          {parsed.errors.length > 0 && (
            <p className="formula-extra">{t('sources.grid.formula.incomplete')}</p>
          )}
          <FormulaTree root={parsed.root} ctx={ctx} />
          <p className="muted">
            {t(`sources.grid.formula.notComputed${ctx.target === 'gsheet' ? 'Gsheet' : ''}`)}
          </p>
        </>
      )}
    </aside>
  );
}
