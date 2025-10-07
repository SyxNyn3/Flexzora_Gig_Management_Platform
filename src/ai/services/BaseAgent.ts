import { AgentConfig, AgentState, AgentTask, AgentMessage } from '../types';

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected state: AgentState;
  protected messageHandlers: Map<string, (message: AgentMessage) => Promise<void>>;

  constructor(config: AgentConfig) {
    this.config = config;
    this.state = {
      agentId: config.id,
      status: 'idle',
      successCount: 0,
      errorCount: 0,
      averageProcessingTimeMs: 0,
    };
    this.messageHandlers = new Map();
    this.registerMessageHandlers();
  }

  protected abstract registerMessageHandlers(): void;
  protected abstract processTask(task: AgentTask): Promise<any>;

  async execute(task: AgentTask): Promise<any> {
    if (!this.config.enabled) {
      throw new Error(`Agent ${this.config.id} is disabled`);
    }

    const startTime = Date.now();
    this.state.status = 'processing';

    try {
      const result = await this.executeWithRetry(task);

      this.state.successCount++;
      this.updateAverageProcessingTime(Date.now() - startTime);
      this.state.status = 'idle';
      this.state.lastRun = new Date().toISOString();

      return result;
    } catch (error: any) {
      this.state.errorCount++;
      this.state.status = 'error';
      this.state.lastError = error.message;
      this.state.lastRun = new Date().toISOString();

      throw error;
    }
  }

  private async executeWithRetry(task: AgentTask): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await Promise.race([
          this.processTask(task),
          this.createTimeout(this.config.timeoutMs),
        ]);
      } catch (error: any) {
        lastError = error;

        if (attempt < this.config.maxRetries) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('Task execution failed');
  }

  async handleMessage(message: AgentMessage): Promise<void> {
    const handler = this.messageHandlers.get(message.type);

    if (!handler) {
      console.warn(`No handler registered for message type: ${message.type}`);
      return;
    }

    try {
      await handler(message);
    } catch (error: any) {
      console.error(`Error handling message ${message.id}:`, error);
      throw error;
    }
  }

  protected registerMessageHandler(
    type: string,
    handler: (message: AgentMessage) => Promise<void>
  ): void {
    this.messageHandlers.set(type, handler);
  }

  protected async sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: AgentMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date().toISOString(),
    };

    await this.getMessageBus().publish(fullMessage);
  }

  protected abstract getMessageBus(): MessageBus;

  getState(): AgentState {
    return { ...this.state };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  enable(): void {
    this.config.enabled = true;
  }

  disable(): void {
    this.config.enabled = false;
    this.state.status = 'disabled';
  }

  private updateAverageProcessingTime(processingTime: number): void {
    const totalTime = this.state.averageProcessingTimeMs * this.state.successCount;
    this.state.averageProcessingTimeMs = (totalTime + processingTime) / (this.state.successCount + 1);
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Task timeout after ${ms}ms`)), ms);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export interface MessageBus {
  publish(message: AgentMessage): Promise<void>;
  subscribe(agentId: string, handler: (message: AgentMessage) => Promise<void>): void;
  unsubscribe(agentId: string): void;
}

export class InMemoryMessageBus implements MessageBus {
  private subscribers: Map<string, (message: AgentMessage) => Promise<void>> = new Map();

  async publish(message: AgentMessage): Promise<void> {
    if (message.targetAgentId) {
      const handler = this.subscribers.get(message.targetAgentId);
      if (handler) {
        await handler(message);
      }
    } else {
      const promises = Array.from(this.subscribers.values()).map(handler => handler(message));
      await Promise.all(promises);
    }
  }

  subscribe(agentId: string, handler: (message: AgentMessage) => Promise<void>): void {
    this.subscribers.set(agentId, handler);
  }

  unsubscribe(agentId: string): void {
    this.subscribers.delete(agentId);
  }
}

export { BaseAgent }