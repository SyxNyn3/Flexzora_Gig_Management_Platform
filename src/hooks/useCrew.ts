import { useSupabaseQuery } from './useSupabaseQuery';
import { MarketplaceService } from '@/lib/marketplace/service';
import { listRideBoard } from '@/lib/crew/rides';
import { listLodgingBoard } from '@/lib/crew/lodging';
import { listFoodBoard } from '@/lib/crew/food';
import { listBoard } from '@/lib/crew/board';
import { listIousForShift } from '@/lib/crew/iou';
import { listShiftAlerts } from '@/lib/crew/alerts';
import { listSwapBoard } from '@/lib/crew/swap';
import { CrewAlert, CrewIOU, CrewPost, FoodRun, FoodRunOrder, LodgingPool, PoolMember, RideOffer, RideRequest, Shift, SwapClaim, SwapRequest } from '@/lib/types';

export function useShift(shiftId: string | undefined) {
  return useSupabaseQuery(
    () => (shiftId ? MarketplaceService.getShift(shiftId) : Promise.resolve({ data: null as Shift | null, error: 'No shift ID' })),
    [shiftId],
  );
}

export interface CrewBoard {
  offers: RideOffer[];
  requests: RideRequest[];
  pools: LodgingPool[];
  members: PoolMember[];
  runs: FoodRun[];
  orders: FoodRunOrder[];
  posts: CrewPost[];
  ious: CrewIOU[];
  alerts: CrewAlert[];
  swaps: SwapRequest[];
  swapClaims: SwapClaim[];
}

const EMPTY_BOARD: CrewBoard = { offers: [], requests: [], pools: [], members: [], runs: [], orders: [], posts: [], ious: [], alerts: [], swaps: [], swapClaims: [] };

/** Everything the CrewBoardPage renders — one refetch for all boards. */
export function useCrewBoard(shiftId: string | undefined) {
  const q = useSupabaseQuery(async (): Promise<{ data: CrewBoard; error: string | null }> => {
    if (!shiftId) return { data: EMPTY_BOARD, error: null };
    const [rides, lodging, food, posts, ious, alerts, swaps] = await Promise.all([
      listRideBoard(shiftId),
      listLodgingBoard(shiftId),
      listFoodBoard(shiftId),
      listBoard(shiftId),
      listIousForShift(shiftId),
      listShiftAlerts(shiftId),
      listSwapBoard(shiftId),
    ]);
    const error = [rides.error, lodging.error, food.error, posts.error, ious.error, alerts.error, swaps.error].find(Boolean) ?? null;
    return {
      data: {
        offers: rides.data?.offers ?? [],
        requests: rides.data?.requests ?? [],
        pools: lodging.data?.pools ?? [],
        members: lodging.data?.members ?? [],
        runs: food.data?.runs ?? [],
        orders: food.data?.orders ?? [],
        posts: posts.data ?? [],
        ious: ious.data ?? [],
        alerts: alerts.data ?? [],
        swaps: swaps.data?.requests ?? [],
        swapClaims: swaps.data?.claims ?? [],
      },
      error,
    };
  }, [shiftId]);

  return { ...q, data: q.data ?? EMPTY_BOARD };
}
