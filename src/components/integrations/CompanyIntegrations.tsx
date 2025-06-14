import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AuthKitButton } from './AuthKitButton';
import { Building2, Plus, Link, CheckCircle, AlertCircle, FolderSync as Sync, Settings, Users, Calendar, DollarSign, MessageSquare, Upload, Download, Wifi, WifiOff, Star, Shield } from 'lucide-react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';

interface CompanyIntegration {
  id: string;
  company_name: string;
  company_logo?: string;
  integration_type: 'api' | 'email' | 'manual' | 'oauth';
  status: 'connected' | 'pending' | 'error' | 'disconnected';
  features: {
    scheduling: boolean;
    payroll: boolean;
    messaging: boolean;
    documents: boolean;
    time_tracking: boolean;
  };
  last_sync: string;
  worker_id: string;
  credentials?: any;
  settings: {
    auto_sync: boolean;
    notifications: boolean;
    conflict_detection: boolean;
  };
  stats: {
    total_gigs: number;
    pending_payments: number;
    unread_messages: number;
  };
}

// Major production companies data
const PRODUCTION_COMPANIES = [
  {
    name: 'Rhino Staging',
    description: 'National event production staffing for corporate, entertainment, and industrial events',
    logo: '🦏',
    integration_type: 'api',
    features: ['scheduling', 'payroll', 'messaging', 'documents'],
    website: 'rhinostaging.com'
  },
  {
    name: 'Giglife',
    description: 'Nationwide event staffing and management for venues, AV, and live entertainment',
    logo: '🎵',
    integration_type: 'oauth',
    features: ['scheduling', 'messaging', 'time_tracking'],
    website: 'giglife.com'
  },
  {
    name: '24/7 Production',
    description: 'Las Vegas-based event production, full-service for special events',
    logo: '🎰',
    integration_type: 'email',
    features: ['scheduling', 'payroll', 'documents'],
    website: '247production.com'
  },
  {
    name: 'PCE (Pacific Coast)',
    description: 'Live event production, equipment, and personnel for concerts and large-scale events',
    logo: '🌊',
    integration_type: 'api',
    features: ['scheduling', 'payroll', 'messaging', 'time_tracking'],
    website: 'pce.com'
  },
  {
    name: 'Crew One Productions',
    description: 'Technical staffing for events/festivals in major US cities',
    logo: '🎪',
    integration_type: 'manual',
    features: ['scheduling', 'documents'],
    website: 'crewone.com'
  },
  {
    name: 'Onstage Systems',
    description: 'Event production, AV, and concert management, serving music and corporate clients',
    logo: '🎤',
    integration_type: 'oauth',
    features: ['scheduling', 'payroll', 'messaging'],
    website: 'onstagesystems.com'
  },
  {
    name: 'Stagehands, Inc.',
    description: 'Stagehand staffing, payroll, and compliance for theatrical and event venues',
    logo: '🎭',
    integration_type: 'api',
    features: ['scheduling', 'payroll', 'messaging', 'documents', 'time_tracking'],
    website: 'stagehands.com'
  },
  {
    name: 'G2 Production',
    description: 'Full-service production company for corporate events and entertainment',
    logo: '⚡',
    integration_type: 'email',
    features: ['scheduling', 'payroll', 'messaging'],
    website: 'g2production.com'
  }
];

const CompanyIntegrations: React.FC = () => {
  const { profile } = useAuth();
  const [integrations, setIntegrations] = useState<CompanyIntegration[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [integrationType, setIntegrationType] = useState<string>('');
  const [credentials, setCredentials] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('connected');

  useEffect(() => {
    loadMockIntegrations();
  }, []);

  const loadMockIntegrations = () => {
    const mockIntegrations: CompanyIntegration[] = [
      {
        id: '1',
        company_name: 'Rhino Staging',
        company_logo: '🦏',
        integration_type: 'api',
        status: 'connected',
        features: {
          scheduling: true,
          payroll: true,
          messaging: true,
          documents: true,
          time_tracking: false
        },
        last_sync: new Date().toISOString(),
        worker_id: profile?.id || 'demo',
        settings: {
          auto_sync: true,
          notifications: true,
          conflict_detection: true
        },
        stats: {
          total_gigs: 15,
          pending_payments: 2800,
          unread_messages: 3
        }
      },
      {
        id: '2',
        company_name: 'Giglife',
        company_logo: '🎵',
        integration_type: 'oauth',
        status: 'connected',
        features: {
          scheduling: true,
          payroll: false,
          messaging: true,
          documents: false,
          time_tracking: true
        },
        last_sync: new Date(Date.now() - 3600000).toISOString(),
        worker_id: profile?.id || 'demo',
        settings: {
          auto_sync: true,
          notifications: true,
          conflict_detection: true
        },
        stats: {
          total_gigs: 8,
          pending_payments: 0,
          unread_messages: 1
        }
      },
      {
        id: '3',
        company_name: 'Stagehands, Inc.',
        company_logo: '🎭',
        integration_type: 'api',
        status: 'error',
        features: {
          scheduling: true,
          payroll: true,
          messaging: true,
          documents: true,
          time_tracking: true
        },
        last_sync: new Date(Date.now() - 86400000).toISOString(),
        worker_id: profile?.id || 'demo',
        settings: {
          auto_sync: false,
          notifications: true,
          conflict_detection: true
        },
        stats: {
          total_gigs: 22,
          pending_payments: 4500,
          unread_messages: 0
        }
      }
    ];

    setIntegrations(mockIntegrations);
  };

  const addIntegration = async () => {
    if (!selectedCompany) {
      toast.error('Please select a company');
      return;
    }

    setLoading(true);
    try {
      const company = PRODUCTION_COMPANIES.find(c => c.name === selectedCompany);
      if (!company) return;

      const newIntegration: CompanyIntegration = {
        id: Date.now().toString(),
        company_name: company.name,
        company_logo: company.logo,
        integration_type: company.integration_type as any,
        status: 'pending',
        features: {
          scheduling: company.features.includes('scheduling'),
          payroll: company.features.includes('payroll'),
          messaging: company.features.includes('messaging'),
          documents: company.features.includes('documents'),
          time_tracking: company.features.includes('time_tracking')
        },
        last_sync: new Date().toISOString(),
        worker_id: profile?.id || 'demo',
        credentials,
        settings: {
          auto_sync: true,
          notifications: true,
          conflict_detection: true
        },
        stats: {
          total_gigs: 0,
          pending_payments: 0,
          unread_messages: 0
        }
      };

      setIntegrations(prev => [...prev, newIntegration]);
      setShowAddDialog(false);
      resetForm();
      
      // Simulate connection process
      setTimeout(() => {
        setIntegrations(prev => prev.map(integration => 
          integration.id === newIntegration.id 
            ? { ...integration, status: 'connected' as const }
            : integration
        ));
        toast.success(`Successfully connected to ${company.name}!`);
      }, 2000);

      toast.info(`Connecting to ${company.name}...`);
    } catch (error) {
      toast.error('Failed to add integration');
    } finally {
      setLoading(false);
    }
  };

  const syncIntegration = async (integrationId: string) => {
    setIntegrations(prev => prev.map(integration => 
      integration.id === integrationId 
        ? { ...integration, last_sync: new Date().toISOString() }
        : integration
    ));
    toast.success('Integration synced successfully!');
  };

  const toggleIntegrationSetting = (integrationId: string, setting: string, value: boolean) => {
    setIntegrations(prev => prev.map(integration => 
      integration.id === integrationId 
        ? { 
            ...integration, 
            settings: { ...integration.settings, [setting]: value }
          }
        : integration
    ));
  };

  const resetForm = () => {
    setSelectedCompany('');
    setIntegrationType('');
    setCredentials({});
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'disconnected': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <Wifi className="h-4 w-4" />;
      case 'pending': return <Sync className="h-4 w-4 animate-spin" />;
      case 'error': return <WifiOff className="h-4 w-4" />;
      case 'disconnected': return <WifiOff className="h-4 w-4" />;
      default: return <WifiOff className="h-4 w-4" />;
    }
  };

  const connectedIntegrations = integrations.filter(i => i.status === 'connected');
  const pendingIntegrations = integrations.filter(i => i.status === 'pending');
  const errorIntegrations = integrations.filter(i => i.status === 'error');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Company Integrations</h1>
            <p className="text-gray-600 mt-2">
              Connect with production companies to manage all your gigs in one place
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Connected Companies</p>
                <p className="text-2xl font-bold">{connectedIntegrations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Gigs</p>
                <p className="text-2xl font-bold">
                  {connectedIntegrations.reduce((sum, i) => sum + i.stats.total_gigs, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending Payments</p>
                <p className="text-2xl font-bold">
                  ${connectedIntegrations.reduce((sum, i) => sum + i.stats.pending_payments, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <MessageSquare className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Unread Messages</p>
                <p className="text-2xl font-bold">
                  {connectedIntegrations.reduce((sum, i) => sum + i.stats.unread_messages, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Integrations Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="connected">
            Connected ({connectedIntegrations.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({pendingIntegrations.length})
          </TabsTrigger>
          <TabsTrigger value="errors">
            Errors ({errorIntegrations.length})
          </TabsTrigger>
          <TabsTrigger value="available">
            Available Companies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connected" className="space-y-4">
          {connectedIntegrations.length > 0 ? (
            connectedIntegrations.map((integration) => (
              <Card key={integration.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl">{integration.company_logo}</div>
                      <div>
                        <CardTitle>{integration.company_name}</CardTitle>
                        <CardDescription>
                          Last synced: {new Date(integration.last_sync).toLocaleString()}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(integration.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(integration.status)}
                          {integration.status}
                        </span>
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncIntegration(integration.id)}
                      >
                        <Sync className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Features */}
                    <div>
                      <h4 className="font-medium mb-3">Available Features</h4>
                      <div className="space-y-2">
                        {Object.entries(integration.features).map(([feature, enabled]) => (
                          <div key={feature} className="flex items-center justify-between">
                            <span className="text-sm capitalize">{feature.replace('_', ' ')}</span>
                            {enabled ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <div className="h-4 w-4 rounded-full bg-gray-200"></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    <div>
                      <h4 className="font-medium mb-3">Statistics</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Total Gigs:</span>
                          <span className="font-medium">{integration.stats.total_gigs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pending Payments:</span>
                          <span className="font-medium">${integration.stats.pending_payments.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Unread Messages:</span>
                          <span className="font-medium">{integration.stats.unread_messages}</span>
                        </div>
                      </div>
                    </div>

                    {/* Settings */}
                    <div>
                      <h4 className="font-medium mb-3">Settings</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Auto Sync</span>
                          <Switch
                            checked={integration.settings.auto_sync}
                            onCheckedChange={(checked) => 
                              toggleIntegrationSetting(integration.id, 'auto_sync', checked)
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Notifications</span>
                          <Switch
                            checked={integration.settings.notifications}
                            onCheckedChange={(checked) => 
                              toggleIntegrationSetting(integration.id, 'notifications', checked)
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Conflict Detection</span>
                          <Switch
                            checked={integration.settings.conflict_detection}
                            onCheckedChange={(checked) => 
                              toggleIntegrationSetting(integration.id, 'conflict_detection', checked)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Connected Companies</h3>
                <p className="text-gray-600 mb-4">
                  Connect with production companies to start managing all your gigs in one place.
                </p>
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Company
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {pendingIntegrations.map((integration) => (
            <Card key={integration.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{integration.company_logo}</div>
                    <div>
                      <h3 className="font-medium">{integration.company_name}</h3>
                      <p className="text-sm text-gray-600">Connection in progress...</p>
                    </div>
                  </div>
                  <Badge className={getStatusColor(integration.status)}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(integration.status)}
                      {integration.status}
                    </span>
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          {errorIntegrations.map((integration) => (
            <Card key={integration.id} className="border-red-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{integration.company_logo}</div>
                    <div>
                      <h3 className="font-medium">{integration.company_name}</h3>
                      <p className="text-sm text-red-600">Connection error - credentials may be invalid</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(integration.status)}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(integration.status)}
                        {integration.status}
                      </span>
                    </Badge>
                    <Button size="sm" variant="outline">
                      Reconnect
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PRODUCTION_COMPANIES.filter(company => 
              !integrations.some(integration => integration.company_name === company.name)
            ).map((company) => (
              <Card key={company.name} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{company.logo}</div>
                    <div>
                      <CardTitle className="text-lg">{company.name}</CardTitle>
                      <CardDescription>{company.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Available Features</h4>
                      <div className="flex flex-wrap gap-2">
                        {company.features.map((feature) => (
                          <Badge key={feature} variant="outline" className="text-xs">
                            {feature.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">
                          {company.integration_type.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-gray-500">{company.website}</span>
                      </div>
                      <Button 
                        size="sm"
                        onClick={() => {
                          setSelectedCompany(company.name);
                          setIntegrationType(company.integration_type);
                          setShowAddDialog(true);
                        }}
                      >
                        <Link className="h-4 w-4 mr-1" />
                        Connect
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* AuthKit Integration Section */}
      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Email & Calendar Integrations</CardTitle>
            <CardDescription>
              Connect your email and calendar services to streamline your workflow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="text-2xl">📧</div>
                  <div>
                    <h3 className="font-medium">Gmail Integration</h3>
                    <p className="text-sm text-gray-600">Sync emails, detect gig offers, and manage communications</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigate('/integrations/gmail')}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Manage Gmail Integration
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="text-2xl">🗓️</div>
                  <div>
                    <h3 className="font-medium">Google Calendar</h3>
                    <p className="text-sm text-gray-600">Sync your gigs with Google Calendar automatically</p>
                  </div>
                </div>
                <AuthKitButton 
                  onConnectionSuccess={(connection) => {
                    console.log('Calendar connection established:', connection);
                    toast.success('Google Calendar connected successfully!');
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Other Integrations</CardTitle>
            <CardDescription>
              Connect additional tools and services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuthKitButton 
              onConnectionSuccess={(connection) => {
                console.log('New connection established:', connection);
                toast.success(`Connected to ${connection.provider || 'service'} successfully!`);
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Add Integration Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Connect to Production Company</DialogTitle>
            <DialogDescription>
              Add a new company integration to manage your gigs centrally
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="company">Company</Label>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCTION_COMPANIES.filter(company => 
                    !integrations.some(integration => integration.company_name === company.name)
                  ).map((company) => (
                    <SelectItem key={company.name} value={company.name}>
                      <div className="flex items-center space-x-2">
                        <span>{company.logo}</span>
                        <span>{company.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCompany && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Integration Type: {integrationType?.toUpperCase()}</h4>
                <div className="text-sm text-blue-800">
                  {integrationType === 'api' && (
                    <div className="space-y-2">
                      <p>Direct API integration provides real-time sync of:</p>
                      <ul className="list-disc list-inside ml-4">
                        <li>Schedule updates</li>
                        <li>Payment information</li>
                        <li>Messages and notifications</li>
                        <li>Time tracking data</li>
                      </ul>
                    </div>
                  )}
                  {integrationType === 'oauth' && (
                    <p>Secure OAuth connection will redirect you to {selectedCompany} to authorize access.</p>
                  )}
                  {integrationType === 'email' && (
                    <p>Email integration will parse job offers and updates from your email automatically.</p>
                  )}
                  {integrationType === 'manual' && (
                    <p>Manual integration allows you to upload schedules and documents manually.</p>
                  )}
                </div>
              </div>
            )}

            {integrationType === 'api' && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="api_key">API Key</Label>
                  <Input
                    id="api_key"
                    type="password"
                    placeholder="Enter your API key"
                    value={credentials.api_key || ''}
                    onChange={(e) => setCredentials({...credentials, api_key: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="worker_id">Worker ID</Label>
                  <Input
                    id="worker_id"
                    placeholder="Your worker ID in their system"
                    value={credentials.worker_id || ''}
                    onChange={(e) => setCredentials({...credentials, worker_id: e.target.value})}
                  />
                </div>
              </div>
            )}

            {integrationType === 'email' && (
              <div>
                <Label htmlFor="email">Company Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="notifications@company.com"
                  value={credentials.email || ''}
                  onChange={(e) => setCredentials({...credentials, email: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">
                  We'll monitor emails from this address for job updates
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addIntegration} disabled={loading || !selectedCompany}>
              {loading ? 'Connecting...' : 'Connect Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompanyIntegrations;