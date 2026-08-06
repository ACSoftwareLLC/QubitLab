import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { EditorActionsProvider } from './context/EditorActionsContext';
import { useAnalytics } from './hooks/useAnalytics';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { AuthPage } from './components/AuthPage';
import { EditorPage } from './pages/EditorPage';
import { CircuitsPage } from './pages/CircuitsPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { AccountPage } from './pages/AccountPage';
import { LandingPage } from './pages/LandingPage';
import { HomePage } from './pages/HomePage';
import { BlogPage } from './pages/BlogPage';
import { BlogPostPage } from './pages/BlogPostPage';
import { BlogEditorPage } from './pages/BlogEditorPage';
import { PatchNotesPage } from './pages/PatchNotesPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { AnalyticsPage } from './pages/AnalyticsPage';

function HomeOrLanding() {
  const { user } = useAuth();
  return user ? <HomePage /> : <LandingPage />;
}

function App() {
  const { loading } = useAuth();
  useAnalytics();

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
        {/* Public pages share the app shell so guests can discover the product. */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomeOrLanding />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/patch-notes" element={<PatchNotesPage />} />
          <Route path="/user/:username" element={<UserProfilePage />} />
        </Route>
        {/* Admin-only routes. */}
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/blog/new" element={<BlogEditorPage />} />
          <Route path="/blog/:slug/edit" element={<BlogEditorPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
        </Route>

        {/* Standalone auth screen. */}
        <Route path="/login" element={<AuthPage />} />

        {/* Authenticated product pages. */}
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/home" element={<HomePage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/circuits" element={<CircuitsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </EditorActionsProvider>
  );
}

export default App;
