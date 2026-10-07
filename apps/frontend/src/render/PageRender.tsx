import type { AssembledLayout, AssembledPage } from '@strategos/shared';
import { useTranslation } from 'react-i18next';
import { AccountMenu } from '../components/AccountMenu';
import { Rows } from './Rows';
import { ThemeScope } from './ThemeScope';
import { useColorMode } from '../useColorMode';

/**
 * Une page assemblée, avec le header, le footer et la sidebar partagés s'ils sont affichés.
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
  const { main } = page.zones;
  // Sidebar propre à la page, sinon la commune si la page l'affiche.
  const sidebar = page.zones.sidebar ?? (page.showSidebar ? (layout?.sidebar ?? null) : null);
  // Mode sombre : le thème désigné dans les réglages remplace celui de la page.
  const dark = useColorMode() === 'dark' ? page.darkTheme : null;
  return (
    <ThemeScope theme={(dark ?? page.theme).config}>
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
