import type { AssembledLayout, AssembledPage } from '@strategos/shared';
import { useTranslation } from 'react-i18next';
import { AccountMenu } from '../components/AccountMenu';
import { Rows } from './Rows';
import { ThemeScope } from './ThemeScope';

/**
 * Une page assemblée, avec le header et le footer partagés s'ils sont affichés.
 * Sert à l'affichage réel comme à l'aperçu de l'admin.
 */
export function PageRender({
  page,
  layout,
}: {
  page: AssembledPage;
  layout: AssembledLayout | null;
}) {
  const { t } = useTranslation();
  const { main, sidebar } = page.zones;
  return (
    <ThemeScope theme={page.theme.config}>
      <AccountMenu />
      {/* Renseigné pour l'admin seul (13 — Page assemblée). */}
      {page.unavailableSources.length > 0 && (
        <p className="notice warning" role="status">
          {t('render.unavailableSources', {
            names: page.unavailableSources.map((s) => s.name).join(', '),
          })}
        </p>
      )}
      {page.showHeader && layout?.header && (
        <header className="zone zone-header">
          <Rows rows={layout.header} />
        </header>
      )}
      <div className={`zone-body${sidebar ? ' with-sidebar' : ''}`}>
        {main && (
          <main className="zone zone-main">
            <Rows rows={main} />
          </main>
        )}
        {sidebar && (
          <aside className="zone zone-sidebar">
            <Rows rows={sidebar} />
          </aside>
        )}
      </div>
      {page.showFooter && layout?.footer && (
        <footer className="zone zone-footer">
          <Rows rows={layout.footer} />
        </footer>
      )}
    </ThemeScope>
  );
}
