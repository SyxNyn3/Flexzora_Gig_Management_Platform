/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic AI agent payloads/ML plumbing */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Brain, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Clock, Navigation, Shield, Award, Zap } from 'lucide-react';

interface AIInsight {
  type: 'match' | 'schedule' | 'reputation' | 'route' | 'fraud';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'success';
  actionable: boolean;
  action?: () => void;
  actionLabel?: string;
}

const AIInsightsDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentStates, setAgentStates] = useState<any>(null);

  useEffect(() => {
    if (profile) {
      loadAIInsights();
      loadAgentStates();
    }
  }, [profile]);

  const loadAIInsights = async () => {
    if (!profile) return;

    const newInsights: AIInsight[] = [];

    const { data: reputationScore } = await supabase
      .from('reputation_scores')
      .select('*')
      .eq('worker_id', profile.id)
      .single();

    if (reputationScore) {
      newInsights.push({
        type: 'reputation',
        title: 'Reputation Score Updated',
        description: `Your overall score is ${reputationScore.overall_score}/100 (${reputationScore.trend})`,
        severity: reputationScore.overall_score > 75 ? 'success' : 'info',
        actionable: false,
      });
    }

    const { data: matchScores } = await supabase
      .from('match_scores')
      .select('*, gig:gigs(*)')
      .eq('worker_id', profile.id)
      .gte('overall_score', 70)
      .order('overall_score', { ascending: false })
      .limit(3);

    if (matchScores && matchScores.length > 0) {
      newInsights.push({
        type: 'match',
        title: `${matchScores.length} High-Match Gigs Found`,
        description: `AI found ${matchScores.length} gigs that match your skills and availability`,
        severity: 'success',
        actionable: true,
        action: () => window.location.href = '/gigs',
        actionLabel: 'View Gigs',
      });
    }

    const { data: fraudSignals } = await supabase
      .from('fraud_signals')
      .select('*')
      .eq('entity_id', profile.id)
      .eq('entity_type', 'worker')
      .eq('investigated', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fraudSignals && fraudSignals.length > 0) {
      const signal = fraudSignals[0];
      newInsights.push({
        type: 'fraud',
        title: 'Security Alert',
        description: signal.indicators[0] || 'Unusual activity detected',
        severity: 'warning',
        actionable: true,
        action: () => console.log('Review security alert'),
        actionLabel: 'Review',
      });
    }

    const { data: routeOptimizations } = await supabase
      .from('route_optimizations')
      .select('*, gig:gigs(title)')
      .eq('worker_id', profile.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (routeOptimizations && routeOptimizations.length > 0) {
      const route = routeOptimizations[0];
      newInsights.push({
        type: 'route',
        title: 'Route Optimized',
        description: `Leave in ${route.estimated_travel_time} min with ${route.traffic_conditions} traffic`,
        severity: 'info',
        actionable: false,
      });
    }

    setInsights(newInsights);
    setLoading(false);
  };

  const loadAgentStates = async () => {
    const { data } = await supabase
      .from('agent_states')
      .select('*')
      .in('status', ['idle', 'processing']);

    if (data) {
      const states: any = {};
      data.forEach(agent => {
        states[agent.agent_id] = agent;
      });
      setAgentStates(states);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
      default:
        return <Brain className="h-5 w-5 text-primary" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'match':
        return <Zap className="h-4 w-4" />;
      case 'schedule':
        return <Clock className="h-4 w-4" />;
      case 'reputation':
        return <Award className="h-4 w-4" />;
      case 'route':
        return <Navigation className="h-4 w-4" />;
      case 'fraud':
        return <Shield className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Brain className="h-6 w-6 text-primary" />
            <CardTitle>AI Insights</CardTitle>
          </div>
          <CardDescription>
            Powered by intelligent agents analyzing your activity in real-time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {insights.length === 0 ? (
            <Alert>
              <Brain className="h-4 w-4" />
              <AlertDescription>
                AI agents are analyzing your data. Check back soon for personalized insights.
              </AlertDescription>
            </Alert>
          ) : (
            insights.map((insight, index) => (
              <Alert key={index} className="border-l-4" style={{
                borderLeftColor: insight.severity === 'success' ? '#10b981' :
                                 insight.severity === 'warning' ? '#f59e0b' : '#3b82f6'
              }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    {getSeverityIcon(insight.severity)}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {getTypeIcon(insight.type)}
                        <h4 className="font-semibold">{insight.title}</h4>
                      </div>
                      <AlertDescription>{insight.description}</AlertDescription>
                    </div>
                  </div>
                  {insight.actionable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={insight.action}
                    >
                      {insight.actionLabel}
                    </Button>
                  )}
                </div>
              </Alert>
            ))
          )}
        </CardContent>
      </Card>

      {agentStates && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI Agent Status</CardTitle>
            <CardDescription>Current state of intelligent agents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.values(agentStates).map((agent: any) => (
                <div key={agent.agent_id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium truncate">
                      {agent.agent_id.replace(/_/g, ' ').replace(/agent/i, '').trim()}
                    </span>
                    <Badge
                      variant={agent.status === 'processing' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {agent.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {agent.success_count} tasks completed
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AIInsightsDashboard;
