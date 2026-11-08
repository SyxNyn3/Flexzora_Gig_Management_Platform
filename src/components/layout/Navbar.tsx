import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useHasCompanyMembership } from '@/hooks/useMarketplace';
import { Bell, Calendar, DollarSign, LogOut, User, Briefcase, Plus, MessageSquare, Building2, Users, Link as LinkIcon, CalendarDays, Mail, Upload, Sparkles, Megaphone, KanbanSquare, FileDown, AlertTriangle, ShieldCheck, Inbox, Clock, UserCog, Wallet, FileCheck, Menu, X, Landmark, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import { COPILOT_ENABLED } from '@/lib/copilot/service';

// Left-sidebar navigation for the logged-in app (was a top navbar).
// Desktop: fixed-width aside, full height, scrollable nav list.
// Mobile: collapses to a hamburger top bar + slide-over drawer.
// All nav data, gates, and the user menu are unchanged — only the chrome moved.

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const Navbar: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const workerNavItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: Briefcase },
    { path: '/feed', label: 'Feed', icon: Inbox },
    { path: '/shifts', label: 'Shifts', icon: Calendar },
    { path: '/payouts', label: 'Payouts', icon: DollarSign },
    { path: '/ledger', label: 'Ledger', icon: Wallet },
    { path: '/tax-playbook', label: 'Tax playbook', icon: Landmark },
    { path: '/start-pack', label: 'Start pack', icon: FileCheck },
    { path: '/market', label: 'Market', icon: Store },
    { path: '/gigs', label: 'Gigs', icon: Briefcase },
    { path: '/applications', label: 'Applications', icon: MessageSquare },
    { path: '/integrations', label: 'Integrations', icon: LinkIcon },
    { path: '/schedule', label: 'Schedule', icon: CalendarDays },
    { path: '/availability', label: 'Availability', icon: Clock },
    { path: '/finances', label: 'Finances', icon: DollarSign },
  ];

  const companyNavItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: Briefcase },
    { path: '/feed', label: 'Feed', icon: Inbox },
    { path: '/events', label: 'Events', icon: CalendarDays },
    { path: '/timesheets', label: 'Timesheets', icon: Calendar },
    { path: '/roster', label: 'Roster', icon: Users },
    { path: '/import', label: 'Import', icon: Upload },
    { path: '/staff', label: 'Staff', icon: Users },
    { path: '/team', label: 'Team', icon: UserCog },
    { path: '/broadcast', label: 'Broadcast', icon: Megaphone },
    { path: '/ops', label: 'Ops', icon: KanbanSquare },
    { path: '/exports', label: 'Exports', icon: FileDown },
    { path: '/alerts', label: 'Alerts', icon: AlertTriangle },
    { path: '/cert-reviews', label: 'Cert reviews', icon: ShieldCheck },
    ...(COPILOT_ENABLED ? [{ path: '/copilot', label: 'Copilot', icon: Sparkles }] : []),
    { path: '/gigs', label: 'Gigs', icon: Briefcase },
    { path: '/workforce', label: 'Workforce', icon: Users },
    { path: '/finances', label: 'Finances', icon: DollarSign },
  ];

  // A worker-profile account with a company_members row operates a company
  // under the same login — show the union of both nav sets (deduped by path).
  const hasCompanyMembership = useHasCompanyMembership();
  const isCompanySide = profile?.role === 'company' || hasCompanyMembership;
  const navItems = profile?.role === 'admin'
    ? [...workerNavItems, { path: '/admin/waitlist', label: 'Waitlist', icon: Users }]
    : isCompanySide
      ? (profile?.role === 'company'
          ? companyNavItems
          : [...workerNavItems, ...companyNavItems.filter((c) => !workerNavItems.some((w) => w.path === c.path))])
      : workerNavItems;

  const isActive = (path: string) => location.pathname.startsWith(path);

  const navList = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              active
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  // Shared footer block: notifications + account menu. Rendered at the
  // bottom of the sidebar on desktop and the drawer on mobile.
  const footer = user ? (
    <div className="border-t border-border/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="relative flex-1 justify-start"
          onClick={() => setShowNotifications(true)}
        >
          <Bell className="w-4 h-4 mr-2" />
          Notifications
          <Badge className="ml-auto h-5 w-5 rounded-full p-0 text-xs bg-primary">3</Badge>
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || ''} alt={profile?.full_name || ''} />
              <AvatarFallback>
                {profile?.full_name?.split(' ').map(n => n[0]).join('') || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{profile?.full_name}</p>
              <p className="text-xs leading-none text-muted-foreground">{profile?.email}</p>
              <Badge variant="outline" className="w-fit mt-1">
                {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'User'}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          {profile?.role === 'worker' && (
            <>
              <DropdownMenuItem onClick={() => navigate('/integrations')}>
                <Building2 className="mr-2 h-4 w-4" />
                <span>Company Integrations</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/integrations/gmail')}>
                <Mail className="mr-2 h-4 w-4" />
                <span>Gmail Integration</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={() => navigate('/calendar')}>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : null;

  return (
    <>
      {/* Mobile top bar — fixed overlay (the flex row would otherwise treat
          it as a sidebar sibling). Main content pads below it via Layout. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-card/70 border-b border-border/60 backdrop-blur-xl">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="px-2" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </Button>
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-gradient-to-r from-blue-600 to-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">F</span>
              </div>
              <span className="text-lg font-bold text-foreground">FlexZora</span>
            </Link>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              {isCompanySide && (
                <Button size="sm" onClick={() => navigate('/gigs/create')} className="bg-gradient-to-r from-blue-600 to-green-500">
                  <Plus className="w-4 h-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="relative" onClick={() => setShowNotifications(true)}>
                <Bell className="w-5 h-5" />
                <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs bg-primary">3</Badge>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setMobileOpen(false)}>
          <aside
            className="absolute left-0 top-0 h-full w-72 bg-card border-r border-border/60 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between h-14 px-4 border-b border-border/60">
              <Link to="/dashboard" className="flex items-center space-x-2" onClick={() => setMobileOpen(false)}>
                <div className="w-7 h-7 bg-gradient-to-r from-blue-600 to-green-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">F</span>
                </div>
                <span className="text-lg font-bold">FlexZora</span>
              </Link>
              <Button variant="ghost" size="sm" className="px-2" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            {user && navList}
            {user ? footer : (
              <div className="border-t border-border/60 p-3 space-y-2">
                <Button variant="outline" className="w-full" onClick={() => { setMobileOpen(false); navigate('/auth'); }}>
                  Sign In
                </Button>
                <Button className="w-full bg-gradient-to-r from-blue-600 to-green-500" onClick={() => { setMobileOpen(false); navigate('/auth?mode=signup'); }}>
                  Sign Up
                </Button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border/60 bg-card/40 backdrop-blur-xl sticky top-0 h-screen">
        <div className="flex items-center justify-between h-16 px-4 border-b border-border/60">
          <Link to="/dashboard" className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-green-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">F</span>
            </div>
            <span className="text-xl font-bold text-foreground">FlexZora</span>
          </Link>
          {isCompanySide && user && (
            <Button
              size="sm"
              onClick={() => navigate('/gigs/create')}
              className="bg-gradient-to-r from-blue-600 to-green-500"
            >
              <Plus className="w-4 h-4 mr-1" />
              Gig
            </Button>
          )}
        </div>

        {user && (
          <>
            {/* Worker "integrations" shortcut — preserved from the old top bar */}
            {profile?.role === 'worker' && (
              <div className="px-3 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => navigate('/integrations')}
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Integrations
                </Button>
              </div>
            )}
            {navList}
            {footer}
          </>
        )}

        {!user && (
          <div className="p-3 space-y-2 mt-auto">
            <Button variant="outline" className="w-full" onClick={() => navigate('/auth')}>
              Sign In
            </Button>
            <Button className="w-full bg-gradient-to-r from-blue-600 to-green-500" onClick={() => navigate('/auth?mode=signup')}>
              Sign Up
            </Button>
          </div>
        )}
      </aside>

      <NotificationCenter
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
};

export default Navbar;
