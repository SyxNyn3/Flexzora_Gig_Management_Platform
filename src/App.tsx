import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { validateSession } from '@/lib/auth';
import LandingPage from '@/components/landing/LandingPage';
import WaitlistForm from '@/components/waitlist/WaitlistForm';
import ScheduleDemoForm from '@/components/demo/ScheduleDemoForm';
import Layout from '@/components/layout/Layout';
import AuthForm from '@/components/auth/AuthForm';

const WorkerDashboard = lazy(() => import('@/components/dashboard/WorkerDashboard'));
const Dashboard = lazy(() => import('@/components/dashboard/Dashboard'));
const WorkerGigList = lazy(() => import('@/components/gigs/WorkerGigList'));
const GigList = lazy(() => import('@/components/gigs/GigList'));
const GigDetails = lazy(() => import('@/components/gigs/GigDetails'));
const GigManagement = lazy(() => import('@/components/gigs/GigManagement'));
const CreateGigForm = lazy(() => import('@/components/gigs/CreateGigForm'));
const WorkerApplications = lazy(() => import('@/components/applications/WorkerApplications'));
const ApplicationsManager = lazy(() => import('@/components/gigs/ApplicationsManager'));
const CalendarView = lazy(() => import('@/components/calendar/CalendarView'));
const AvailabilityEditor = lazy(() => import('@/components/calendar/AvailabilityEditor'));
const FinanceDashboard = lazy(() => import('@/components/finances/FinanceDashboard'));
const ProfilePage = lazy(() => import('@/components/profile/ProfilePage'));
const CompanyIntegrations = lazy(() => import('@/components/integrations/CompanyIntegrations'));
const GmailIntegration = lazy(() => import('@/components/integrations/GmailIntegration'));
const UnifiedSchedule = lazy(() => import('@/components/integrations/UnifiedSchedule'));
const CompanyDashboard = lazy(() => import('@/components/integrations/CompanyDashboard'));
const PaymentSuccess = lazy(() => import('@/components/payments/PaymentSuccess'));
const SchedulingInterface = lazy(() => import('@/components/scheduling/SchedulingInterface'));
const WaitlistVerification = lazy(() => import('@/components/waitlist/WaitlistVerification'));
const EventsPage = lazy(() => import('@/pages/company/EventsPage'));
const EventDetailPage = lazy(() => import('@/pages/company/EventDetailPage'));
const TimesheetApprovalPage = lazy(() => import('@/pages/company/TimesheetApprovalPage'));
const RosterPage = lazy(() => import('@/pages/company/RosterPage'));
const ShiftMarketplacePage = lazy(() => import('@/pages/worker/ShiftMarketplacePage'));
const PayoutsPage = lazy(() => import('@/pages/worker/PayoutsPage'));
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'));
const WaitlistAdminPage = lazy(() => import('@/pages/admin/WaitlistAdminPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-muted/50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      <p className="mt-4 text-muted-foreground">Loading Flexzora...</p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const [validating, setValidating] = useState(true);
  const navigate = useNavigate();

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
  }, [user, loading, navigate]);

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
  const [validating, setValidating] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      if (!user && !loading) {
        // Try to validate the session
        const isValid = await validateSession();
        setValidating(false);

        if (isValid) {
          // If session is valid, redirect to dashboard
          navigate('/dashboard', { replace: true });
        }
      } else {
        setValidating(false);
      }
    };

    checkSession();
  }, [user, loading, navigate]);

  if (loading || validating) {
    return <LoadingSpinner />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.role !== 'admin') return <Navigate to="/dashboard" replace />;
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
      <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/waitlist" element={<WaitlistForm />} />
        <Route path="/waitlist/verify" element={<WaitlistVerification />} />
        <Route path="/u/:username" element={<PublicProfilePage />} />
        <Route
          path="/admin/waitlist"
          element={
            <AdminRoute>
              <Layout>
                <WaitlistAdminPage />
              </Layout>
            </AdminRoute>
          }
        />
        <Route path="/schedule-demo" element={<ScheduleDemoForm />} />
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
                <GigManagement />
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
          path="/availability"
          element={
            <ProtectedRoute>
              <Layout>
                <AvailabilityEditor />
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
        <Route
          path="/events"
          element={
            <ProtectedRoute>
              <Layout>
                <EventsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId"
          element={
            <ProtectedRoute>
              <Layout>
                <EventDetailPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheets"
          element={
            <ProtectedRoute>
              <Layout>
                <TimesheetApprovalPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/roster"
          element={
            <ProtectedRoute>
              <Layout>
                <RosterPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/shifts"
          element={
            <ProtectedRoute>
              <Layout>
                <ShiftMarketplacePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/payouts"
          element={
            <ProtectedRoute>
              <Layout>
                <PayoutsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
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
