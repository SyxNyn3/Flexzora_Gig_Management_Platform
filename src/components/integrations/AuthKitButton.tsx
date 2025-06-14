import React, { useState } from 'react';
import { useAuthKit } from '@picahq/authkit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, CheckCircle, AlertCircle, ExternalLink, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { isDemoMode } from '@/lib/supabase';

interface AuthKitButtonProps {
  onConnectionSuccess?: (connection: any) => void;
  className?: string;
}

export function AuthKitButton({ onConnectionSuccess, className = "" }: AuthKitButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);

  const { open } = useAuthKit({
    token: {
      url: `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/authkit-token`,
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
    },
    onSuccess: (connection) => {
      console.log("Connected:", connection);
      setConnections(prev => [...prev, connection]);
      setIsConnecting(false);
      toast.success(`Successfully connected to ${connection.provider || 'service'}!`);
      onConnectionSuccess?.(connection);
    },
    onError: (error) => {
      console.error("AuthKit error:", error);
      setIsConnecting(false);
      toast.error(`Connection failed: ${error.message || 'Unknown error'}`);
    },
    onClose: () => {
      console.log("AuthKit UI closed");
      setIsConnecting(false);
    },
  });

  const handleConnect = () => {
    if (isDemoMode) {
      // Demo mode simulation
      setIsConnecting(true);
      setTimeout(() => {
        const mockConnection = {
          id: Date.now().toString(),
          provider: 'Demo Service',
          status: 'connected',
          connectedAt: new Date().toISOString()
        };
        setConnections(prev => [...prev, mockConnection]);
        setIsConnecting(false);
        toast.success('Demo connection successful!');
        onConnectionSuccess?.(mockConnection);
      }, 2000);
      return;
    }

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
            <Zap className="h-5 w-5 mr-2 text-blue-600" />
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
              <h4 className="font-medium text-sm text-gray-700">Connected Services</h4>
              {connections.map((connection) => (
                <div key={connection.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">{connection.provider}</p>
                      <p className="text-sm text-green-700">
                        Connected {new Date(connection.connectedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-green-700 border-green-300">
                    Active
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Demo Mode Notice */}
          {isDemoMode && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <p className="text-sm text-blue-800">
                  <strong>Demo Mode:</strong> This will simulate connecting to external services
                </p>
              </div>
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
          <div className="pt-4 border-t border-gray-200">
            <h4 className="font-medium text-sm text-gray-700 mb-3">Available Integrations</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Google Calendar', icon: '📅' },
                { name: 'Slack', icon: '💬' },
                { name: 'Trello', icon: '📋' },
                { name: 'Notion', icon: '📝' },
                { name: 'Zapier', icon: '⚡' },
                { name: 'Airtable', icon: '🗃️' }
              ].map((service) => (
                <div key={service.name} className="flex items-center space-x-2 p-2 bg-gray-50 rounded text-sm">
                  <span>{service.icon}</span>
                  <span className="text-gray-700">{service.name}</span>
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
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700"
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