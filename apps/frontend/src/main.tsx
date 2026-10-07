import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ApiRequestError } from './api/client';
import { ME_KEY } from './auth/useMe';
import { DialogProvider } from './components/Dialog';
import { ToastProvider } from './components/Toast';
import './i18n';
import './styles/index.css';
import { applyColorMode } from './useColorMode';

// Avant le premier rendu : pas d'éclair clair pour qui a choisi le mode sombre.
applyColorMode();

const queryClient = new QueryClient({
  // Session expirée ou révoquée : on revient à l'état « non connecté ».
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        queryClient.setQueryData(ME_KEY, null);
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(error instanceof ApiRequestError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
