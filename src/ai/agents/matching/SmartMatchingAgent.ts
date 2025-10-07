import { BaseAgent, MessageBus } from '../../services/BaseAgent';
import { AgentConfig, AgentTask, MatchScore } from '../../types';
import { supabase } from '@/lib/supabase';

export class SmartMatchingAgent extends BaseAgent {
  private messageBus: MessageBus;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    super(config);
    this.messageBus = messageBus;
  }

  protected registerMessageHandlers(): void {
    this.registerMessageHandler('match_workers', async (message) => {
      const { gigId } = message.payload;
      await this.matchWorkersForGig(gigId);
    });

    this.registerMessageHandler('calculate_match_score', async (message) => {
      const { workerId, gigId } = message.payload;
      await this.calculateMatchScore(workerId, gigId);
    });
  }

  protected async processTask(task: AgentTask): Promise<any> {
    switch (task.type) {
      case 'match_workers_for_gig':
        return await this.matchWorkersForGig(task.payload.gigId);

      case 'calculate_match_score':
        return await this.calculateMatchScore(task.payload.workerId, task.payload.gigId);

      case 'get_recommended_workers':
        return await this.getRecommendedWorkers(task.payload.gigId, task.payload.limit);

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async matchWorkersForGig(gigId: string): Promise<MatchScore[]> {
    const { data: gig } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', gigId)
      .single();

    if (!gig) {
      throw new Error('Gig not found');
    }

    const { data: allWorkers } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'worker')
      .eq('is_available', true);

    if (!allWorkers) {
      return [];
    }

    const matchScores: MatchScore[] = [];

    for (const worker of allWorkers) {
      const score = await this.calculateMatchScore(worker.id, gigId);
      matchScores.push(score);
    }

    matchScores.sort((a, b) => b.overallScore - a.overallScore);

    for (const score of matchScores) {
      await supabase
        .from('match_scores')
        .insert({
          worker_id: score.workerId,
          gig_id: score.gigId,
          overall_score: score.overallScore,
          skill_match_score: score.skillMatchScore,
          availability_score: score.availabilityScore,
          location_score: score.locationScore,
          reputation_score: score.reputationScore,
          historical_success_score: score.historicalSuccessScore,
          confidence: score.confidence,
          reasoning: score.reasoning,
        });
    }

    return matchScores;
  }

  private async calculateMatchScore(workerId: string, gigId: string): Promise<MatchScore> {
    const [skillScore, availabilityScore, locationScore, reputationScore, historicalScore] = await Promise.all([
      this.calculateSkillMatchScore(workerId, gigId),
      this.calculateAvailabilityScore(workerId, gigId),
      this.calculateLocationScore(workerId, gigId),
      this.getReputationScore(workerId),
      this.calculateHistoricalSuccessScore(workerId, gigId),
    ]);

    const reasoning: string[] = [];

    if (skillScore > 80) reasoning.push('Excellent skill match');
    else if (skillScore > 60) reasoning.push('Good skill match');
    else if (skillScore < 40) reasoning.push('Limited skill match');

    if (availabilityScore === 100) reasoning.push('Fully available during gig period');
    else if (availabilityScore === 0) reasoning.push('Schedule conflict detected');

    if (locationScore > 80) reasoning.push('Close proximity to location');
    else if (locationScore < 50) reasoning.push('Requires significant travel');

    if (reputationScore > 80) reasoning.push('High reputation score');
    else if (reputationScore < 50) reasoning.push('Building reputation');

    if (historicalScore > 80) reasoning.push('Strong history with similar gigs');

    const weights = {
      skill: 0.35,
      availability: 0.25,
      location: 0.15,
      reputation: 0.15,
      historical: 0.10,
    };

    const overallScore =
      skillScore * weights.skill +
      availabilityScore * weights.availability +
      locationScore * weights.location +
      reputationScore * weights.reputation +
      historicalScore * weights.historical;

    const confidence = this.calculateConfidence({
      skillScore,
      availabilityScore,
      reputationScore,
      historicalScore,
    });

    const matchScore: MatchScore = {
      workerId,
      gigId,
      overallScore: Math.round(overallScore * 10) / 10,
      skillMatchScore: Math.round(skillScore * 10) / 10,
      availabilityScore: Math.round(availabilityScore * 10) / 10,
      locationScore: Math.round(locationScore * 10) / 10,
      reputationScore: Math.round(reputationScore * 10) / 10,
      historicalSuccessScore: Math.round(historicalScore * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      reasoning,
      timestamp: new Date().toISOString(),
    };

    return matchScore;
  }

  private async calculateSkillMatchScore(workerId: string, gigId: string): Promise<number> {
    const { data: gig } = await supabase
      .from('gigs')
      .select('skills_required')
      .eq('id', gigId)
      .single();

    if (!gig || !gig.skills_required || gig.skills_required.length === 0) {
      return 50;
    }

    const { data: workerSkills } = await supabase
      .from('worker_skills')
      .select('*, skill:skills(*)')
      .eq('worker_id', workerId);

    if (!workerSkills || workerSkills.length === 0) {
      return 0;
    }

    const requiredSkills = gig.skills_required.map((s: string) => s.toLowerCase());

    let matchedSkills = 0;
    let totalProficiency = 0;

    for (const required of requiredSkills) {
      const matchedSkill = workerSkills.find(ws =>
        ws.skill?.name.toLowerCase() === required
      );

      if (matchedSkill) {
        matchedSkills++;
        totalProficiency += matchedSkill.proficiency_level;
      }
    }

    if (matchedSkills === 0) {
      return 0;
    }

    const coverageScore = (matchedSkills / requiredSkills.length) * 100;
    const proficiencyScore = (totalProficiency / (matchedSkills * 5)) * 100;

    return (coverageScore * 0.7) + (proficiencyScore * 0.3);
  }

  private async calculateAvailabilityScore(workerId: string, gigId: string): Promise<number> {
    const { data: gig } = await supabase
      .from('gigs')
      .select('start_date, end_date')
      .eq('id', gigId)
      .single();

    if (!gig) {
      return 0;
    }

    const { data: conflictingApplications } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', workerId)
      .eq('status', 'accepted')
      .or(`start_date.lte.${gig.end_date},end_date.gte.${gig.start_date}`);

    if (conflictingApplications && conflictingApplications.length > 0) {
      return 0;
    }

    return 100;
  }

  private async calculateLocationScore(workerId: string, gigId: string): Promise<number> {
    const { data: worker } = await supabase
      .from('profiles')
      .select('location')
      .eq('id', workerId)
      .single();

    const { data: gig } = await supabase
      .from('gigs')
      .select('location')
      .eq('id', gigId)
      .single();

    if (!worker?.location || !gig?.location) {
      return 50;
    }

    const workerLocation = worker.location.toLowerCase();
    const gigLocation = gig.location.toLowerCase();

    if (workerLocation.includes(gigLocation) || gigLocation.includes(workerLocation)) {
      return 100;
    }

    const workerParts = workerLocation.split(',');
    const gigParts = gigLocation.split(',');

    if (workerParts[workerParts.length - 1]?.trim() === gigParts[gigParts.length - 1]?.trim()) {
      return 75;
    }

    return 30;
  }

  private async getReputationScore(workerId: string): Promise<number> {
    const { data: reputation } = await supabase
      .from('reputation_scores')
      .select('overall_score')
      .eq('worker_id', workerId)
      .single();

    return reputation?.overall_score || 50;
  }

  private async calculateHistoricalSuccessScore(workerId: string, gigId: string): Promise<number> {
    const { data: gig } = await supabase
      .from('gigs')
      .select('skills_required, company_id')
      .eq('id', gigId)
      .single();

    if (!gig) {
      return 50;
    }

    const { data: pastApplications } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', workerId)
      .eq('status', 'accepted');

    if (!pastApplications || pastApplications.length === 0) {
      return 50;
    }

    let sameCompanyCount = 0;
    let similarSkillsCount = 0;
    let completedCount = 0;

    for (const app of pastApplications) {
      if (app.gig?.company_id === gig.company_id) {
        sameCompanyCount++;
      }

      if (app.gig?.status === 'completed') {
        completedCount++;
      }

      if (app.gig?.skills_required) {
        const overlap = app.gig.skills_required.some((s: string) =>
          gig.skills_required?.includes(s)
        );

        if (overlap) {
          similarSkillsCount++;
        }
      }
    }

    const totalGigs = pastApplications.length;
    const completionRate = completedCount / totalGigs;
    const companyFamiliarityScore = Math.min(1, sameCompanyCount / 5) * 100;
    const skillFamiliarityScore = Math.min(1, similarSkillsCount / 10) * 100;

    return (
      completionRate * 40 +
      companyFamiliarityScore * 30 +
      skillFamiliarityScore * 30
    );
  }

  private calculateConfidence(scores: {
    skillScore: number;
    availabilityScore: number;
    reputationScore: number;
    historicalScore: number;
  }): number {
    const variance = Math.sqrt(
      Object.values(scores).reduce((sum, score) => {
        const mean = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
        return sum + Math.pow(score - mean, 2);
      }, 0) / Object.values(scores).length
    );

    const consistency = Math.max(0, 1 - (variance / 100));

    if (scores.availabilityScore === 0) {
      return 0.3;
    }

    return Math.min(1, consistency * 0.7 + 0.3);
  }

  private async getRecommendedWorkers(gigId: string, limit: number = 10): Promise<MatchScore[]> {
    const { data: scores } = await supabase
      .from('match_scores')
      .select('*')
      .eq('gig_id', gigId)
      .order('overall_score', { ascending: false })
      .limit(limit);

    return scores as MatchScore[] || [];
  }

  protected getMessageBus(): MessageBus {
    return this.messageBus;
  }
}
