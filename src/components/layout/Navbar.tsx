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
import { Bell, Calendar, DollarSign, LogOut, User, Briefcase, Plus, MessageSquare, Building2, Users, Link as LinkIcon, CalendarDays, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import NotificationCenter from '@/components/notifications/NotificationCenter';

const Navbar: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const workerNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: Briefcase },
    { path: '/gigs', label: 'Gigs', icon: Calendar },
    { path: '/applications', label: 'Applications', icon: MessageSquare },
    { path: '/integrations', label: 'Integrations', icon: LinkIcon },
    { path: '/schedule', label: 'Schedule', icon: CalendarDays },
    { path: '/finances', label: 'Finances', icon: DollarSign },
  ];

  const companyNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: Briefcase },
    { path: '/gigs', label: 'Gigs', icon: Calendar },
    { path: '/workforce', label: 'Workforce', icon: Users },
    { path: '/applications', label: 'Applications', icon: MessageSquare },
    { path: '/schedule', label: 'Schedule', icon: CalendarDays },
    { path: '/finances', label: 'Finances', icon: DollarSign },
  ];

  const navItems = profile?.role === 'company'
    ? companyNavItems
    : profile?.role === 'admin'
      ? [...workerNavItems, { path: '/admin/waitlist', label: 'Waitlist', icon: Users }]
      : workerNavItems;

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/dashboard" className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-green-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">F</span>
                </div>
                <span className="text-xl font-bold text-gray-900">FlexZora</span>
              </Link>
              
              {user && (
                <div className="hidden md:flex ml-10 space-x-8">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  {/* Create Gig Button for Companies */}
                  {profile?.role === 'company' && (
                    <Button 
                      size="sm" 
                      onClick={() => navigate('/gigs/create')}
                      className="bg-gradient-to-r from-blue-600 to-green-500"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Gig
                    </Button>
                  )}

                  {/* Integration Status for Workers */}
                  {profile?.role === 'worker' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => navigate('/integrations')}
                      className="flex items-center space-x-2"
                    >
                      <Building2 className="w-4 h-4" />
                      <span className="hidden sm:inline">3 Connected</span>
                    </Button>
                  )}

                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="relative"
                    onClick={() => setShowNotifications(true)}
                  >
                    <Bell className="w-5 h-5" />
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs bg-red-500">
                      3
                    </Badge>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile?.avatar_url || ''} alt={profile?.full_name || ''} />
                          <AvatarFallback>
                            {profile?.full_name?.split(' ').map(n => n[0]).join('') || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium leading-none">{profile?.full_name}</p>
                          <p className="text-xs leading-none text-muted-foreground">
                            {profile?.email}
                          </p>
                          <Badge variant="outline" className="w-fit mt-1">
                            {profile?.role?.charAt(0).toUpperCase() + profile?.role?.slice(1)}
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
                </>
              ) : (
                <div className="flex space-x-2">
                  <Button variant="ghost" onClick={() => navigate('/auth')}>
                    Sign In
                  </Button>
                  <Button onClick={() => navigate('/auth?mode=signup')} className="bg-gradient-to-r from-blue-600 to-green-500">
                    Sign Up
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <NotificationCenter 
        isOpen={showNotifications} 
        onClose={() => setShowNotifications(false)} 
      />
    </>
  );
};

export default Navbar;