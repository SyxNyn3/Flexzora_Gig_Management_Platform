/*
  # Tighten function EXECUTE privileges
  Postgres grants EXECUTE to PUBLIC on new functions; Supabase adds anon/
  authenticated defaults. Any SECURITY DEFINER function missing an internal
  auth guard was therefore anonymously callable. Grant the two real callers
  explicitly, then strip PUBLIC+anon.
  Public whitelist kept (anon needs these pre-auth):
  waitlist_fill_crew_card, waitlist_referral_status, waitlist_public_stats,
  get_public_profile. Applied to remote 2026-10-16.
*/

GRANT EXECUTE ON FUNCTION public.notify_on_payment_status_change() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.notify_on_payment_status_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_on_gig_creation() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.notify_on_gig_creation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profile_rating() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_profile_rating() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_referral_count() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.increment_referral_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_assignment_insert() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_assignment_insert() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_timesheet_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_timesheet_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_shift_fill_status() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_shift_fill_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_company(p_company_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.owns_company(p_company_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_shift(p_shift_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.owns_shift(p_shift_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_event(p_event_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.owns_event(p_event_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_sensitive_sync_geo() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_sensitive_sync_geo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_calendar_event_from_application() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_calendar_event_from_application() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_route_optimizations() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_route_optimizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_certification_verification() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_certification_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nearby_shifts(p_lat double precision, p_lng double precision, p_radius_m integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.nearby_shifts(p_lat double precision, p_lng double precision, p_radius_m integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_crew_post_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_crew_post_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_venue(p_venue_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.owns_venue(p_venue_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cascade_lodging_on_shift_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cascade_lodging_on_shift_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_party_to_shift(p_shift_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_party_to_shift(p_shift_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_assignment_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_assignment_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_booked_count(p_shift_id uuid, p_exclude_assignment uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.shift_booked_count(p_shift_id uuid, p_exclude_assignment uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_has_room(p_shift_id uuid, p_exclude_assignment uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.shift_has_room(p_shift_id uuid, p_exclude_assignment uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_can_see_shift(p_shift_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_can_see_shift(p_shift_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_on_application_status_change() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.notify_on_application_status_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ride_match() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_ride_match() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_distances(p_worker_ids uuid[], p_lat double precision, p_lng double precision) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_distances(p_worker_ids uuid[], p_lat double precision, p_lng double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_ride_request_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_ride_request_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_ious_on_shift_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.void_ious_on_shift_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_ious_on_shift_delete() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.void_ious_on_shift_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_ride_offer_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_ride_offer_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_pool_join() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_pool_join() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_lodging_pool_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_lodging_pool_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_pool_member_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_pool_member_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cascade_rides_on_shift_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cascade_rides_on_shift_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cascade_food_run_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cascade_food_run_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cascade_food_on_shift_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cascade_food_on_shift_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_swap_claim_insert() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_swap_claim_insert() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_swap_request_insert() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_swap_request_insert() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_alert_on_ride_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crew_alert_on_ride_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_meets_shift_certs(p_worker_id uuid, p_shift_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_meets_shift_certs(p_worker_id uuid, p_shift_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_briefing_on_confirm() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crew_briefing_on_confirm() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_swap_claim_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_swap_claim_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_worker_sensitive_write() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_worker_sensitive_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_on_shift_gone() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.swap_on_shift_gone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_request_side_effects() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.swap_request_side_effects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.geo_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.geo_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_import_job(p_job_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.commit_import_job(p_job_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_compliance_reviews(p_company_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pending_compliance_reviews(p_company_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_compliance_doc(p_doc_id uuid, p_company_id uuid, p_approve boolean, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.review_compliance_doc(p_doc_id uuid, p_company_id uuid, p_approve boolean, p_note text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_alert_push() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crew_alert_push() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_company_delete() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_company_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_company_alerts(p_company_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.generate_company_alerts(p_company_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_company_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_company_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_crew_iou_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_crew_iou_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_gig_application_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_gig_application_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_review_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_review_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_calendar_event_from_gig() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_calendar_event_from_gig() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_calendar_event_from_gig() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_calendar_event_from_gig() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_calendar_event_from_gig() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_calendar_event_from_gig() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_backfill_on_seat_loss() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trigger_backfill_on_seat_loss() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mint_crew_post_iou() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mint_crew_post_iou() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_has_approved_doc(p_worker_id uuid, p_doc_type text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_has_approved_doc(p_worker_id uuid, p_doc_type text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_no_shows(p_company_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.detect_no_shows(p_company_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_food_order() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_food_order() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.food_auto_accept_cap_cents() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.food_auto_accept_cap_cents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_guidance(p_company_id uuid, p_role_name text, p_skill_id uuid, p_lat double precision, p_lng double precision, p_radius_km integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rate_guidance(p_company_id uuid, p_role_name text, p_skill_id uuid, p_lat double precision, p_lng double precision, p_radius_km integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_timesheet_dispute(p_timesheet_id uuid, p_reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.open_timesheet_dispute(p_timesheet_id uuid, p_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_cert_gaps(p_worker_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_cert_gaps(p_worker_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_cert_gaps_for_current_user() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_cert_gaps_for_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bail_kept_cents(p_shift_id uuid, p_amount_cents integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bail_kept_cents(p_shift_id uuid, p_amount_cents integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_alerts_keyspace() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crew_alerts_keyspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_pool_distances(p_shift_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crew_pool_distances(p_shift_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_last_ride_offer() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.my_last_ride_offer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_swap_request_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_swap_request_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cascade_lodging_pool_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cascade_lodging_pool_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_crew_booking() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_crew_booking() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_locked_swaps(p_shift_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.my_locked_swaps(p_shift_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_booked_on_shift(p_shift_id uuid, p_worker_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_booked_on_shift(p_shift_id uuid, p_worker_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_timesheet(p_timesheet_id uuid, p_break_minutes integer, p_payout_method text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_timesheet(p_timesheet_id uuid, p_break_minutes integer, p_payout_method text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_reliability(p_worker_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_reliability(p_worker_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_related_to_company(p_worker_id uuid, p_company_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_related_to_company(p_worker_id uuid, p_company_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_event_budgets_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_event_budgets_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cascade_posts_on_shift_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cascade_posts_on_shift_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_crew_post() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.settle_crew_post() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_profile(input_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_or_create_profile(input_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_event_delete() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_event_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_event_terms_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_event_terms_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_food_order_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_food_order_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_crew_temporal() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_crew_temporal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_compliance_doc() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_compliance_doc() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_food_run_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_food_run_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_profile_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_profile_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_shift_delete() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_shift_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_shift_terms() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_shift_terms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_staff_profile_link() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_staff_profile_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_profile_geo() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_profile_geo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_venue_geo() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_venue_geo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.travel_minutes(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.travel_minutes(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_timesheet_dispute(p_timesheet_id uuid, p_resolution text, p_clock_in timestamp with time zone, p_clock_out timestamp with time zone, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_timesheet_dispute(p_timesheet_id uuid, p_resolution text, p_clock_in timestamp with time zone, p_clock_out timestamp with time zone, p_note text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_calendar_import(p_import_id uuid, p_blocks jsonb, p_error text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_calendar_import(p_import_id uuid, p_blocks jsonb, p_error text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_ride_buddies(p_shift_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_ride_buddies(p_shift_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_fulfilment(p_post_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.accept_fulfilment(p_post_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_ride_request() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_ride_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_pool_member() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_pool_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cascade_ride_offer_cancel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cascade_ride_offer_cancel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_cert_reviews(p_company_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pending_cert_reviews(p_company_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_early_start_approved(p_timesheet_id uuid, p_approved boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_early_start_approved(p_timesheet_id uuid, p_approved boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_party(p_worker uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.shares_party(p_worker uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_conflicts(p_worker_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_buffer_minutes integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_conflicts(p_worker_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_buffer_minutes integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offer_run_handoff(p_run_id uuid, p_new_runner uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.offer_run_handoff(p_run_id uuid, p_new_runner uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_run_handoff(p_run_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.accept_run_handoff(p_run_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_run_handoff(p_run_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.decline_run_handoff(p_run_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_food_order() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_food_order() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_decide_swap(p_swap_id uuid, p_approve boolean, p_reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.company_decide_swap(p_swap_id uuid, p_approve boolean, p_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_unfilled_tasks(p_company_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.generate_unfilled_tasks(p_company_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_broadcast_audience(p_company_id uuid, p_audience text, p_event_id uuid, p_shift_id uuid, p_include_staff boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_broadcast_audience(p_company_id uuid, p_audience text, p_event_id uuid, p_shift_id uuid, p_include_staff boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_on_offer_response() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.swap_on_offer_response() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_clock_event(p_assignment_id uuid, p_kind text, p_lat double precision, p_lng double precision) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validate_clock_event(p_assignment_id uuid, p_kind text, p_lat double precision, p_lng double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_fulfilment(p_post_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.decline_fulfilment(p_post_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_certification(p_cert_id uuid, p_company_id uuid, p_approve boolean, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.review_certification(p_cert_id uuid, p_company_id uuid, p_approve boolean, p_note text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_swap_claim() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_swap_claim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_broadcast(p_broadcast_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.send_broadcast(p_broadcast_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_travel_conflicts(p_worker_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_venue_lat double precision, p_venue_lng double precision) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.worker_travel_conflicts(p_worker_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_venue_lat double precision, p_venue_lng double precision) FROM PUBLIC, anon;
-- Trigger handlers are invoked BY triggers, never called directly — no
-- API role should hold EXECUTE on them at all. (PostgREST can't call
-- trigger-returning functions regardless; this removes the privilege.)
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        JOIN pg_extension e ON d.refobjid = e.oid
        WHERE d.objid = p.oid
      )
      AND p.proname NOT IN ('checkauthtrigger', 'postgis_cache_bbox')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      f.proname, f.args
    );
  END LOOP;
END;
$$;
