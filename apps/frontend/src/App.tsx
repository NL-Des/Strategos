import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RequireAdmin, RequireAuth } from './auth/guards';
import { AdminLayout } from './components/AdminNav';
import { AppLayout } from './components/AppLayout';
import { ChangeCredentialsPage } from './pages/ChangeCredentialsPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { AuditPage } from './pages/admin/AuditPage';
import { UserPage } from './pages/admin/UserPage';
import { UsersPage } from './pages/admin/UsersPage';

function Authenticated({ admin, children }: { admin?: boolean; children: ReactNode }) {
  return (
    <RequireAuth>
      <AppLayout>
        {admin ? (
          <RequireAdmin>
            <AdminLayout>{children}</AdminLayout>
          </RequireAdmin>
        ) : (
          children
        )}
      </AppLayout>
    </RequireAuth>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/change-credentials"
          element={
            <Authenticated>
              <ChangeCredentialsPage />
            </Authenticated>
          }
        />
        <Route
          path="/"
          element={
            <Authenticated>
              <HomePage />
            </Authenticated>
          }
        />
        <Route
          path="/admin/users"
          element={
            <Authenticated admin>
              <UsersPage />
            </Authenticated>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <Authenticated admin>
              <UserPage />
            </Authenticated>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <Authenticated admin>
              <AuditPage />
            </Authenticated>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
