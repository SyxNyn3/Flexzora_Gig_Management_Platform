import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useCompanyMemberships } from '@/hooks/useMarketplace';
import { validateSession } from '@/lib/auth';
import LandingPage from '@/components/landing/LandingPage';
import LegalPage from '@/pages/LegalPage';
import PayRulesPage from '@/pages/PayRulesPage';
import FeedPage from '@/pages/FeedPage';
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
const CompanySetupPage = lazy(() => import('@/pages/company/CompanySetupPage'));
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
const TeamPage = lazy(() => import('@/pages/company/TeamPage'));
const ShiftMarketplacePage = lazy(() => import('@/pages/worker/ShiftMarketplacePage'));
const CrewBoardPage = lazy(() => import('@/pages/worker/CrewBoardPage'));
const PayoutsPage = lazy(() => import('@/pages/worker/PayoutsPage'));
const LedgerPage = lazy(() => import('@/pages/worker/LedgerPage'));
const StartPackPage = lazy(() => import('@/pages/worker/StartPackPage'));
const DealMemosPage = lazy(() => import('@/pages/worker/DealMemosPage'));
const CompanyDealMemosPage = lazy(() => import('@/pages/company/CompanyDealMemosPage'));
const TaxPlaybookPage = lazy(() => import('@/pages/worker/TaxPlaybookPage'));
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

const LoadingSpinner: React.FC = () => {
  // Free-tier Supabase pauses when idle; the first request after a quiet
  // period blocks 5-15s while the project wakes. A bare spinner reads as a
  // hang, so escalate the message instead of faking progress.
  const [slow, setSlow] = useState(false);
  const [verySlow, setVerySlow] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setSlow(true), 4000);
    const t2 = setTimeout(() => setVerySlow(true), 12000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">
          {verySlow ? 'Still waking up — the office computer is booting. Usually under 15 seconds.'
            : slow ? 'Waking up the crew office…'
            : 'Loading Flexzora...'}
        </p>
      </div>
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading, signOut } = useAuth();
  const [validating, setValidating] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      if (!user && !loading) {
        // Try to validate and refresh the session
        let isValid = await validateSession();
        if (!isValid) {
          // Hydration race: supabase-js can report "no session" while
          // it's still rehydrating tokens from storage on a hard load.
          // A false negative here bounces the user /auth → /dashboard
          // and eats their destination. Retry once after a short beat
          // before declaring the session dead.
          await new Promise((r) => setTimeout(r, 700));
          isValid = await validateSession();
        }
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

  // Closed-beta gate: accounts exist but the app stays locked until the
  // profile is approved (profiles.beta_approved). Signups still succeed —
  // they land here instead of inside, and become leads we can invite later.
  if (profile && profile.beta_approved === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">You're on the list.</h1>
          <p className="text-muted-foreground">
            Flexzora is in closed beta right now — we'll email you the moment your
            invite is ready. Keep an eye on your inbox.
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-primary underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
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

// Company surfaces are gated by MEMBERSHIP (public.company_members), not
// profiles.role: a worker-profile account that owns/runs a company must reach
// these pages under the same login. Rendered only for profiles whose role is
// neither 'company' nor 'admin' — everyone else is decided synchronously by
// RoleRoute, so this gate (and its RPC) never mounts for them.
// Empty memberships now route to /company-setup — the open self-serve
// onboarding — instead of dead-ending on the dashboard.
const CompanyMembershipGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { memberships, loading } = useCompanyMemberships();
  if (loading) return <LoadingSpinner />;
  if (memberships.length === 0) return <Navigate to="/company-setup" replace />;
  return <>{children}</>;
};

// /dashboard is not a RoleRoute company route, so company-role users with no
// company_members row would land on a dashboard that can't do anything for
// them. Bounce them to setup instead — same destination the membership gate
// uses. Worker-role users are untouched (they can still create a company
// later via /company-setup without losing worker access).
const CompanySetupRedirect: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const { memberships, loading } = useCompanyMemberships();
  if (profile?.role === 'company' && !loading && memberships.length === 0) {
    return <Navigate to="/company-setup" replace />;
  }
  return <>{children}</>;
};

const RoleRoute: React.FC<{ role: 'worker' | 'company'; children: React.ReactNode }> = ({ role, children }) => {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  const roleOk = !profile || profile.role === role || profile.role === 'admin';
  if (role === 'company' && profile && profile.role !== 'admin') {
    // EVERY non-admin user on a company surface goes through the membership
    // gate — not just non-company roles. A company-role account with zero
    // company_members rows (fresh signup) used to sail through and land on
    // pages that couldn't function; the gate now sends them to
    // /company-setup, which is also the dual-role path for workers.
    return <CompanyMembershipGate>{children}</CompanyMembershipGate>;
  }
  if (profile && !roleOk) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

// Scroll restoration: React Router keeps scroll position across
// navigations, so a link clicked mid-page landed the new page
// scrolled down. Reset to top on every route change.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const AppRoutes: React.FC = () => {
  const { profile } = useAuth();

  // Determine which components to use based on user role
  const DashboardComponent = profile?.role === 'worker' ? WorkerDashboard : Dashboard;
  const GigListComponent = profile?.role === 'worker' ? WorkerGigList : GigList;
  const ApplicationsComponent = profile?.role === 'worker' ? WorkerApplications : ApplicationsManager;

  return (
    <Router basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
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
        <Route path="/privacy" element={<LegalPage doc="privacy" />} />
        <Route path="/terms" element={<LegalPage doc="terms" />} />
        <Route path="/pay-rules" element={<PayRulesPage />} />
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
                <CompanySetupRedirect>
                  <DashboardComponent />
                </CompanySetupRedirect>
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
          path="/company-setup"
          element={
            <ProtectedRoute>
              <Layout>
                <CompanySetupPage />
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
          path="/team"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <TeamPage />
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
          path="/feed"
          element={
            <ProtectedRoute>
              <Layout>
                <FeedPage />
              </Layout>
            </ProtectedRoute>
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
        <Route
          path="/ledger"
          element={
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <LedgerPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/start-pack"
          element={
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <StartPackPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/deal-memos"
          element={
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <DealMemosPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/deal-memos/manage"
          element={
            <ProtectedRoute><RoleRoute role="company">
              <Layout>
                <CompanyDealMemosPage />
              </Layout>
            </RoleRoute></ProtectedRoute>
          }
        />
        <Route
          path="/tax-playbook"
          element={
            <ProtectedRoute><RoleRoute role="worker">
              <Layout>
                <TaxPlaybookPage />
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
