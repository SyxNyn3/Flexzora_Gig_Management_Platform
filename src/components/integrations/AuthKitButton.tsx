import { useState } from 'react';
import { useAuthKit } from '@picahq/authkit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, CheckCircle, ExternalLink, Zap } from 'lucide-react';
import { toast } from 'sonner';

export interface AuthKitConnection {
  id?: string;
  _id?: string;
  name?: string;
  provider?: string;
  platform?: string;
  connectedAt?: string;
}

interface AuthKitButtonProps {
  onConnectionSuccess?: (connection: AuthKitConnection) => void;
  className?: string;
}

export function AuthKitButton({ onConnectionSuccess, className = "" }: AuthKitButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connections, setConnections] = useState<AuthKitConnection[]>([]);
  const isDemoMode = !import.meta.env.VITE_SUPABASE_URL;

  const { open } = useAuthKit({
    token: {
      url: `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/authkit-token`,
      headers: isDemoMode ? {} : {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
    },
    onSuccess: (connection) => {
      console.log("Connected:", connection);
      setConnections(prev => [...prev, connection]);
      setIsConnecting(false);
      toast.success(`Successfully connected to ${connection.platform || connection.name || 'service'}!`);
      onConnectionSuccess?.(connection);
    },
    onError: (error) => {
      console.error("AuthKit error:", error);
      setIsConnecting(false);
      toast.error(`Connection failed: ${error || 'Unknown error'}`);
    },
    onClose: () => {
      console.log("AuthKit UI closed");
      setIsConnecting(false);
    },
  });

  const handleConnect = () => {
    setIsConnecting(true);
    try {
      open();
    } catch (error) {
      console.error('Failed to open AuthKit:', error);
      setIsConnecting(false);
      toast.error('Failed to open connection dialog');
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Zap className="h-5 w-5 mr-2 text-primary" />
            External Tool Connections
          </CardTitle>
          <CardDescription>
            Connect your external tools and services to sync data automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          {connections.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-foreground">Connected Services</h4>
              {connections.map((connection) => (
                <div key={connection.id ?? connection._id} className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="font-medium text-green-900">{connection.provider}</p>
                      <p className="text-sm text-emerald-500">
                        Connected {connection.connectedAt ? new Date(connection.connectedAt).toLocaleDateString() : 'recently'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-green-300">
                    Active
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Connect Button */}
          <Button 
            onClick={handleConnect} 
            disabled={isConnecting}
            className="w-full transition-all duration-300 transform hover:scale-105"
          >
            {isConnecting ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Connecting...
              </div>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Connect New Tool
              </>
            )}
          </Button>

          {/* Available Integrations Preview */}
          <div className="pt-4 border-t border-border">
            <h4 className="font-medium text-sm text-foreground mb-3">Available Integrations</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Google Calendar', icon: '📅' },
                { name: 'Slack', icon: '💬' },
                { name: 'Trello', icon: '📋' },
                { name: 'Notion', icon: '📝' },
                { name: 'Zapier', icon: '⚡' },
                { name: 'Airtable', icon: '🗃️' }
              ].map((service) => (
                <div key={service.name} className="flex items-center space-x-2 p-2 bg-muted/40 rounded text-sm">
                  <span>{service.icon}</span>
                  <span className="text-foreground">{service.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Learn More Link */}
          <div className="text-center pt-2">
            <a 
              href="https://docs.pica.com/authkit" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-primary hover:text-primary"
            >
              Learn more about integrations
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}