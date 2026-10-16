/*
  # Pin search_path on all user functions (security lint 0011)
  Role-mutable search_path lets a caller shadow object names via pg_temp —
  pinning to 'public, pg_temp' closes that without changing resolution.
  Applied to remote 2026-10-16; kept here so db push/CI stay in sync.
*/

ALTER FUNCTION public.check_crew_booking() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_crew_temporal() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_food_order() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_pool_join() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_ride_match() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_route_optimizations() SET search_path = public, pg_temp;
ALTER FUNCTION public.crew_alerts_keyspace() SET search_path = public, pg_temp;
ALTER FUNCTION public.food_auto_accept_cap_cents() SET search_path = public, pg_temp;
ALTER FUNCTION public.geo_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_assignment_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_assignment_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_certification_verification() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_company_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_company_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_compliance_doc() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_crew_iou_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_crew_post_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_event_budgets_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_event_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_event_terms_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_food_order_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_food_run_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_gig_application_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_lodging_pool_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_pool_member_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_profile_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_review_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_ride_offer_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_ride_request_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_shift_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_shift_terms() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_staff_profile_link() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_swap_claim_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_swap_claim_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_swap_request_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_swap_request_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_timesheet_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_worker_sensitive_write() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_referral_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.nearby_shifts(p_lat double precision, p_lng double precision, p_radius_m integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_gig_creation() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_payment_status_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_profile_geo() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_venue_geo() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.travel_minutes(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.worker_conflicts(p_worker_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_buffer_minutes integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.worker_distances(p_worker_ids uuid[], p_lat double precision, p_lng double precision) SET search_path = public, pg_temp;
ALTER FUNCTION public.worker_sensitive_sync_geo() SET search_path = public, pg_temp;
ALTER FUNCTION public.worker_travel_conflicts(p_worker_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_venue_lat double precision, p_venue_lng double precision) SET search_path = public, pg_temp;