import { BaseAgent, MessageBus } from '../../services/BaseAgent';
import { AgentConfig, AgentTask, CredentialGraph, CredentialNode, ReputationScore } from '../../types';
import { supabase } from '@/lib/supabase';

export class CredentialGraphAgent extends BaseAgent {
  private messageBus: MessageBus;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    super(config);
    this.messageBus = messageBus;
  }

  protected registerMessageHandlers(): void {
    this.registerMessageHandler('update_credentials', async (message) => {
      const { workerId } = message.payload;
      await this.updateCredentialGraph(workerId);
    });

    this.registerMessageHandler('calculate_reputation', async (message) => {
      const { workerId } = message.payload;
      await this.calculateReputationScore(workerId);
    });
  }

  protected async processTask(task: AgentTask): Promise<any> {
    switch (task.type) {
      case 'build_graph':
        return await this.buildCredentialGraph(task.payload.workerId);

      case 'update_graph':
        return await this.updateCredentialGraph(task.payload.workerId);

      case 'calculate_reputation':
        return await this.calculateReputationScore(task.payload.workerId);

      case 'analyze_skill_progression':
        return await this.analyzeSkillProgression(task.payload.workerId);

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async buildCredentialGraph(workerId: string): Promise<CredentialGraph> {
    const nodes: CredentialNode[] = [];

    const { data: skills } = await supabase
      .from('worker_skills')
      .select('*, skill:skills(*)')
      .eq('worker_id', workerId);

    if (skills) {
      for (const ws of skills) {
        nodes.push({
          id: `skill_${ws.id}`,
          workerId,
          type: 'skill',
          name: ws.skill?.name || 'Unknown',
          verified: true,
          proficiencyLevel: ws.proficiency_level,
          relatedNodes: [],
          metadata: {
            yearsExperience: ws.years_experience,
            category: ws.skill?.category,
          },
        });
      }
    }

    const { data: certifications } = await supabase
      .from('certifications')
      .select('*')
      .eq('worker_id', workerId)
      .eq('is_active', true);

    if (certifications) {
      for (const cert of certifications) {
        nodes.push({
          id: `cert_${cert.id}`,
          workerId,
          type: 'certification',
          name: cert.name,
          verified: true,
          verificationDate: cert.issue_date,
          expiryDate: cert.expiration_date || undefined,
          relatedNodes: [],
          metadata: {
            issuingOrganization: cert.issuing_organization,
            credentialId: cert.credential_id,
          },
        });
      }
    }

    const { data: completedGigs } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', workerId)
      .eq('status', 'accepted')
      .limit(50);

    if (completedGigs) {
      const experienceMap = new Map<string, number>();

      for (const app of completedGigs) {
        if (app.gig?.skills_required) {
          for (const skill of app.gig.skills_required) {
            experienceMap.set(skill, (experienceMap.get(skill) || 0) + 1);
          }
        }
      }

      for (const [skill, count] of experienceMap.entries()) {
        if (count >= 3 && !nodes.find(n => n.name.toLowerCase() === skill.toLowerCase())) {
          nodes.push({
            id: `exp_${skill}`,
            workerId,
            type: 'experience',
            name: skill,
            verified: false,
            relatedNodes: [],
            metadata: {
              gigCount: count,
            },
          });
        }
      }
    }

    const edges = this.buildSkillRelationships(nodes);
    const reputationScore = await this.calculateReputationScore(workerId);

    const graph: CredentialGraph = {
      workerId,
      nodes,
      edges,
      reputationScore: reputationScore.overallScore,
      lastUpdated: new Date().toISOString(),
    };

    await supabase
      .from('credential_graphs')
      .upsert({
        worker_id: workerId,
        nodes: nodes as any,
        edges: edges as any,
        reputation_score: reputationScore.overallScore,
        last_updated: new Date().toISOString(),
      });

    return graph;
  }

  private async updateCredentialGraph(workerId: string): Promise<CredentialGraph> {
    return await this.buildCredentialGraph(workerId);
  }

  private buildSkillRelationships(nodes: CredentialNode[]): any[] {
    const edges: any[] = [];

    const skillRelationships: Record<string, string[]> = {
      'Camera Operation': ['Video Production', 'Photography', 'Lighting Design'],
      'Sound Engineering': ['Audio Mixing', 'Live Sound', 'Music Production'],
      'Lighting Design': ['Stage Design', 'Electrical', 'Camera Operation'],
      'Stage Management': ['Project Management', 'Coordination', 'Logistics'],
      'Video Production': ['Camera Operation', 'Editing', 'Directing'],
      'Event Coordination': ['Project Management', 'Communication', 'Logistics'],
    };

    for (const node of nodes) {
      if (node.type === 'skill') {
        const related = skillRelationships[node.name] || [];

        for (const relatedSkill of related) {
          const relatedNode = nodes.find(n => n.name === relatedSkill);
          if (relatedNode) {
            edges.push({
              source: node.id,
              target: relatedNode.id,
              relationship: 'related_to',
              strength: 0.7,
            });
          }
        }
      }

      if (node.type === 'certification') {
        const relatedSkills = nodes.filter(n =>
          n.type === 'skill' &&
          node.name.toLowerCase().includes(n.name.toLowerCase())
        );

        for (const skill of relatedSkills) {
          edges.push({
            source: node.id,
            target: skill.id,
            relationship: 'enhances',
            strength: 0.9,
          });
        }
      }

      if (node.type === 'experience' && node.proficiencyLevel && node.proficiencyLevel < 5) {
        const advancedCerts = nodes.filter(n =>
          n.type === 'certification' &&
          n.name.toLowerCase().includes(node.name.toLowerCase())
        );

        for (const cert of advancedCerts) {
          edges.push({
            source: node.id,
            target: cert.id,
            relationship: 'leads_to',
            strength: 0.8,
          });
        }
      }
    }

    return edges;
  }

  private async calculateReputationScore(workerId: string): Promise<ReputationScore> {
    const { data: applications } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', workerId);

    const totalGigs = applications?.filter(a => a.status === 'accepted').length || 0;
    const completedGigs = applications?.filter(a =>
      a.status === 'accepted' && a.gig?.status === 'completed'
    ).length || 0;

    const completionRate = totalGigs > 0 ? completedGigs / totalGigs : 0;

    const { data: profile } = await supabase
      .from('profiles')
      .select('average_rating, review_count')
      .eq('id', workerId)
      .single();

    const reviewAverage = profile?.average_rating || 0;

    const reliability = Math.min(1, (completedGigs / Math.max(10, completedGigs)) * completionRate);
    const skillQuality = (reviewAverage / 5);
    const communication = (reviewAverage / 5) * 0.9;
    const professionalism = (reviewAverage / 5) * 0.95;

    const onTimeRate = 0.85;

    const overallScore = (
      reliability * 0.25 +
      skillQuality * 0.25 +
      communication * 0.15 +
      professionalism * 0.15 +
      completionRate * 0.15 +
      onTimeRate * 0.05
    ) * 100;

    const recentGigs = applications?.slice(-10) || [];
    const recentCompletion = recentGigs.filter(a =>
      a.status === 'accepted' && a.gig?.status === 'completed'
    ).length / Math.max(recentGigs.length, 1);

    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (recentCompletion > completionRate + 0.1) trend = 'improving';
    else if (recentCompletion < completionRate - 0.1) trend = 'declining';

    const reputationScore: ReputationScore = {
      workerId,
      overallScore: Math.round(overallScore * 10) / 10,
      reliability: Math.round(reliability * 100),
      skillQuality: Math.round(skillQuality * 100),
      communication: Math.round(communication * 100),
      professionalism: Math.round(professionalism * 100),
      completionRate: Math.round(completionRate * 100),
      onTimeRate: Math.round(onTimeRate * 100),
      reviewAverage: Math.round(reviewAverage * 10) / 10,
      totalGigs,
      trend,
      lastUpdated: new Date().toISOString(),
    };

    await supabase
      .from('reputation_scores')
      .upsert({
        worker_id: workerId,
        ...reputationScore,
        last_updated: new Date().toISOString(),
      });

    return reputationScore;
  }

  private async analyzeSkillProgression(workerId: string): Promise<any> {
    const { data: graph } = await supabase
      .from('credential_graphs')
      .select('*')
      .eq('worker_id', workerId)
      .single();

    if (!graph) {
      return { recommendations: [] };
    }

    const nodes = graph.nodes as CredentialNode[];
    const skills = nodes.filter(n => n.type === 'skill');
    const certifications = nodes.filter(n => n.type === 'certification');

    const recommendations: string[] = [];

    for (const skill of skills) {
      if (skill.proficiencyLevel && skill.proficiencyLevel >= 4) {
        const hasCert = certifications.some(c =>
          c.name.toLowerCase().includes(skill.name.toLowerCase())
        );

        if (!hasCert) {
          recommendations.push(
            `Consider obtaining certification in ${skill.name} to enhance your credentials`
          );
        }
      }

      if (skill.proficiencyLevel && skill.proficiencyLevel < 3) {
        recommendations.push(
          `Focus on building experience in ${skill.name} to increase proficiency`
        );
      }
    }

    const totalSkills = skills.length;
    if (totalSkills < 5) {
      recommendations.push('Add more skills to your profile to increase visibility to companies');
    }

    return {
      recommendations,
      skillCount: totalSkills,
      certificationCount: certifications.length,
      progressScore: Math.min(100, (totalSkills * 10) + (certifications.length * 15)),
    };
  }

  protected getMessageBus(): MessageBus {
    return this.messageBus;
  }
}
