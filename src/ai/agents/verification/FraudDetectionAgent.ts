import { BaseAgent, MessageBus } from '../../services/BaseAgent';
import { AgentConfig, AgentTask, FraudSignal } from '../../types';
import { supabase } from '@/lib/supabase';

export class FraudDetectionAgent extends BaseAgent {
  private messageBus: MessageBus;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    super(config);
    this.messageBus = messageBus;
  }

  protected registerMessageHandlers(): void {
    this.registerMessageHandler('check_application', async (message) => {
      const { applicationId } = message.payload;
      await this.checkApplication(applicationId);
    });

    this.registerMessageHandler('check_profile', async (message) => {
      const { profileId} = message.payload;
      await this.checkProfile(profileId);
    });
  }

  protected async processTask(task: AgentTask): Promise<any> {
    switch (task.type) {
      case 'check_application':
        return await this.checkApplication(task.payload.applicationId);

      case 'check_profile':
        return await this.checkProfile(task.payload.profileId);

      case 'analyze_review_patterns':
        return await this.analyzeReviewPatterns(task.payload.workerId);

      case 'detect_credential_fraud':
        return await this.detectCredentialFraud(task.payload.workerId);

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async checkApplication(applicationId: string): Promise<FraudSignal[]> {
    const { data: application } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*), worker:profiles(*)')
      .eq('id', applicationId)
      .single();

    if (!application) {
      throw new Error('Application not found');
    }

    const signals: FraudSignal[] = [];

    const recentApplications = await this.getRecentApplications(
      application.worker_id,
      24
    );

    if (recentApplications > 50) {
      signals.push({
        type: 'application_fraud',
        entityId: applicationId,
        entityType: 'application',
        severity: 0.8,
        confidence: 0.9,
        indicators: [
          `Submitted ${recentApplications} applications in 24 hours`,
          'Mass application pattern detected',
        ],
        timestamp: new Date().toISOString(),
        requiresAction: true,
      });
    }

    if (application.cover_letter) {
      const suspiciousPatterns = this.detectSuspiciousText(application.cover_letter);

      if (suspiciousPatterns.length > 0) {
        signals.push({
          type: 'application_fraud',
          entityId: applicationId,
          entityType: 'application',
          severity: 0.5,
          confidence: 0.6,
          indicators: suspiciousPatterns,
          timestamp: new Date().toISOString(),
          requiresAction: false,
        });
      }
    }

    for (const signal of signals) {
      await this.recordFraudSignal(signal);
    }

    return signals;
  }

  private async checkProfile(profileId: string): Promise<FraudSignal[]> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (!profile) {
      throw new Error('Profile not found');
    }

    const signals: FraudSignal[] = [];

    const { data: workerSkills } = await supabase
      .from('worker_skills')
      .select('*')
      .eq('worker_id', profileId);

    if (workerSkills && workerSkills.length > 20) {
      const expertSkills = workerSkills.filter(ws => ws.proficiency_level >= 4);

      if (expertSkills.length > 10) {
        signals.push({
          type: 'credential_fraud',
          entityId: profileId,
          entityType: 'worker',
          severity: 0.6,
          confidence: 0.7,
          indicators: [
            `Claims expert level in ${expertSkills.length} skills`,
            'Unrealistic skill claims detected',
          ],
          timestamp: new Date().toISOString(),
          requiresAction: false,
        });
      }
    }

    if (profile.experience_years && profile.experience_years > 50) {
      signals.push({
        type: 'credential_fraud',
        entityId: profileId,
        entityType: 'worker',
        severity: 0.9,
        confidence: 0.95,
        indicators: ['Reported more than 50 years of experience'],
        timestamp: new Date().toISOString(),
        requiresAction: true,
      });
    }

    if (profile.bio) {
      const suspiciousPatterns = this.detectSuspiciousText(profile.bio);

      if (suspiciousPatterns.length > 0) {
        signals.push({
          type: 'credential_fraud',
          entityId: profileId,
          entityType: 'worker',
          severity: 0.4,
          confidence: 0.5,
          indicators: suspiciousPatterns,
          timestamp: new Date().toISOString(),
          requiresAction: false,
        });
      }
    }

    for (const signal of signals) {
      await this.recordFraudSignal(signal);
    }

    return signals;
  }

  private async analyzeReviewPatterns(workerId: string): Promise<FraudSignal[]> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('average_rating, review_count')
      .eq('id', workerId)
      .single();

    if (!profile || !profile.review_count) {
      return [];
    }

    const signals: FraudSignal[] = [];

    if (profile.review_count > 5 && profile.average_rating === 5.0) {
      signals.push({
        type: 'review_fraud',
        entityId: workerId,
        entityType: 'worker',
        severity: 0.6,
        confidence: 0.5,
        indicators: [
          'Perfect 5.0 rating with multiple reviews',
          'Possible review manipulation',
        ],
        timestamp: new Date().toISOString(),
        requiresAction: false,
      });
    }

    const { data: gigs } = await supabase
      .from('gig_applications')
      .select('created_at')
      .eq('worker_id', workerId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: true });

    if (gigs && gigs.length >= 5) {
      const firstGig = new Date(gigs[0].created_at);
      const accountAge = (Date.now() - firstGig.getTime()) / (1000 * 60 * 60 * 24);

      if (accountAge < 30 && profile.review_count > 15) {
        signals.push({
          type: 'review_fraud',
          entityId: workerId,
          entityType: 'worker',
          severity: 0.7,
          confidence: 0.8,
          indicators: [
            `${profile.review_count} reviews in ${accountAge.toFixed(0)} days`,
            'Suspiciously rapid review accumulation',
          ],
          timestamp: new Date().toISOString(),
          requiresAction: true,
        });
      }
    }

    for (const signal of signals) {
      await this.recordFraudSignal(signal);
    }

    return signals;
  }

  private async detectCredentialFraud(workerId: string): Promise<FraudSignal[]> {
    const signals: FraudSignal[] = [];

    const { data: certifications } = await supabase
      .from('certifications')
      .select('*')
      .eq('worker_id', workerId);

    if (certifications) {
      for (const cert of certifications) {
        if (cert.expiration_date && new Date(cert.expiration_date) < new Date()) {
          signals.push({
            type: 'credential_fraud',
            entityId: cert.id,
            entityType: 'worker',
            severity: 0.7,
            confidence: 0.95,
            indicators: [
              `Certification "${cert.name}" is expired`,
              'Using expired credentials',
            ],
            timestamp: new Date().toISOString(),
            requiresAction: true,
          });
        }

        if (cert.issue_date && cert.expiration_date) {
          const issueDate = new Date(cert.issue_date);
          const expirationDate = new Date(cert.expiration_date);

          if (issueDate > expirationDate) {
            signals.push({
              type: 'credential_fraud',
              entityId: cert.id,
              entityType: 'worker',
              severity: 0.9,
              confidence: 1.0,
              indicators: [
                'Issue date is after expiration date',
                'Invalid certification dates',
              ],
              timestamp: new Date().toISOString(),
              requiresAction: true,
            });
          }
        }
      }
    }

    const { data: graph } = await supabase
      .from('credential_graphs')
      .select('nodes')
      .eq('worker_id', workerId)
      .single();

    if (graph?.nodes) {
      const unverifiedCount = (graph.nodes as any[]).filter(n => !n.verified).length;
      const totalCount = (graph.nodes as any[]).length;

      if (totalCount > 5 && unverifiedCount / totalCount > 0.7) {
        signals.push({
          type: 'credential_fraud',
          entityId: workerId,
          entityType: 'worker',
          severity: 0.5,
          confidence: 0.6,
          indicators: [
            `${unverifiedCount} of ${totalCount} credentials unverified`,
            'High percentage of unverified credentials',
          ],
          timestamp: new Date().toISOString(),
          requiresAction: false,
        });
      }
    }

    for (const signal of signals) {
      await this.recordFraudSignal(signal);
    }

    return signals;
  }

  private async getRecentApplications(workerId: string, hours: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const { count } = await supabase
      .from('gig_applications')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .gte('application_date', cutoffDate.toISOString());

    return count || 0;
  }

  private detectSuspiciousText(text: string): string[] {
    const indicators: string[] = [];

    const suspiciousPatterns = [
      { pattern: /\b(100%|guaranteed|perfect|best ever)\b/gi, message: 'Contains exaggerated claims' },
      { pattern: /\b(urgent|act now|limited time)\b/gi, message: 'Contains urgency language' },
      { pattern: /(.)\1{4,}/g, message: 'Contains excessive repeated characters' },
      { pattern: /[A-Z]{10,}/g, message: 'Contains excessive capitalization' },
      { pattern: /\$\d{4,}/g, message: 'Contains large monetary amounts' },
    ];

    for (const { pattern, message } of suspiciousPatterns) {
      if (pattern.test(text)) {
        indicators.push(message);
      }
    }

    const words = text.split(/\s+/);
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));

    if (words.length > 50 && uniqueWords.size / words.length < 0.3) {
      indicators.push('Text contains excessive repetition');
    }

    return indicators;
  }

  private async recordFraudSignal(signal: FraudSignal): Promise<void> {
    await supabase.from('fraud_signals').insert({
      signal_type: signal.type,
      entity_id: signal.entityId,
      entity_type: signal.entityType,
      severity: signal.severity,
      confidence: signal.confidence,
      indicators: signal.indicators,
      requires_action: signal.requiresAction,
    });

    if (signal.requiresAction && signal.severity > 0.7) {
      await supabase.from('notifications').insert({
        user_id: signal.entityId,
        title: 'Security Alert',
        message: `Fraud detection system flagged: ${signal.indicators[0]}`,
        type: 'security',
        read: false,
      });
    }
  }

  protected getMessageBus(): MessageBus {
    return this.messageBus;
  }
}
