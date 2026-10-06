import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuthKitButton } from './AuthKitButton';
import { Mail, RefreshCw, Inbox, Send, Star, Clock, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

interface EmailSummary {
  id: string;
  subject: string;
  sender: string;
  preview: string;
  date: string;
  isRead: boolean;
  hasAttachment: boolean;
  labels: string[];
  isGigRelated: boolean;
}

const GmailIntegration: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('gig-related');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  useEffect(() => {
    // Check if we have a stored connection
    const hasConnection = localStorage.getItem('gmail-connected') === 'true';
    setIsConnected(hasConnection);
    
    if (hasConnection) {
      loadEmails();
    }
  }, []);

  const loadEmails = () => {
    setLoading(true);
    
    // In a real implementation, this would fetch emails from the Gmail API
    // For demo purposes, we'll use mock data
    setTimeout(() => {
      const mockEmails: EmailSummary[] = [
        {
          id: '1',
          subject: 'Confirmed: A1 Audio Engineer — Show Call',
          sender: 'crew.ops@solotech.com',
          preview: 'You are confirmed for Show Call / System Ops at Stadium Main Stage. Advance packet and parking pass attached...',
          date: '2026-09-29T10:30:00Z',
          isRead: true,
          hasAttachment: true,
          labels: ['work', 'important'],
          isGigRelated: true
        },
        {
          id: '2',
          subject: 'Call Time Update: Load-In & Rigging Call',
          sender: 'dispatch@rhinostaging.com',
          preview: 'Heads up — load-in call moved to 07:00. ETCP card required at check-in, steel toes on the deck...',
          date: '2026-09-28T15:45:00Z',
          isRead: false,
          hasAttachment: false,
          labels: ['work', 'urgent'],
          isGigRelated: true
        },
        {
          id: '3',
          subject: 'Payment Confirmation — Strike & Load-Out',
          sender: 'accounting@encore-us.com',
          preview: 'Your payout of $486.00 (incl. 2h OT) for the Ballroom C strike on Sept 24 has been processed...',
          date: '2026-09-26T09:15:00Z',
          isRead: true,
          hasAttachment: true,
          labels: ['finance'],
          isGigRelated: true
        },
        {
          id: '4',
          subject: 'New Call: LED Wall Tech Needed — Ballroom AV Build',
          sender: 'jobs@rhinostaging.com',
          preview: 'Based on your profile, we have a call at Convention Center Ballroom C that matches your skills...',
          date: '2026-09-25T14:20:00Z',
          isRead: false,
          hasAttachment: false,
          labels: ['work', 'opportunity'],
          isGigRelated: true
        },
        {
          id: '5',
          subject: 'IATSE Local — Monthly Bulletin',
          sender: 'bulletin@iatse-local.org',
          preview: 'Union hall updates, referral call announcements, and training dates for the month...',
          date: '2026-09-22T08:00:00Z',
          isRead: true,
          hasAttachment: false,
          labels: ['newsletter'],
          isGigRelated: false
        },
        {
          id: '6',
          subject: 'Pro Audio Trade-In Event — Gear Deals',
          sender: 'sales@liveprogear.com',
          preview: 'As a valued customer, we\'re offering 15% off wireless comms and tool belts this week...',
          date: '2026-09-20T11:30:00Z',
          isRead: true,
          hasAttachment: false,
          labels: ['promotions'],
          isGigRelated: false
        }
      ];
      
      setEmails(mockEmails);
      setLoading(false);
      setLastSynced(new Date());
    }, 1500);
  };

  const handleConnect = (connection: unknown) => {
    console.log('Gmail connected:', connection);
    setIsConnected(true);
    localStorage.setItem('gmail-connected', 'true');
    loadEmails();
    toast.success('Successfully connected to Gmail!');
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setEmails([]);
    localStorage.removeItem('gmail-connected');
    toast.success('Disconnected from Gmail');
  };

  const handleRefresh = () => {
    loadEmails();
    toast.success('Emails refreshed successfully');
  };

  const filteredEmails = emails.filter(email => 
    activeTab === 'all' || (activeTab === 'gig-related' && email.isGigRelated)
  );

  const unreadCount = emails.filter(email => !email.isRead).length;
  const gigRelatedCount = emails.filter(email => email.isGigRelated).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gmail Integration</h2>
          <p className="text-muted-foreground mt-2">
            Connect your Gmail account to automatically track gig-related emails
          </p>
        </div>
        {isConnected && (
          <div className="flex space-x-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleDisconnect} className="text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10">
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {/* Connection Status */}
      {!isConnected ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Mail className="h-12 w-12 text-muted-foreground/70 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Connect Your Gmail Account</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Connect your Gmail account to automatically import and categorize gig-related emails, track job offers, and never miss important communications.
              </p>
              
              <AuthKitButton 
                onConnectionSuccess={handleConnect}
                className="max-w-md mx-auto"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Email Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <Inbox className="h-8 w-8 text-primary" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Total Emails</p>
                    <p className="text-2xl font-bold">{emails.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <Calendar className="h-8 w-8 text-green-600 dark:text-green-400" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Gig Related</p>
                    <p className="text-2xl font-bold">{gigRelatedCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <Mail className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Unread</p>
                    <p className="text-2xl font-bold">{unreadCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <Clock className="h-8 w-8 text-secondary" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Last Synced</p>
                    <p className="text-sm font-medium">
                      {lastSynced ? lastSynced.toLocaleTimeString() : 'Never'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Email Tabs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Email Inbox</CardTitle>
                <div className="flex space-x-2">
                  <Button 
                    variant={activeTab === 'gig-related' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setActiveTab('gig-related')}
                  >
                    Gig Related ({gigRelatedCount})
                  </Button>
                  <Button 
                    variant={activeTab === 'all' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setActiveTab('all')}
                  >
                    All Emails ({emails.length})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredEmails.length > 0 ? (
                <div className="space-y-3">
                  {filteredEmails.map((email) => (
                    <div 
                      key={email.id} 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        email.isRead ? 'bg-card' : 'bg-primary/10 border-primary/30'
                      } hover:bg-muted/50`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center">
                            {!email.isRead && (
                              <div className="w-2 h-2 bg-primary rounded-full mr-2"></div>
                            )}
                            <h4 className={`font-medium ${email.isRead ? 'text-foreground/80' : 'text-foreground'}`}>
                              {email.subject}
                            </h4>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{email.sender}</p>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{email.preview}</p>
                          
                          <div className="flex items-center mt-2 space-x-2">
                            {email.isGigRelated && (
                              <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">Gig Related</Badge>
                            )}
                            {email.hasAttachment && (
                              <Badge variant="outline" className="text-xs">Attachment</Badge>
                            )}
                            {email.labels.map((label) => (
                              <Badge key={label} variant="secondary" className="text-xs">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                          {new Date(email.date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Mail className="h-12 w-12 text-muted-foreground/70 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No emails found</h3>
                  <p className="text-muted-foreground">
                    {activeTab === 'gig-related' 
                      ? "No gig-related emails found. Try switching to 'All Emails'."
                      : "Your inbox is empty."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-primary" />
                  Auto-Calendar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Automatically detect dates and times in emails and add them to your calendar.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Enable</span>
                  <Switch checked={true} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Star className="h-5 w-5 mr-2 text-yellow-500" />
                  Smart Filtering
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Automatically categorize emails as gig-related based on content and sender.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Enable</span>
                  <Switch checked={true} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Send className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
                  Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Get notified when you receive important gig-related emails.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Enable</span>
                  <Switch checked={true} />
                </div>
              </CardContent>
            </Card>
          </div>

        </>
      )}
    </div>
  );
};

export default GmailIntegration;