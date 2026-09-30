import {
  FORMULA_CATEGORIES,
  FORMULA_FUNCTIONS,
  type FormulaCategory,
  type FormulaFunction,
} from '@strategos/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Sans accents ni casse, pour chercher « equiv » comme « EQUIV » ou « moyenne ». */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Catalogue des fonctions : recherche par nom (français ou anglais) ou par
 * description, filtre par catégorie ; un clic insère la fonction au curseur.
 */
export function FunctionCatalog({
  disabled,
  onInsert,
}: {
  disabled: boolean;
  onInsert: (fn: FormulaFunction) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FormulaCategory | ''>('');
  const q = fold(query.trim());
  const found = FORMULA_FUNCTIONS.filter(
    (f) =>
      (!category || f.category === category) &&
      (!q ||
        fold(f.fr).includes(q) ||
        fold(f.en).includes(q) ||
        fold(t(`formulas.functions.${f.en}`)).includes(q)),
  );

  return (
    <div className="formula-catalog">
      <div className="formula-catalog-filters">
        <label>
          {t('sources.grid.formula.search')}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          {t('sources.grid.formula.category')}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FormulaCategory | '')}
          >
            <option value="">{t('sources.grid.formula.allCategories')}</option>
            {FORMULA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`formulas.categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        {t(disabled ? 'sources.grid.formula.needCell' : 'sources.grid.formula.insertHelp')}
      </p>
      {found.length === 0 ? (
        <p className="muted">{t('sources.grid.formula.noResult')}</p>
      ) : (
        <ul>
          {found.map((f) => (
            <li key={f.en}>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('sources.grid.formula.insert', { name: f.fr })}
                // Garde le focus (et le curseur) dans la barre de formule.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsert(f)}
              >
                <code>{f.fr}</code>
                <span>{t(`formulas.functions.${f.en}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
