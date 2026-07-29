import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { EditorActionsProvider } from './context/EditorActionsContext';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { EditorPage } from './pages/EditorPage';
import { CircuitsPage } from './pages/CircuitsPage';
import { AccountPage } from './pages/AccountPage';

function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#e2e8f0',
          fontSize: '1.25rem',
        }}
      >
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
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/editor" replace />} />
        </Route>
      </Routes>
    </EditorActionsProvider>
  );
}

export default App;
