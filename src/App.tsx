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
import { COPILOT_ENABLED } from '@/lib/copilot/service';

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
const ImportPage = lazy(() => import('@/pages/company/ImportPage'));
const CopilotPage = lazy(() => import('@/pages/company/CopilotPage'));
const StaffPage = lazy(() => import('@/pages/company/StaffPage'));
const BroadcastPage = lazy(() => import('@/pages/company/BroadcastPage'));
const OpsBoardPage = lazy(() => import('@/pages/company/OpsBoardPage'));
const ExportsPage = lazy(() => import('@/pages/company/ExportsPage'));
const AlertsPage = lazy(() => import('@/pages/company/AlertsPage'));
const CertReviewPage = lazy(() => import('@/pages/company/CertReviewPage'));
const ShiftMarketplacePage = lazy(() => import('@/pages/worker/ShiftMarketplacePage'));
const CrewBoardPage = lazy(() => import('@/pages/worker/CrewBoardPage'));
const PayoutsPage = lazy(() => import('@/pages/worker/PayoutsPage'));
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'));
const WaitlistAdminPage = lazy(() => import('@/pages/admin/WaitlistAdminPage'));
const ResetPasswordPage = lazy(() => import('@/components/auth/ResetPasswordPage'));

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

const RoleRoute: React.FC<{ role: 'worker' | 'company'; children: React.ReactNode }> = ({ role, children }) => {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (profile && profile.role !== role && profile.role !== 'admin') {
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
    <Router basename={import.meta.env.BASE_URL}>
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
        {/* Recovery-link target — intentionally NOT wrapped in PublicRoute:
            the link creates a session that would bounce users to /dashboard
            before they could set a new password. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <CreateGigForm />
              </Layout>
            </RoleRoute></ProtectedRoute>
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
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <GigManagement />
              </Layout>
            </RoleRoute></ProtectedRoute>
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
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <AvailabilityEditor />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <SchedulingInterface />
              </Layout>
            </RoleRoute></ProtectedRoute>
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
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <CompanyDashboard />
              </Layout>
            </RoleRoute></ProtectedRoute>
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
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <EventsPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <EventDetailPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/timesheets"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <TimesheetApprovalPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/roster"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <RosterPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/import"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <ImportPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <StaffPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/ops"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <OpsBoardPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/broadcast"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <BroadcastPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/cert-reviews"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <CertReviewPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/alerts"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <AlertsPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/exports"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <ExportsPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/copilot"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                {COPILOT_ENABLED ? <CopilotPage /> : <Navigate to="/dashboard" replace />}
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/shifts"
          element={
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <ShiftMarketplacePage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/shifts/:shiftId/crew"
          element={
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <CrewBoardPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/payouts"
          element={
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <PayoutsPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
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
