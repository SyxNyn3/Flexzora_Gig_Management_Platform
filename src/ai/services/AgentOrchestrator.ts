/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic AI agent payloads/ML plumbing */
import { BaseAgent, InMemoryMessageBus, MessageBus } from './BaseAgent';
import { AgentTask, AgentMessage } from '../types';

export class AgentOrchestrator {
  private agents: Map<string, BaseAgent> = new Map();
  private messageBus: MessageBus;
  private taskQueue: AgentTask[] = [];
  private isProcessing: boolean = false;

  constructor() {
    this.messageBus = new InMemoryMessageBus();
  }

  registerAgent(agent: BaseAgent): void {
    const config = agent.getConfig();
    this.agents.set(config.id, agent);

    this.messageBus.subscribe(config.id, async (message: AgentMessage) => {
      await agent.handleMessage(message);
    });

    console.log(`Agent registered: ${config.name} (${config.id})`);
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.messageBus.unsubscribe(agentId);
    console.log(`Agent unregistered: ${agentId}`);
  }

  async submitTask(task: AgentTask): Promise<string> {
    this.taskQueue.push(task);
    console.log(`Task submitted: ${task.id} for agent ${task.agentId}`);

    if (!this.isProcessing) {
      this.processQueue();
    }

    return task.id;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.taskQueue.length > 0) {
      const sortedTasks = this.taskQueue.sort((a, b) => b.priority - a.priority);
      const task = sortedTasks.shift()!;
      this.taskQueue = sortedTasks;

      await this.executeTask(task);
    }

    this.isProcessing = false;
  }

  private async executeTask(task: AgentTask): Promise<void> {
    const agent = this.agents.get(task.agentId);

    if (!agent) {
      console.error(`Agent not found: ${task.agentId}`);
      task.status = 'failed';
      task.error = 'Agent not found';
      return;
    }

    task.status = 'processing';
    task.startedAt = new Date().toISOString();

    try {
      const result = await agent.execute(task);

      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date().toISOString();

      console.log(`Task completed: ${task.id}`);
    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date().toISOString();

      console.error(`Task failed: ${task.id}`, error);
    }
  }

  async broadcastMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: AgentMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date().toISOString(),
    };

    await this.messageBus.publish(fullMessage);
  }

  getAgent(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getAgentStates(): Record<string, any> {
    const states: Record<string, any> = {};

    this.agents.forEach((agent, id) => {
      states[id] = agent.getState();
    });

    return states;
  }

  getPendingTasks(): AgentTask[] {
    return this.taskQueue.filter(task => task.status === 'pending');
  }

  getQueueLength(): number {
    return this.taskQueue.length;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  shutdown(): void {
    this.agents.forEach((_agent, id) => {
      this.unregisterAgent(id);
    });

    this.taskQueue = [];
    this.isProcessing = false;

    console.log('AgentOrchestrator shutdown complete');
  }
}

export const orchestrator = new AgentOrchestrator();
