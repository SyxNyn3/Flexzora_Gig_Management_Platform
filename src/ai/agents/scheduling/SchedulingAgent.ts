import { BaseAgent, MessageBus } from '../../services/BaseAgent';
import { AgentConfig, AgentTask, ScheduleOptimization, ScheduleConflict, ScheduleRecommendation } from '../../types';
import { supabase } from '@/lib/supabase';
import { differenceInHours, parseISO } from 'date-fns';

export class SchedulingAgent extends BaseAgent {
  private messageBus: MessageBus;
  private readonly MIN_REST_HOURS = 8;
  private readonly MAX_HOURS_PER_WEEK = 60;
  private readonly BURNOUT_THRESHOLD_HOURS = 50;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    super(config);
    this.messageBus = messageBus;
  }

  protected registerMessageHandlers(): void {
    this.registerMessageHandler('detect_conflicts', async (message) => {
      const { workerId, gigId } = message.payload;
      await this.detectConflicts(workerId, gigId);
    });

    this.registerMessageHandler('optimize_schedule', async (message) => {
      const { workerId } = message.payload;
      await this.optimizeWorkerSchedule(workerId);
    });

    this.registerMessageHandler('check_burnout_risk', async (message) => {
      const { workerId } = message.payload;
      await this.checkBurnoutRisk(workerId);
    });
  }

  protected async processTask(task: AgentTask): Promise<any> {
    switch (task.type) {
      case 'detect_conflicts':
        return await this.detectConflicts(task.payload.workerId, task.payload.gigId);

      case 'optimize_schedule':
        return await this.optimizeWorkerSchedule(task.payload.workerId);

      case 'recommend_gigs':
        return await this.recommendGigsForWorker(task.payload.workerId);

      case 'check_burnout_risk':
        return await this.checkBurnoutRisk(task.payload.workerId);

      case 'calculate_rest_periods':
        return await this.calculateRestPeriods(task.payload.workerId);

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async detectConflicts(workerId: string, proposedGigId: string): Promise<ScheduleConflict[]> {
    const { data: proposedGig } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', proposedGigId)
      .single();

    if (!proposedGig) {
      throw new Error('Proposed gig not found');
    }

    const { data: acceptedGigs } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', workerId)
      .eq('status', 'accepted');

    const conflicts: ScheduleConflict[] = [];

    if (!acceptedGigs) {
      return conflicts;
    }

    const proposedStart = parseISO(proposedGig.start_date);
    const proposedEnd = parseISO(proposedGig.end_date);

    for (const app of acceptedGigs) {
      if (!app.gig) continue;

      const gigStart = parseISO(app.gig.start_date);
      const gigEnd = parseISO(app.gig.end_date);

      if (this.hasTimeOverlap(proposedStart, proposedEnd, gigStart, gigEnd)) {
        conflicts.push({
          type: 'double_booking',
          severity: 'critical',
          gigIds: [proposedGigId, app.gig.id],
          description: `Double booking detected with ${app.gig.title}`,
          suggestedResolution: 'Decline one of the conflicting gigs or negotiate time changes',
        });
      }

      const hoursBetween = this.calculateHoursBetween(gigEnd, proposedStart);
      if (hoursBetween > 0 && hoursBetween < this.MIN_REST_HOURS) {
        conflicts.push({
          type: 'insufficient_rest',
          severity: 'high',
          gigIds: [app.gig.id, proposedGigId],
          description: `Only ${hoursBetween.toFixed(1)} hours rest between gigs (minimum: ${this.MIN_REST_HOURS}h)`,
          suggestedResolution: 'Consider declining to ensure adequate rest',
        });
      }

      const travelTime = await this.estimateTravelTime(app.gig.location, proposedGig.location);
      if (travelTime > 0 && hoursBetween > 0 && hoursBetween < travelTime) {
        conflicts.push({
          type: 'travel_time',
          severity: 'high',
          gigIds: [app.gig.id, proposedGigId],
          description: `Insufficient time for travel (need ${travelTime}h, have ${hoursBetween.toFixed(1)}h)`,
          suggestedResolution: 'Leave earlier or decline one gig',
        });
      }
    }

    const weekHours = await this.calculateWeeklyHours(workerId, proposedStart);
    const gigHours = differenceInHours(proposedEnd, proposedStart);

    if (weekHours + gigHours > this.MAX_HOURS_PER_WEEK) {
      conflicts.push({
        type: 'burnout_risk',
        severity: 'medium',
        gigIds: [proposedGigId],
        description: `Adding this gig would result in ${weekHours + gigHours} hours this week (max: ${this.MAX_HOURS_PER_WEEK}h)`,
        suggestedResolution: 'Consider reducing workload to prevent burnout',
      });
    }

    return conflicts;
  }

  private async optimizeWorkerSchedule(workerId: string): Promise<ScheduleOptimization> {
    const { data: availableGigs } = await supabase
      .from('gigs')
      .select('*')
      .eq('status', 'published')
      .gte('start_date', new Date().toISOString());

    if (!availableGigs) {
      return {
        workerId,
        recommendations: [],
        conflicts: [],
        optimizationScore: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const { data: existingApplications } = await supabase
      .from('gig_applications')
      .select('gig_id')
      .eq('worker_id', workerId);

    const appliedGigIds = new Set(existingApplications?.map(a => a.gig_id) || []);

    const recommendations: ScheduleRecommendation[] = [];

    for (const gig of availableGigs) {
      if (appliedGigIds.has(gig.id)) continue;

      const conflicts = await this.detectConflicts(workerId, gig.id);

      if (conflicts.filter(c => c.severity === 'critical').length === 0) {
        const { data: matchScore } = await supabase
          .from('match_scores')
          .select('overall_score, reasoning')
          .eq('worker_id', workerId)
          .eq('gig_id', gig.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const score = matchScore?.overall_score || 50;
        const reasoning = matchScore?.reasoning || ['No match data available'];

        if (score > 60) {
          let travelTime = 0;
          let restTimeBefore = 0;

          const { data: previousGig } = await supabase
            .from('gig_applications')
            .select('*, gig:gigs(*)')
            .eq('worker_id', workerId)
            .eq('status', 'accepted')
            .lt('gig.end_date', gig.start_date)
            .order('gig.end_date', { ascending: false })
            .limit(1)
            .single();

          if (previousGig?.gig) {
            restTimeBefore = this.calculateHoursBetween(
              parseISO(previousGig.gig.end_date),
              parseISO(gig.start_date)
            );

            travelTime = await this.estimateTravelTime(
              previousGig.gig.location,
              gig.location
            );
          }

          recommendations.push({
            gigId: gig.id,
            score,
            reasoning: [...reasoning, ...conflicts.map(c => c.description)],
            estimatedTravelTime: travelTime,
            restTimeBefore,
          });
        }
      }
    }

    recommendations.sort((a, b) => b.score - a.score);

    const optimizationScore = this.calculateOptimizationScore(recommendations);

    return {
      workerId,
      recommendations: recommendations.slice(0, 10),
      conflicts: [],
      optimizationScore,
      timestamp: new Date().toISOString(),
    };
  }

  private async recommendGigsForWorker(workerId: string): Promise<ScheduleRecommendation[]> {
    const optimization = await this.optimizeWorkerSchedule(workerId);
    return optimization.recommendations;
  }

  private async checkBurnoutRisk(workerId: string): Promise<{
    risk: 'low' | 'medium' | 'high';
    weeklyHours: number;
    consecutiveDays: number;
    recommendations: string[];
  }> {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weeklyHours = await this.calculateWeeklyHours(workerId, weekStart);

    const { data: recentGigs } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', workerId)
      .eq('status', 'accepted')
      .gte('gig.start_date', weekStart.toISOString())
      .order('gig.start_date', { ascending: true });

    let consecutiveDays = 0;
    let currentStreak = 0;
    let lastDate: Date | null = null;

    if (recentGigs) {
      for (const app of recentGigs) {
        if (!app.gig) continue;

        const gigDate = parseISO(app.gig.start_date);

        if (lastDate) {
          const daysDiff = Math.floor((gigDate.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));

          if (daysDiff <= 1) {
            currentStreak++;
          } else {
            currentStreak = 1;
          }
        } else {
          currentStreak = 1;
        }

        consecutiveDays = Math.max(consecutiveDays, currentStreak);
        lastDate = gigDate;
      }
    }

    const recommendations: string[] = [];
    let risk: 'low' | 'medium' | 'high' = 'low';

    if (weeklyHours > this.BURNOUT_THRESHOLD_HOURS) {
      risk = 'high';
      recommendations.push('Consider reducing workload - you are working excessive hours');
      recommendations.push('Schedule at least one full rest day this week');
    } else if (weeklyHours > this.MAX_HOURS_PER_WEEK * 0.8) {
      risk = 'medium';
      recommendations.push('Monitor your workload - approaching maximum recommended hours');
    }

    if (consecutiveDays >= 7) {
      risk = 'high';
      recommendations.push('Take a break - you have worked 7+ consecutive days');
    } else if (consecutiveDays >= 5) {
      if (risk === 'low') risk = 'medium';
      recommendations.push('Consider scheduling a rest day soon');
    }

    if (risk === 'low') {
      recommendations.push('Your schedule looks healthy - keep up the balance!');
    }

    return {
      risk,
      weeklyHours,
      consecutiveDays,
      recommendations,
    };
  }

  private async calculateRestPeriods(workerId: string): Promise<any[]> {
    const { data: acceptedGigs } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', workerId)
      .eq('status', 'accepted')
      .order('gig.start_date', { ascending: true });

    const restPeriods: any[] = [];

    if (!acceptedGigs || acceptedGigs.length < 2) {
      return restPeriods;
    }

    for (let i = 0; i < acceptedGigs.length - 1; i++) {
      const current = acceptedGigs[i];
      const next = acceptedGigs[i + 1];

      if (!current.gig || !next.gig) continue;

      const restHours = this.calculateHoursBetween(
        parseISO(current.gig.end_date),
        parseISO(next.gig.start_date)
      );

      restPeriods.push({
        afterGig: current.gig.id,
        beforeGig: next.gig.id,
        restHours,
        adequate: restHours >= this.MIN_REST_HOURS,
      });
    }

    return restPeriods;
  }

  private hasTimeOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date
  ): boolean {
    return start1 < end2 && end1 > start2;
  }

  private calculateHoursBetween(end: Date, start: Date): number {
    return differenceInHours(start, end);
  }

  private async calculateWeeklyHours(workerId: string, weekDate: Date): Promise<number> {
    const weekStart = new Date(weekDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const { data: weekGigs } = await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', workerId)
      .eq('status', 'accepted')
      .gte('gig.start_date', weekStart.toISOString())
      .lt('gig.start_date', weekEnd.toISOString());

    let totalHours = 0;

    if (weekGigs) {
      for (const app of weekGigs) {
        if (!app.gig) continue;

        const hours = differenceInHours(
          parseISO(app.gig.end_date),
          parseISO(app.gig.start_date)
        );

        totalHours += hours;
      }
    }

    return totalHours;
  }

  private async estimateTravelTime(location1: string, location2: string): Promise<number> {
    if (!location1 || !location2) return 0;

    const loc1Lower = location1.toLowerCase();
    const loc2Lower = location2.toLowerCase();

    if (loc1Lower.includes(loc2Lower) || loc2Lower.includes(loc1Lower)) {
      return 0.5;
    }

    const loc1Parts = loc1Lower.split(',');
    const loc2Parts = loc2Lower.split(',');

    if (loc1Parts[loc1Parts.length - 1]?.trim() === loc2Parts[loc2Parts.length - 1]?.trim()) {
      return 1.5;
    }

    return 3;
  }

  private calculateOptimizationScore(recommendations: ScheduleRecommendation[]): number {
    if (recommendations.length === 0) return 0;

    const avgScore = recommendations.reduce((sum, r) => sum + r.score, 0) / recommendations.length;
    const count = Math.min(10, recommendations.length) * 10;

    return Math.round((avgScore * 0.7 + count * 0.3) * 10) / 10;
  }

  protected getMessageBus(): MessageBus {
    return this.messageBus;
  }
}
