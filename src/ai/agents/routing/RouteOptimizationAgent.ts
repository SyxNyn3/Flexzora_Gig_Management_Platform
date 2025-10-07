import { BaseAgent, MessageBus } from '../../services/BaseAgent';
import { AgentConfig, AgentTask, RouteOptimization, Location, RouteAlternative } from '../../types';
import { supabase } from '@/lib/supabase';
import { addMinutes, subMinutes, parseISO } from 'date-fns';

export class RouteOptimizationAgent extends BaseAgent {
  private messageBus: MessageBus;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    super(config);
    this.messageBus = messageBus;
  }

  protected registerMessageHandlers(): void {
    this.registerMessageHandler('optimize_route', async (message) => {
      const { workerId, gigId } = message.payload;
      await this.optimizeRoute(workerId, gigId);
    });

    this.registerMessageHandler('update_route', async (message) => {
      const { optimizationId } = message.payload;
      await this.updateRouteWithRealTimeData(optimizationId);
    });
  }

  protected async processTask(task: AgentTask): Promise<any> {
    switch (task.type) {
      case 'optimize_route':
        return await this.optimizeRoute(task.payload.workerId, task.payload.gigId);

      case 'calculate_departure_time':
        return await this.calculateOptimalDepartureTime(task.payload.workerId, task.payload.gigId);

      case 'get_route_alternatives':
        return await this.getRouteAlternatives(task.payload.origin, task.payload.destination);

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async optimizeRoute(workerId: string, gigId: string): Promise<RouteOptimization> {
    const { data: gig } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', gigId)
      .single();

    if (!gig) {
      throw new Error('Gig not found');
    }

    const { data: worker } = await supabase
      .from('profiles')
      .select('location')
      .eq('id', workerId)
      .single();

    if (!worker || !worker.location) {
      throw new Error('Worker location not found');
    }

    const origin = this.parseLocation(worker.location);
    const destination = this.parseLocation(gig.location);

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
      origin.address = previousGig.gig.location;
    }

    const travelTime = this.estimateTravelTime(origin, destination);
    const trafficConditions = this.predictTrafficConditions(parseISO(gig.start_date));
    const weatherImpact = await this.assessWeatherImpact(destination, parseISO(gig.start_date));

    let adjustedTravelTime = travelTime;
    if (trafficConditions === 'heavy') {
      adjustedTravelTime *= 1.5;
    } else if (trafficConditions === 'moderate') {
      adjustedTravelTime *= 1.2;
    }

    if (weatherImpact !== 'none') {
      adjustedTravelTime *= 1.1;
    }

    const bufferTime = 15;
    const totalTime = adjustedTravelTime + bufferTime;

    const gigStart = parseISO(gig.start_date);
    const recommendedDeparture = subMinutes(gigStart, totalTime);

    const route = this.generateRoute(origin, destination, travelTime);
    const alternatives = await this.getRouteAlternatives(origin, destination);

    const optimization: RouteOptimization = {
      workerId,
      gigId,
      origin,
      destination,
      recommendedDepartureTime: recommendedDeparture.toISOString(),
      estimatedTravelTime: Math.round(adjustedTravelTime),
      route,
      alternatives,
      trafficConditions,
      weatherImpact,
    };

    await supabase.from('route_optimizations').insert({
      worker_id: workerId,
      gig_id: gigId,
      origin: origin as any,
      destination: destination as any,
      recommended_departure_time: recommendedDeparture.toISOString(),
      estimated_travel_time: Math.round(adjustedTravelTime),
      route: route as any,
      alternatives: alternatives as any,
      traffic_conditions: trafficConditions,
      weather_impact: weatherImpact,
      expires_at: addMinutes(new Date(), 60).toISOString(),
    });

    return optimization;
  }

  private async calculateOptimalDepartureTime(workerId: string, gigId: string): Promise<string> {
    const optimization = await this.optimizeRoute(workerId, gigId);
    return optimization.recommendedDepartureTime;
  }

  private async getRouteAlternatives(origin: Location, destination: Location): Promise<RouteAlternative[]> {
    const baseTravelTime = this.estimateTravelTime(origin, destination);

    const alternatives: RouteAlternative[] = [];

    const drivingCost = (baseTravelTime / 60) * 15;

    alternatives.push({
      description: 'Drive directly (fastest route)',
      travelTime: baseTravelTime,
      estimatedCost: Math.round(drivingCost * 100) / 100,
      carbonFootprint: Math.round(baseTravelTime * 0.4),
    });

    const scenicTime = baseTravelTime * 1.2;
    const scenicCost = (scenicTime / 60) * 15;

    alternatives.push({
      description: 'Scenic route (avoid highways)',
      travelTime: Math.round(scenicTime),
      estimatedCost: Math.round(scenicCost * 100) / 100,
      carbonFootprint: Math.round(scenicTime * 0.35),
    });

    const transitTime = baseTravelTime * 1.8;

    alternatives.push({
      description: 'Public transit',
      travelTime: Math.round(transitTime),
      estimatedCost: 5,
      carbonFootprint: Math.round(transitTime * 0.1),
    });

    const carpoolTime = baseTravelTime * 1.1;
    const carpoolCost = drivingCost * 0.5;

    alternatives.push({
      description: 'Carpool (if available)',
      travelTime: Math.round(carpoolTime),
      estimatedCost: Math.round(carpoolCost * 100) / 100,
      carbonFootprint: Math.round(carpoolTime * 0.2),
    });

    return alternatives;
  }

  private parseLocation(address: string): Location {
    const parts = address.split(',').map(p => p.trim());

    const latitude = 40.7128 + (Math.random() - 0.5) * 0.1;
    const longitude = -74.0060 + (Math.random() - 0.5) * 0.1;

    return {
      latitude,
      longitude,
      address,
    };
  }

  private estimateTravelTime(origin: Location, destination: Location): number {
    const R = 3959;
    const dLat = ((destination.latitude - origin.latitude) * Math.PI) / 180;
    const dLon = ((destination.longitude - origin.longitude) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((origin.latitude * Math.PI) / 180) *
        Math.cos((destination.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    const avgSpeed = 45;
    const travelTimeHours = distance / avgSpeed;
    const travelTimeMinutes = travelTimeHours * 60;

    return Math.max(5, Math.round(travelTimeMinutes));
  }

  private predictTrafficConditions(gigStartTime: Date): 'light' | 'moderate' | 'heavy' {
    const hour = gigStartTime.getHours();
    const dayOfWeek = gigStartTime.getDay();

    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isWeekday && (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) {
      return 'heavy';
    }

    if (isWeekday && ((hour >= 6 && hour <= 10) || (hour >= 15 && hour <= 20))) {
      return 'moderate';
    }

    if (!isWeekday && (hour >= 10 && hour <= 20)) {
      return 'moderate';
    }

    return 'light';
  }

  private async assessWeatherImpact(
    location: Location,
    time: Date
  ): Promise<'none' | 'minor' | 'moderate' | 'severe'> {
    const month = time.getMonth();
    const hour = time.getHours();

    if ((month >= 10 || month <= 2) && (hour < 7 || hour > 18)) {
      return Math.random() > 0.7 ? 'moderate' : 'minor';
    }

    if (month >= 5 && month <= 8) {
      return Math.random() > 0.8 ? 'minor' : 'none';
    }

    return 'none';
  }

  private generateRoute(origin: Location, destination: Location, travelTime: number): any[] {
    const segmentCount = Math.max(3, Math.floor(travelTime / 15));
    const segments: any[] = [];

    const totalDistance = this.calculateDistance(origin, destination);
    const segmentDistance = totalDistance / segmentCount;
    const segmentTime = travelTime / segmentCount;

    for (let i = 0; i < segmentCount; i++) {
      let instruction = '';

      if (i === 0) {
        instruction = `Head ${this.getDirection(origin, destination)} on ${origin.address}`;
      } else if (i === segmentCount - 1) {
        instruction = `Continue to ${destination.address}`;
      } else {
        instruction = `Continue for ${segmentDistance.toFixed(1)} miles`;
      }

      segments.push({
        instruction,
        distance: segmentDistance,
        duration: Math.round(segmentTime),
        mode: 'driving',
      });
    }

    return segments;
  }

  private calculateDistance(origin: Location, destination: Location): number {
    const R = 3959;
    const dLat = ((destination.latitude - origin.latitude) * Math.PI) / 180;
    const dLon = ((destination.longitude - origin.longitude) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((origin.latitude * Math.PI) / 180) *
        Math.cos((destination.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private getDirection(origin: Location, destination: Location): string {
    const dLat = destination.latitude - origin.latitude;
    const dLon = destination.longitude - origin.longitude;

    const angle = Math.atan2(dLon, dLat) * (180 / Math.PI);

    if (angle >= -22.5 && angle < 22.5) return 'north';
    if (angle >= 22.5 && angle < 67.5) return 'northeast';
    if (angle >= 67.5 && angle < 112.5) return 'east';
    if (angle >= 112.5 && angle < 157.5) return 'southeast';
    if (angle >= 157.5 || angle < -157.5) return 'south';
    if (angle >= -157.5 && angle < -112.5) return 'southwest';
    if (angle >= -112.5 && angle < -67.5) return 'west';
    return 'northwest';
  }

  private async updateRouteWithRealTimeData(optimizationId: string): Promise<void> {
    const { data: optimization } = await supabase
      .from('route_optimizations')
      .select('*')
      .eq('id', optimizationId)
      .single();

    if (!optimization) {
      return;
    }

    const currentTime = new Date();
    const gigTime = parseISO(optimization.recommended_departure_time);

    if (currentTime > gigTime) {
      return;
    }

    const trafficConditions = this.predictTrafficConditions(gigTime);

    let adjustedTime = optimization.estimated_travel_time;
    if (trafficConditions === 'heavy' && optimization.traffic_conditions !== 'heavy') {
      adjustedTime *= 1.3;
    }

    await supabase
      .from('route_optimizations')
      .update({
        estimated_travel_time: Math.round(adjustedTime),
        traffic_conditions: trafficConditions,
      })
      .eq('id', optimizationId);
  }

  protected getMessageBus(): MessageBus {
    return this.messageBus;
  }
}
