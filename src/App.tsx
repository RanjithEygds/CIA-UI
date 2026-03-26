import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import UploadDocument from './pages/UploadDocument';
import Preview from './pages/Preview';
import PreviewInterviewQuestions from './pages/PreviewInterviewQuestions';
import AddStakeholders from './pages/AddStakeholders';
import LaunchInterview from './pages/LaunchInterview';
import CimmieSession from './pages/CimmieSession';
import AllCIAs from './pages/AllCIAs';
import EngagementDetail from './pages/EngagementDetail';
import ChangeImpactHeatmap from './pages/ChangeImpactHeatmap';
import StakeholderResponses from './pages/StakeholderResponses';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="upload" element={<UploadDocument />} />
        <Route path="preview" element={<Preview />} />
        <Route path="preview-questions" element={<PreviewInterviewQuestions />} />
        <Route path="add-stakeholders" element={<AddStakeholders />} />
        <Route path="launch" element={<LaunchInterview />} />
        <Route path="cimmie" element={<CimmieSession />} />
        <Route path="all-cias" element={<AllCIAs />} />
        <Route path="all-cias/:engagementId" element={<EngagementDetail />} />
        <Route path="stakeholder/:stakeholderId/responses" element={<StakeholderResponses />} />
        <Route path="impact-heatmap" element={<ChangeImpactHeatmap />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}