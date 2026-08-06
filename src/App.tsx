import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { EditorActionsProvider } from './context/EditorActionsContext';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { EditorPage } from './pages/EditorPage';
import { CircuitsPage } from './pages/CircuitsPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { AccountPage } from './pages/AccountPage';

function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="app-loading-spinner" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  return (
    <EditorActionsProvider>
      <Routes>
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/circuits" element={<CircuitsPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/editor" replace />} />
        </Route>
      </Routes>
    </EditorActionsProvider>
  );
}

export default App;
