import { type FormulaFunction, argumentAt } from '@strategos/shared';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Guide des arguments : la fonction dont les parenthèses entourent le curseur,
 * sa signature (facultatifs entre crochets) et l'argument en cours de saisie.
 */
export function ArgumentGuide({ fn, argIndex }: { fn: FormulaFunction; argIndex: number }) {
  const { t } = useTranslation();
  const current = argumentAt(fn, argIndex);
  // Un argument répété au-delà de la signature est affiché sur « … ».
  const shown = argIndex < fn.args.length ? argIndex : fn.repeat ? fn.args.length : -1;
  const label = (key: string) => t(`formulas.args.${key}.label`);

  return (
    <div className="formula-guide" aria-live="polite">
      <p className="muted">{t('sources.grid.formula.arguments', { name: fn.fr })}</p>
      <code>
        {fn.fr}(
        {fn.args.map((a, i) => (
          <Fragment key={i}>
            {i > 0 && '; '}
            <span className={i === shown ? 'current' : undefined}>
              {a.optional ? `[${label(a.key)}]` : label(a.key)}
            </span>
          </Fragment>
        ))}
        {fn.repeat ? (
          <>
            {'; '}
            <span className={shown === fn.args.length ? 'current' : undefined}>…</span>
          </>
        ) : null}
        )
      </code>
      {current ? (
        <p>
          <strong>{label(current.key)}</strong> : {t(`formulas.args.${current.key}.help`)}
        </p>
      ) : (
        <p className="formula-extra">{t('sources.grid.formula.extraArg')}</p>
      )}
      {fn.args.some((a) => a.optional) && (
        <p className="muted">{t('sources.grid.formula.optional')}</p>
      )}
    </div>
  );
}
