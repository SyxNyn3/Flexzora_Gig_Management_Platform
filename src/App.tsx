import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { validateSession, isDemoMode } from '@/lib/auth';
import LandingPage from '@/components/landing/LandingPage';
import Layout from '@/components/layout/Layout';
import AuthForm from '@/components/auth/AuthForm';
import WorkerDashboard from '@/components/dashboard/WorkerDashboard';
import Dashboard from '@/components/dashboard/Dashboard';
import WorkerGigList from '@/components/gigs/WorkerGigList';
import GigList from '@/components/gigs/GigList';
import GigDetails from '@/components/gigs/GigDetails';
import GigManagement from '@/components/gigs/GigManagement';
import CreateGigForm from '@/components/gigs/CreateGigForm';
import WorkerApplications from '@/components/applications/WorkerApplications';
import ApplicationsManager from '@/components/gigs/ApplicationsManager';
import CalendarView from '@/components/calendar/CalendarView';
import FinanceDashboard from '@/components/finances/FinanceDashboard';
import ProfilePage from '@/components/profile/ProfilePage';
import CompanyIntegrations from '@/components/integrations/CompanyIntegrations';
import GmailIntegration from '@/components/integrations/GmailIntegration';
import UnifiedSchedule from '@/components/integrations/UnifiedSchedule';
import CompanyDashboard from '@/components/integrations/CompanyDashboard';
import PaymentSuccess from '@/components/payments/PaymentSuccess';
import SchedulingInterface from '@/components/scheduling/SchedulingInterface';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p className="mt-4 text-gray-600">Loading Flexora...</p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const [validating, setValidating] = useState(!isDemoMode);
  
  useEffect(() => {
    const checkSession = async () => {
      if (!user && !loading) {
        // Try to validate and refresh the session
        const isValid = await validateSession();
        setValidating(false);
        
        if (!isValid) {
          // If session validation fails, redirect to auth
          navigate('/auth', { replace: true });
        }
      } else {
        setValidating(false);
      }
    };
    
    checkSession();
  }, [user, loading]);

  if (loading || validating) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const [validating, setValidating] = useState(!isDemoMode);
  
  useEffect(() => {
    const checkSession = async () => {
      if (!user && !loading) {
        // Try to validate the session
        const isValid = await validateSession();
        setValidating(false);
        
        if (isValid) {
          // If session is valid but user state is not set yet, wait for auth context to update
          // Note: This should use Navigate component instead of navigate function
        }
      } else {
        setValidating(false);
      }
    };
    
    checkSession();
  }, [user, loading]);

  if (loading || validating) {
    return <LoadingSpinner />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { profile } = useAuth();

  // Determine which components to use based on user role
  const DashboardComponent = profile?.role === 'worker' ? WorkerDashboard : Dashboard;
  const GigListComponent = profile?.role === 'worker' ? WorkerGigList : GigList;
  const ApplicationsComponent = profile?.role === 'worker' ? WorkerApplications : ApplicationsManager;

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={<LandingPage />}
        />
        <Route
          path="/auth"
          element={
            <PublicRoute>
              <AuthForm />
            </PublicRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardComponent />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gigs"
          element={
            <ProtectedRoute>
              <Layout>
                <GigListComponent />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gigs/create"
          element={
            <ProtectedRoute>
              <Layout>
                <CreateGigForm />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gigs/:id"
          element={
            <ProtectedRoute>
              <Layout>
                <GigDetails />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gigs/:id/manage"
          element={
            <ProtectedRoute>
              <Layout>
                <GigManagement gigId="1" />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications"
          element={
            <ProtectedRoute>
              <Layout>
                <ApplicationsComponent />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <Layout>
                <CalendarView />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute>
              <Layout>
                <SchedulingInterface />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/finances"
          element={
            <ProtectedRoute>
              <Layout>
                <FinanceDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <ProfilePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/integrations"
          element={
            <ProtectedRoute>
              <Layout>
                <CompanyIntegrations />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/integrations/gmail"
          element={
            <ProtectedRoute>
              <Layout>
                <GmailIntegration />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/unified-schedule"
          element={
            <ProtectedRoute>
              <Layout>
                <UnifiedSchedule />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workforce"
          element={
            <ProtectedRoute>
              <Layout>
                <CompanyDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment-success"
          element={
            <ProtectedRoute>
              <Layout>
                <PaymentSuccess />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;