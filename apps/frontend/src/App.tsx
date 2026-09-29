import { type ReactNode, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RequireAdmin, RequireAuth } from './auth/guards';
import { AdminLayout } from './components/AdminNav';
import { AppLayout } from './components/AppLayout';
import { ChangeCredentialsPage } from './pages/ChangeCredentialsPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MySubmissionsPage } from './pages/MySubmissionsPage';
import { PageRoute } from './pages/PageRoute';
import { ProfilePage } from './pages/ProfilePage';

// Espace d'administration chargé à part : les utilisateurs ne téléchargent pas
// l'éditeur de pages (TipTap) ni les autres écrans admin.
const admin = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
// Notes : leur éditeur (TipTap) n'est chargé qu'à l'ouverture de la page.
const NotesPage = admin(() => import('./pages/NotesPage'), 'NotesPage');
const AuditPage = admin(() => import('./pages/admin/AuditPage'), 'AuditPage');
const TrashPage = admin(() => import('./pages/admin/TrashPage'), 'TrashPage');
const GroupPage = admin(() => import('./pages/admin/GroupPage'), 'GroupPage');
const GroupsPage = admin(() => import('./pages/admin/GroupsPage'), 'GroupsPage');
const LayoutEditorPage = admin(() => import('./pages/admin/LayoutEditorPage'), 'LayoutEditorPage');
const MediaPage = admin(() => import('./pages/admin/MediaPage'), 'MediaPage');
const PageEditorPage = admin(() => import('./pages/admin/PageEditorPage'), 'PageEditorPage');
const PagesPage = admin(() => import('./pages/admin/PagesPage'), 'PagesPage');
const ResourceRightsPage = admin(
  () => import('./pages/admin/ResourceRightsPage'),
  'ResourceRightsPage',
);
const RightsPage = admin(() => import('./pages/admin/RightsPage'), 'RightsPage');
const SourcesPage = admin(() => import('./pages/admin/SourcesPage'), 'SourcesPage');
const SubmissionsPage = admin(() => import('./pages/admin/SubmissionsPage'), 'SubmissionsPage');
const SettingsPage = admin(() => import('./pages/admin/SettingsPage'), 'SettingsPage');
const ThemeEditorPage = admin(() => import('./pages/admin/ThemeEditorPage'), 'ThemeEditorPage');
const TemplatesPage = admin(() => import('./pages/admin/TemplatesPage'), 'TemplatesPage');
const ThemesPage = admin(() => import('./pages/admin/ThemesPage'), 'ThemesPage');
const UserPage = admin(() => import('./pages/admin/UserPage'), 'UserPage');
const UsersPage = admin(() => import('./pages/admin/UsersPage'), 'UsersPage');

function Loading() {
  const { t } = useTranslation();
  return <p>{t('common.loading')}</p>;
}

/** Page construite par l'admin : sans cadre, le menu de compte est dans la page. */
function Site({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

/** Écrans hors page builder, avec leur cadre ; `admin` ajoute la navigation d'administration. */
function Framed({ admin, children }: { admin?: boolean; children: ReactNode }) {
  return (
    <RequireAuth>
      <AppLayout>
        {admin ? (
          <RequireAdmin>
            <AdminLayout>
              <Suspense fallback={<Loading />}>{children}</Suspense>
            </AdminLayout>
          </RequireAdmin>
        ) : (
          children
        )}
      </AppLayout>
    </RequireAuth>
  );
}

const ADMIN_ROUTES: [string, ReactNode][] = [
  ['/admin/pages', <PagesPage />],
  ['/admin/pages/:id', <PageEditorPage />],
  ['/admin/layout/:kind', <LayoutEditorPage />],
  ['/admin/media', <MediaPage />],
  ['/admin/templates', <TemplatesPage />],
  ['/admin/themes', <ThemesPage />],
  ['/admin/themes/:id', <ThemeEditorPage />],
  ['/admin/sources', <SourcesPage />],
  ['/admin/submissions', <SubmissionsPage />],
  ['/admin/users', <UsersPage />],
  ['/admin/users/:id', <UserPage />],
  ['/admin/groups', <GroupsPage />],
  ['/admin/groups/:id', <GroupPage />],
  ['/admin/rights', <RightsPage />],
  ['/admin/rights/:type/:id', <ResourceRightsPage />],
  ['/admin/settings', <SettingsPage />],
  ['/admin/audit', <AuditPage />],
  ['/admin/trash', <TrashPage />],
];

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/change-credentials"
          element={
            <Framed>
              <ChangeCredentialsPage />
            </Framed>
          }
        />
        <Route
          path="/profile"
          element={
            <Framed>
              <ProfilePage />
            </Framed>
          }
        />
        <Route
          path="/notes"
          element={
            <Framed>
              <Suspense fallback={<Loading />}>
                <NotesPage />
              </Suspense>
            </Framed>
          }
        />
        <Route
          path="/submissions"
          element={
            <Framed>
              <MySubmissionsPage />
            </Framed>
          }
        />
        <Route
          path="/"
          element={
            <Site>
              <HomePage />
            </Site>
          }
        />
        <Route
          path="/pages/:id"
          element={
            <Site>
              <PageRoute />
            </Site>
          }
        />
        {ADMIN_ROUTES.map(([path, element]) => (
          <Route key={path} path={path} element={<Framed admin>{element}</Framed>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
