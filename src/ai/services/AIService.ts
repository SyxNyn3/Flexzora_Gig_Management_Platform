import { AgentOrchestrator, orchestrator } from './AgentOrchestrator';
import { InMemoryMessageBus } from './BaseAgent';
import { CredentialGraphAgent } from '../agents/matching/CredentialGraphAgent';
import { SmartMatchingAgent } from '../agents/matching/SmartMatchingAgent';
import { SchedulingAgent } from '../agents/scheduling/SchedulingAgent';
import { FraudDetectionAgent } from '../agents/verification/FraudDetectionAgent';
import { RouteOptimizationAgent } from '../agents/routing/RouteOptimizationAgent';
import { AgentTask } from '../types';

export class AIService {
  private orchestrator: AgentOrchestrator;
  private messageBus: InMemoryMessageBus;
  private initialized: boolean = false;

  constructor() {
    this.orchestrator = orchestrator;
    this.messageBus = new InMemoryMessageBus();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const credentialGraphAgent = new CredentialGraphAgent(
      {
        id: 'credential_graph_agent',
        name: 'Credential Graph Agent',
        type: 'matching',
        enabled: true,
        priority: 5,
        maxRetries: 3,
        timeoutMs: 10000,
      },
      this.messageBus
    );

    const matchingAgent = new SmartMatchingAgent(
      {
        id: 'smart_matching_agent',
        name: 'Smart Matching Agent',
        type: 'matching',
        enabled: true,
        priority: 8,
        maxRetries: 3,
        timeoutMs: 15000,
      },
      this.messageBus
    );

    const schedulingAgent = new SchedulingAgent(
      {
        id: 'scheduling_agent',
        name: 'Scheduling Agent',
        type: 'scheduling',
        enabled: true,
        priority: 9,
        maxRetries: 2,
        timeoutMs: 10000,
      },
      this.messageBus
    );

    const fraudDetectionAgent = new FraudDetectionAgent(
      {
        id: 'fraud_detection_agent',
        name: 'Fraud Detection Agent',
        type: 'fraud_detection',
        enabled: true,
        priority: 10,
        maxRetries: 2,
        timeoutMs: 8000,
      },
      this.messageBus
    );

    const routeOptimizationAgent = new RouteOptimizationAgent(
      {
        id: 'route_optimization_agent',
        name: 'Route Optimization Agent',
        type: 'routing',
        enabled: true,
        priority: 6,
        maxRetries: 3,
        timeoutMs: 12000,
      },
      this.messageBus
    );

    this.orchestrator.registerAgent(credentialGraphAgent);
    this.orchestrator.registerAgent(matchingAgent);
    this.orchestrator.registerAgent(schedulingAgent);
    this.orchestrator.registerAgent(fraudDetectionAgent);
    this.orchestrator.registerAgent(routeOptimizationAgent);

    this.initialized = true;
    console.log('AI Service initialized with 5 agents');
  }

  async matchWorkersForGig(gigId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'smart_matching_agent',
      type: 'match_workers_for_gig',
      priority: 8,
      payload: { gigId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async calculateMatchScore(workerId: string, gigId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'smart_matching_agent',
      type: 'calculate_match_score',
      priority: 7,
      payload: { workerId, gigId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async detectScheduleConflicts(workerId: string, gigId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'scheduling_agent',
      type: 'detect_conflicts',
      priority: 9,
      payload: { workerId, gigId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async optimizeWorkerSchedule(workerId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'scheduling_agent',
      type: 'optimize_schedule',
      priority: 7,
      payload: { workerId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async checkBurnoutRisk(workerId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'scheduling_agent',
      type: 'check_burnout_risk',
      priority: 8,
      payload: { workerId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async updateCredentialGraph(workerId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'credential_graph_agent',
      type: 'update_graph',
      priority: 5,
      payload: { workerId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async calculateReputationScore(workerId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'credential_graph_agent',
      type: 'calculate_reputation',
      priority: 6,
      payload: { workerId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async checkApplicationFraud(applicationId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'fraud_detection_agent',
      type: 'check_application',
      priority: 10,
      payload: { applicationId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async checkProfileFraud(profileId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'fraud_detection_agent',
      type: 'check_profile',
      priority: 9,
      payload: { profileId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async optimizeRoute(workerId: string, gigId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'route_optimization_agent',
      type: 'optimize_route',
      priority: 7,
      payload: { workerId, gigId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  async calculateDepartureTime(workerId: string, gigId: string): Promise<string> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentId: 'route_optimization_agent',
      type: 'calculate_departure_time',
      priority: 6,
      payload: { workerId, gigId },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.orchestrator.submitTask(task);
  }

  getAgentStates(): Record<string, any> {
    return this.orchestrator.getAgentStates();
  }

  getPendingTasksCount(): number {
    return this.orchestrator.getQueueLength();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  shutdown(): void {
    this.orchestrator.shutdown();
    this.initialized = false;
  }
}

export const aiService = new AIService();
