export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  enabled: boolean;
  priority: number;
  maxRetries: number;
  timeoutMs: number;
  metadata?: Record<string, any>;
}

export type AgentType =
  | 'scheduling'
  | 'matching'
  | 'verification'
  | 'fraud_detection'
  | 'routing'
  | 'support'
  | 'onboarding';

export type AgentStatus = 'idle' | 'processing' | 'error' | 'disabled';

export interface AgentState {
  agentId: string;
  status: AgentStatus;
  lastRun?: string;
  lastError?: string;
  successCount: number;
  errorCount: number;
  averageProcessingTimeMs: number;
  metadata?: Record<string, any>;
}

export interface AgentMessage {
  id: string;
  sourceAgentId: string;
  targetAgentId?: string;
  type: MessageType;
  payload: any;
  timestamp: string;
  priority: number;
  requiresResponse: boolean;
  correlationId?: string;
}

export type MessageType =
  | 'task'
  | 'query'
  | 'response'
  | 'notification'
  | 'error'
  | 'heartbeat';

export interface AgentTask {
  id: string;
  agentId: string;
  type: string;
  priority: number;
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: any;
}

export interface MLModelMetadata {
  id: string;
  name: string;
  version: string;
  type: MLModelType;
  status: 'training' | 'deployed' | 'deprecated';
  accuracy?: number;
  performanceMetrics?: Record<string, number>;
  trainingDate: string;
  lastEvaluatedAt?: string;
  inputSchema: any;
  outputSchema: any;
  hyperparameters?: Record<string, any>;
}

export type MLModelType =
  | 'classification'
  | 'regression'
  | 'ranking'
  | 'reinforcement_learning'
  | 'embedding'
  | 'llm';

export interface CredentialNode {
  id: string;
  workerId: string;
  type: 'skill' | 'certification' | 'experience' | 'education';
  name: string;
  verified: boolean;
  verificationDate?: string;
  expiryDate?: string;
  proficiencyLevel?: number;
  relatedNodes: string[];
  metadata?: Record<string, any>;
  embedding?: number[];
}

export interface CredentialGraph {
  workerId: string;
  nodes: CredentialNode[];
  edges: CredentialEdge[];
  reputationScore: number;
  lastUpdated: string;
}

export interface CredentialEdge {
  source: string;
  target: string;
  relationship: 'requires' | 'enhances' | 'related_to' | 'leads_to';
  strength: number;
}

export interface MatchScore {
  workerId: string;
  gigId: string;
  overallScore: number;
  skillMatchScore: number;
  availabilityScore: number;
  locationScore: number;
  reputationScore: number;
  historicalSuccessScore: number;
  confidence: number;
  reasoning: string[];
  timestamp: string;
}

export interface ScheduleOptimization {
  workerId: string;
  recommendations: ScheduleRecommendation[];
  conflicts: ScheduleConflict[];
  optimizationScore: number;
  timestamp: string;
}

export interface ScheduleRecommendation {
  gigId: string;
  score: number;
  reasoning: string[];
  estimatedTravelTime?: number;
  restTimeBefore?: number;
  restTimeAfter?: number;
}

export interface ScheduleConflict {
  type: 'double_booking' | 'insufficient_rest' | 'travel_time' | 'burnout_risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  gigIds: string[];
  description: string;
  suggestedResolution?: string;
}

export interface FraudSignal {
  type: 'credential_fraud' | 'application_fraud' | 'review_fraud' | 'payment_fraud';
  entityId: string;
  entityType: 'worker' | 'company' | 'gig' | 'application';
  severity: number;
  confidence: number;
  indicators: string[];
  timestamp: string;
  requiresAction: boolean;
}

export interface RouteOptimization {
  workerId: string;
  gigId: string;
  origin: Location;
  destination: Location;
  recommendedDepartureTime: string;
  estimatedTravelTime: number;
  route: RouteSegment[];
  alternatives: RouteAlternative[];
  trafficConditions: 'light' | 'moderate' | 'heavy';
  weatherImpact?: 'none' | 'minor' | 'moderate' | 'severe';
}

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  placeId?: string;
}

export interface RouteSegment {
  instruction: string;
  distance: number;
  duration: number;
  mode: 'driving' | 'walking' | 'transit';
}

export interface RouteAlternative {
  description: string;
  travelTime: number;
  estimatedCost?: number;
  carbonFootprint?: number;
}

export interface ConversationContext {
  userId: string;
  sessionId: string;
  messages: ConversationMessage[];
  intent?: string;
  entities?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ReputationScore {
  workerId: string;
  overallScore: number;
  reliability: number;
  skillQuality: number;
  communication: number;
  professionalism: number;
  completionRate: number;
  onTimeRate: number;
  reviewAverage: number;
  totalGigs: number;
  lastUpdated: string;
  trend: 'improving' | 'stable' | 'declining';
}

export interface TrainingData {
  id: string;
  modelType: MLModelType;
  features: Record<string, any>;
  label: any;
  weight?: number;
  timestamp: string;
  source: string;
}

export interface ReinforcementLearningState {
  state: any;
  action: any;
  reward: number;
  nextState: any;
  done: boolean;
  timestamp: string;
  episodeId: string;
}

export interface AgentDecision {
  agentId: string;
  decisionType: string;
  input: any;
  output: any;
  confidence: number;
  reasoning: string[];
  timestamp: string;
  performanceMetrics?: Record<string, number>;
}
