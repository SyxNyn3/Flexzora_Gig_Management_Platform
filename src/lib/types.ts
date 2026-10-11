export type UserRole = 'admin' | 'worker' | 'company';
export type GigStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type ExpenseCategory = 'travel' | 'equipment' | 'meals' | 'accommodation' | 'other';
export type IntegrationStatus = 'connected' | 'pending' | 'error' | 'disconnected';
export type WaitlistRoleInterest = 'worker' | 'company';
export type WaitlistStatus = 'pending' | 'whitelisted' | 'invited' | 'verified';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'id' | 'created_at' | 'updated_at'>;
        Update: { [K in keyof Omit<Profile, 'id' | 'created_at' | 'updated_at'>]?: Profile[K] | null };
      };
      companies: {
        Row: Company;
        Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Company, 'id' | 'created_at' | 'updated_at'>>;
      };
      skills: {
        Row: Skill;
        Insert: Omit<Skill, 'id' | 'created_at'>;
        Update: Partial<Omit<Skill, 'id' | 'created_at'>>;
      };
      worker_skills: {
        Row: WorkerSkill;
        Insert: Omit<WorkerSkill, 'id' | 'created_at'>;
        Update: Partial<Omit<WorkerSkill, 'id' | 'created_at'>>;
      };
      certifications: {
        Row: Certification;
        Insert: Omit<Certification, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Certification, 'id' | 'created_at' | 'updated_at'>>;
      };
      gigs: {
        Row: Gig;
        Insert: Omit<Gig, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Gig, 'id' | 'created_at' | 'updated_at'>>;
      };
      gig_applications: {
        Row: GigApplication;
        Insert: Omit<GigApplication, 'id' | 'application_date'>;
        Update: Partial<Omit<GigApplication, 'id' | 'application_date'>>;
      };
      availability: {
        Row: Availability;
        Insert: Omit<Availability, 'id' | 'created_at'>;
        Update: Partial<Omit<Availability, 'id' | 'created_at'>>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at'>>;
      };
      expenses: {
        Row: Expense;
        Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Expense, 'id' | 'created_at' | 'updated_at'>>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>;
      };
      company_integrations: {
        Row: CompanyIntegration;
        Insert: Omit<CompanyIntegration, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CompanyIntegration, 'id' | 'created_at' | 'updated_at'>>;
      };
      calendar_events: {
        Row: CalendarEvent;
        Insert: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>>;
      };
      waiting_list: {
        Row: WaitlistEntry;
        Insert: Omit<WaitlistEntry, 'id' | 'created_at' | 'referral_count'>;
        Update: Partial<Omit<WaitlistEntry, 'id' | 'created_at'>>;
      };
      portfolio_items: {
        Row: PortfolioItem;
        Insert: Omit<PortfolioItem, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PortfolioItem, 'id' | 'created_at' | 'updated_at'>>;
      };
      reviews: {
        Row: Review;
        Insert: Omit<Review, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Review, 'id' | 'created_at' | 'updated_at'>>;
      };
      gig_messages: {
        Row: GigMessageRow;
        Insert: Omit<GigMessageRow, 'id' | 'created_at'>;
        Update: Partial<Omit<GigMessageRow, 'id' | 'created_at' | 'gig_id' | 'sender_id'>>;
      };
      gig_message_confirmations: {
        Row: GigMessageConfirmation;
        Insert: GigMessageConfirmation;
        Update: never;
      };
      certification_types: {
        Row: CertificationType;
        Insert: Omit<CertificationType, 'created_at'>;
        Update: Partial<Omit<CertificationType, 'code' | 'created_at'>>;
      };
      venues: {
        Row: Venue;
        Insert: Omit<Venue, 'id' | 'created_at' | 'updated_at' | 'overnight_parking' | 'camping_allowed'>;
        Update: Partial<Omit<Venue, 'id' | 'created_at' | 'updated_at'>>;
      };
      overtime_rules: {
        Row: OvertimeRule;
        Insert: Omit<OvertimeRule, 'id' | 'created_at'>;
        Update: Partial<Omit<OvertimeRule, 'id' | 'created_at'>>;
      };
      events: {
        Row: ProductionEvent;
        Insert: Omit<ProductionEvent, 'id' | 'created_at' | 'updated_at' | 'venue' | 'company' | 'shifts'>;
        Update: Partial<Omit<ProductionEvent, 'id' | 'created_at' | 'updated_at' | 'venue' | 'company' | 'shifts'>>;
      };
      shifts: {
        Row: Shift;
        Insert: Omit<Shift, 'id' | 'created_at' | 'updated_at' | 'event' | 'skill' | 'assignments'>;
        Update: Partial<Omit<Shift, 'id' | 'created_at' | 'updated_at' | 'event' | 'skill' | 'assignments'>>;
      };
      shift_assignments: {
        Row: ShiftAssignment;
        Insert: Omit<ShiftAssignment, 'id' | 'created_at' | 'updated_at' | 'shift' | 'worker' | 'timesheet' | 'needs_ride' | 'can_drive'>;
        Update: Partial<Omit<ShiftAssignment, 'id' | 'created_at' | 'updated_at' | 'shift' | 'worker' | 'timesheet'>>;
      };
      preferred_rosters: {
        Row: PreferredRosterEntry;
        Insert: Omit<PreferredRosterEntry, 'id' | 'created_at' | 'worker'>;
        Update: Partial<Omit<PreferredRosterEntry, 'id' | 'created_at' | 'worker'>>;
      };
      timesheets: {
        Row: Timesheet;
        Insert: Omit<Timesheet, 'id' | 'created_at' | 'updated_at' | 'shift' | 'worker' | 'assignment'>;
        Update: Partial<Omit<Timesheet, 'id' | 'created_at' | 'updated_at' | 'shift' | 'worker' | 'assignment'>>;
      };
      escrow_deposits: {
        Row: EscrowDeposit;
        Insert: Omit<EscrowDeposit, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<EscrowDeposit, 'id' | 'created_at' | 'updated_at'>>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, 'id' | 'created_at' | 'event' | 'company' | 'worker' | 'payout'>;
        Update: Partial<Omit<Invoice, 'id' | 'created_at' | 'event' | 'company' | 'worker' | 'payout'>>;
      };
      payouts: {
        Row: Payout;
        Insert: Omit<Payout, 'id' | 'created_at' | 'updated_at' | 'invoice'>;
        Update: Partial<Omit<Payout, 'id' | 'created_at' | 'updated_at' | 'invoice'>>;
      };
      crew_iou: {
        Row: CrewIOU;
        Insert: Omit<CrewIOU, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CrewIOU, 'id' | 'created_at' | 'updated_at'>>;
      };
      ride_offers: {
        Row: RideOffer;
        Insert: Omit<RideOffer, 'id' | 'created_at' | 'updated_at' | 'seats_taken' | 'driver'>;
        Update: Partial<Omit<RideOffer, 'id' | 'created_at' | 'updated_at' | 'seats_taken' | 'driver'>>;
      };
      ride_requests: {
        Row: RideRequest;
        Insert: Omit<RideRequest, 'id' | 'created_at' | 'updated_at' | 'rider'>;
        Update: Partial<Omit<RideRequest, 'id' | 'created_at' | 'updated_at' | 'rider'>>;
      };
      lodging_pools: {
        Row: LodgingPool;
        Insert: Omit<LodgingPool, 'id' | 'created_at' | 'updated_at' | 'spots_taken' | 'host'>;
        Update: Partial<Omit<LodgingPool, 'id' | 'created_at' | 'updated_at' | 'spots_taken' | 'host'>>;
      };
      pool_members: {
        Row: PoolMember;
        Insert: Omit<PoolMember, 'id' | 'created_at' | 'updated_at' | 'worker'>;
        Update: Partial<Omit<PoolMember, 'id' | 'created_at' | 'updated_at' | 'worker'>>;
      };
      crew_posts: {
        Row: CrewPost;
        Insert: Omit<CrewPost, 'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'author' | 'fulfiller'>;
        Update: Partial<Omit<CrewPost, 'id' | 'created_at' | 'updated_at' | 'author' | 'fulfiller'>>;
      };
      food_runs: {
        Row: FoodRun;
        Insert: Omit<FoodRun, 'id' | 'created_at' | 'updated_at' | 'runner'>;
        Update: Partial<Omit<FoodRun, 'id' | 'created_at' | 'updated_at' | 'runner'>>;
      };
      food_run_orders: {
        Row: FoodRunOrder;
        Insert: Omit<FoodRunOrder, 'id' | 'created_at' | 'updated_at' | 'worker'>;
        Update: Partial<Omit<FoodRunOrder, 'id' | 'created_at' | 'updated_at' | 'worker'>>;
      };
      crew_alerts: {
        Row: CrewAlert;
        Insert: Omit<CrewAlert, 'id' | 'created_at' | 'read_at'>;
        Update: Partial<Omit<CrewAlert, 'id' | 'created_at'>>;
      };
      cert_gear_items: {
        Row: CertGearItem;
        Insert: CertGearItem;
        Update: Partial<CertGearItem>;
      };
      base_gear_items: {
        Row: BaseGearItem;
        Insert: BaseGearItem;
        Update: Partial<BaseGearItem>;
      };
    };
  };
}

export interface Profile {
  id: string;
  user_id?: string;
  email: string;
  full_name: string;
  username?: string;
  avatar_url?: string;
  role?: UserRole;
  phone?: string;
  location?: string;
  bio?: string;
  hourly_rate?: number;
  experience_years?: number;
  portfolio_url?: string;
  linkedin_url?: string;
  portfolio_items?: PortfolioItem[];
  is_available?: boolean;
  travel_radius_km?: number;
  day_rate?: number;
  average_rating?: number;
  review_count?: number;
  created_at: string;
  updated_at: string;
}

/** Private per-worker data — RLS restricts this row to the worker themselves. */
export interface WorkerSensitive {
  worker_id: string;
  latitude?: number;
  longitude?: number;
  geo?: unknown;
  stripe_connect_account_id?: string;
  payouts_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortfolioItem {
  id: string;
  worker_id: string;
  title: string;
  description?: string;
  url?: string;
  image_url?: string;
  category?: string;
  date_completed?: string;
  client?: string;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  gig_id?: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  description?: string;
  website_url?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  logo_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category?: string;
  description?: string;
  created_at: string;
}

export interface WorkerSkill {
  id: string;
  worker_id: string;
  skill_id: string;
  proficiency_level: number;
  years_experience: number;
  created_at: string;
  skill?: Skill;
}

export interface Certification {
  id: string;
  worker_id: string;
  name: string;
  issuing_organization?: string;
  issue_date?: string;
  expiration_date?: string;
  credential_id?: string;
  credential_url?: string;
  cert_type_code?: string;
  verified?: boolean;
  verified_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Gig {
  id: string;
  title: string;
  description: string;
  company_id: string;
  created_by: string;
  location: string;
  start_date: string;
  end_date: string;
  hourly_rate?: number;
  total_budget?: number;
  status: GigStatus;
  required_workers: number;
  skills_required?: string[];
  equipment_provided?: string[];
  special_requirements?: string;
  is_remote: boolean;
  contact_info?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  company?: Company;
  creator?: Profile;
}

export interface GigApplication {
  id: string;
  gig_id: string;
  worker_id: string;
  status: ApplicationStatus;
  cover_letter?: string;
  proposed_rate?: number;
  application_date: string;
  response_date?: string;
  notes?: string;
  gig?: Gig;
  worker?: Profile;
}

export interface GigMessageRow {
  id: string;
  gig_id: string;
  sender_id: string;
  message_type: 'general' | 'instructions' | 'payment' | 'logistics' | 'safety';
  title: string;
  content: string;
  recipients: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  requires_confirmation: boolean;
  created_at: string;
}

export interface GigMessageConfirmation {
  message_id: string;
  worker_id: string;
  confirmed_at: string;
}

export interface Availability {
  id: string;
  worker_id: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  notes?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  gig_id: string;
  worker_id: string;
  company_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  due_date?: string;
  paid_date?: string;
  invoice_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  gig?: Gig;
  worker?: Profile;
}

export interface Expense {
  id: string;
  worker_id: string;
  gig_id?: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  expense_date: string;
  receipt_url?: string;
  is_reimbursable: boolean;
  is_tax_deductible: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  gig?: Gig;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  action_url?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CompanyIntegration {
  id: string;
  worker_id: string;
  company_name: string;
  integration_type: string;
  status: IntegrationStatus;
  credentials?: Record<string, unknown>;
  settings: Record<string, unknown>;
  last_sync?: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  event_type: 'gig' | 'note' | 'reminder';
  start_time: string;
  end_time?: string;
  all_day: boolean;
  color: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  role_interest: WaitlistRoleInterest;
  production_companies_worked_with?: string;
  past_communication_methods?: string;
  desired_features?: string;
  challenges?: string;
  referred_by_email?: string;
  referral_code: string;
  created_at: string;
  status: WaitlistStatus;
  referral_count: number;
  market_city?: string;
  crew_roles: string[];
  company_type?: string;
  events_per_month: number | null;
  typical_crew_size: number | null;
  pain_points: string[];
  beta_tester: boolean;
  heard_from?: string;
  utm_source?: string;
  notes?: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Form types
export interface ProfileFormData {
  full_name: string;
  username?: string;
  phone?: string;
  location?: string;
  bio?: string;
  hourly_rate?: number;
  experience_years?: number;
  portfolio_url?: string;
  linkedin_url?: string;
  portfolio_items?: PortfolioItem[];
}

export interface GigFormData {
  title: string;
  description: string;
  company_id: string;
  location: string;
  start_date: string;
  end_date: string;
  hourly_rate?: number;
  total_budget?: number;
  required_workers: number;
  skills_required?: string[];
  equipment_provided?: string[];
  special_requirements?: string;
  is_remote: boolean;
}

export interface ApplicationFormData {
  cover_letter?: string;
  proposed_rate?: number;
}

// Error types
export interface DatabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}
// ---------------------------------------------------------------------------
// Marketplace core (events / shifts / rosters / timesheets / escrow / invoices)
// ---------------------------------------------------------------------------
export type EventStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type EventType = 'concert' | 'corporate' | 'festival' | 'theatre' | 'broadcast' | 'sports' | 'other';
export type ShiftStatus = 'draft' | 'open' | 'filled' | 'in_progress' | 'completed' | 'cancelled';
export type AssignmentStatus =
  | 'offered'
  | 'applied'
  | 'confirmed'
  | 'declined'
  | 'rejected'
  | 'withdrawn'
  | 'no_show'
  | 'completed';
export type AssignmentSource = 'direct_book' | 'roster_broadcast' | 'public_marketplace';
export type BroadcastStage = 'none' | 'roster' | 'public';
export type TimesheetStatus = 'open' | 'submitted' | 'approved' | 'disputed' | 'paid';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';
export type PayoutStatus = 'queued' | 'processing' | 'paid' | 'failed';
export type PayoutMethod = 'ach' | 'instant';
export type EscrowStatus = 'pending' | 'funded' | 'partially_released' | 'released' | 'refunded';
export type RosterTier = 'preferred' | 'core' | 'blocked';

export interface CertificationType {
  code: string;
  name: string;
  issuing_body?: string;
  category: 'safety' | 'rigging' | 'equipment' | 'electrical' | 'medical';
  requires_expiry: boolean;
  created_at: string;
}

export interface Venue {
  id: string;
  company_id: string;
  name: string;
  address: string;
  city?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  load_in_notes?: string;
  overnight_parking: boolean;
  camping_allowed: boolean;
  parking_notes?: string;
  parking_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OvertimeRule {
  id: string;
  code: string;
  name: string;
  region?: string;
  daily_ot_after_hours: number | null;
  daily_dt_after_hours: number | null;
  weekly_ot_after_hours: number | null;
  ot_multiplier: number;
  dt_multiplier: number;
  minimum_call_hours: number;
  meal_penalty_after_hours: number | null;
  created_at: string;
}

export interface ProductionEvent {
  id: string;
  company_id: string;
  venue_id?: string;
  created_by?: string;
  name: string;
  event_type: EventType;
  description?: string;
  starts_on: string;
  ends_on: string;
  status: EventStatus;
  overtime_rule_code: string;
  color: string;
  /** From event_budgets; only present for the owning company. */
  budget_cap?: number;
  platform_fee_pct?: number;
  created_at: string;
  updated_at: string;
  venue?: Venue;
  company?: Company;
  shifts?: Shift[];
}

export interface Shift {
  id: string;
  event_id: string;
  title: string;
  role_name: string;
  skill_id?: string;
  min_proficiency: number;
  required_cert_codes: string[];
  headcount: number;
  starts_at: string;
  ends_at: string;
  hourly_rate: number;
  status: ShiftStatus;
  broadcast_stage: BroadcastStage;
  roster_broadcast_at?: string;
  public_broadcast_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  event?: ProductionEvent;
  skill?: Skill;
  assignments?: ShiftAssignment[];
}

export interface MatchBreakdown {
  gatekeeperPassed: boolean;
  gatekeeperReasons: string[];
  proximity: number;
  availability: number;
  performance: number;
  roster: number;
  distanceKm: number | null;
}

export interface ShiftAssignment {
  id: string;
  shift_id: string;
  worker_id: string;
  status: AssignmentStatus;
  source: AssignmentSource;
  match_score?: number;
  match_breakdown?: MatchBreakdown;
  offered_rate?: number;
  needs_ride: boolean;
  can_drive: boolean;
  responded_at?: string;
  confirmed_at?: string;
  created_at: string;
  updated_at: string;
  shift?: Shift;
  worker?: Profile;
  timesheet?: Timesheet;
}

export interface PreferredRosterEntry {
  id: string;
  company_id: string;
  worker_id: string;
  tier: RosterTier;
  notes?: string;
  added_by?: string;
  created_at: string;
  worker?: Profile;
}

export interface Timesheet {
  id: string;
  assignment_id: string;
  shift_id: string;
  worker_id: string;
  clock_in_at?: string;
  clock_in_lat?: number;
  clock_in_lng?: number;
  clock_in_distance_m?: number;
  clock_in_verified: boolean;
  clock_out_at?: string;
  clock_out_lat?: number;
  clock_out_lng?: number;
  clock_out_distance_m?: number;
  clock_out_verified: boolean;
  break_minutes: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  gross_pay: number;
  status: TimesheetStatus;
  worker_notes?: string;
  manager_notes?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
  shift?: Shift;
  worker?: Profile;
  assignment?: ShiftAssignment;
}

export interface EscrowDeposit {
  id: string;
  event_id: string;
  company_id: string;
  amount: number;
  released_amount: number;
  currency: string;
  status: EscrowStatus;
  stripe_payment_intent_id?: string;
  funded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  description: string;
  // null for non-hourly items (e.g. IOU deduction lines)
  hours: number | null;
  rate: number | null;
  amount: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  timesheet_id?: string;
  worker_id: string;
  company_id: string;
  event_id?: string;
  line_items: InvoiceLineItem[];
  subtotal: number;
  platform_fee: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  tax_year: number;
  issued_at: string;
  paid_at?: string;
  created_at: string;
  event?: ProductionEvent;
  company?: Company;
  worker?: Profile;
  payout?: Payout;
}

export interface Payout {
  id: string;
  invoice_id: string;
  worker_id: string;
  amount: number;
  currency: string;
  method: PayoutMethod;
  status: PayoutStatus;
  stripe_transfer_id?: string;
  failure_reason?: string;
  expected_arrival_at?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
  invoice?: Invoice;
}

export interface WorkerReliability {
  completed: number;
  no_shows: number;
  withdrawn: number;
  reliability_rate: number | null;
  avg_rating: number | null;
}

export interface EventFormData {
  name: string;
  event_type: EventType;
  description?: string;
  venue_id?: string;
  starts_on: string;
  ends_on: string;
  budget_cap?: number;
  overtime_rule_code: string;
}

export interface ShiftFormData {
  title: string;
  role_name: string;
  skill_id?: string;
  min_proficiency: number;
  required_cert_codes: string[];
  headcount: number;
  starts_at: string;
  ends_at: string;
  hourly_rate: number;
  notes?: string;
}

export interface VenueFormData {
  name: string;
  address: string;
  city?: string;
  region?: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
}

// --- Crew OS ---------------------------------------------------------------
export type CrewIOUKind = 'ride' | 'lodging' | 'food' | 'gear' | 'other';
export type CrewIOUStatus = 'committed' | 'settled' | 'void' | 'failed';
export type CrewIOUSettleVia = 'payout_deduction' | 'instant_pay' | 'manual';

export interface CrewIOU {
  id: string;
  worker_id: string;
  shift_id?: string;
  kind: CrewIOUKind;
  amount_cents: number;
  beneficiary_worker_id?: string;
  beneficiary?: string;
  status: CrewIOUStatus;
  settle_via: CrewIOUSettleVia;
  iou_group_id?: string;
  notes?: string;
  settled_at?: string;
  settled_timesheet_id?: string;
  created_at: string;
  updated_at: string;
  beneficiary_profile?: Pick<Profile, 'id' | 'full_name'>;
}

// --- CrewPool rides --------------------------------------------------------
export type RideOfferStatus = 'open' | 'full' | 'cancelled';
export type RideRequestStatus = 'open' | 'matched' | 'withdrawn' | 'cancelled';

export interface RideOffer {
  id: string;
  shift_id: string;
  driver_worker_id: string;
  seats: number;
  seats_taken: number;
  departure_area?: string;
  departure_at?: string;
  gas_share_cents: number;
  notes?: string;
  status: RideOfferStatus;
  created_at: string;
  updated_at: string;
  driver?: Profile;
}

export interface RideRequest {
  id: string;
  shift_id: string;
  rider_worker_id: string;
  seats_needed: number;
  pickup_area?: string;
  notes?: string;
  status: RideRequestStatus;
  offer_id?: string;
  created_at: string;
  updated_at: string;
  rider?: Profile;
}

// --- BunkUp lodging --------------------------------------------------------
export type LodgingPoolKind = 'hotel' | 'airbnb' | 'house' | 'camp' | 'rv' | 'other';
export type LodgingPoolStatus = 'open' | 'full' | 'cancelled';
export type PoolMemberStatus = 'joined' | 'left' | 'removed' | 'cancelled';

export interface LodgingPool {
  id: string;
  shift_id: string;
  host_worker_id: string;
  kind: LodgingPoolKind;
  name: string;
  address_area?: string;
  check_in_at?: string;
  check_out_at?: string;
  spots: number;
  spots_taken: number;
  total_cost_cents?: number;
  share_cents: number;
  notes?: string;
  status: LodgingPoolStatus;
  created_at: string;
  updated_at: string;
  host?: Profile;
}

export interface PoolMember {
  id: string;
  pool_id: string;
  worker_id: string;
  spots_needed: number;
  status: PoolMemberStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  worker?: Profile;
}

// --- CrewBoard ---------------------------------------------------------------
export type CrewPostCategory = 'ride' | 'lodging' | 'food' | 'borrow' | 'announce' | 'general';
export type CrewPostDirection = 'want' | 'offer';
export type CrewPostStatus = 'open' | 'resolved' | 'closed';

export interface CrewPost {
  id: string;
  shift_id: string;
  author_worker_id: string;
  category: CrewPostCategory;
  direction: CrewPostDirection;
  title: string;
  body?: string;
  amount_cents?: number;
  ref_id?: string;
  status: CrewPostStatus;
  fulfilled_by_worker_id?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  author?: Profile;
  fulfiller?: Profile;
}

// --- GrubRun ---------------------------------------------------------------
export type FoodRunStatus = 'open' | 'ordered' | 'delivered' | 'cancelled';
export type FoodOrderStatus = 'placed' | 'confirmed' | 'cancelled';

export interface FoodRun {
  id: string;
  shift_id: string;
  runner_worker_id: string;
  restaurant: string;
  menu_link?: string;
  order_cutoff_at: string;
  delivery_area?: string;
  notes?: string;
  status: FoodRunStatus;
  created_at: string;
  updated_at: string;
  runner?: Profile;
}

export interface FoodRunOrder {
  id: string;
  run_id: string;
  worker_id: string;
  item: string;
  price_cents?: number;
  status: FoodOrderStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  worker?: Profile;
}

// --- SmartAlerts -------------------------------------------------------------
export type CrewAlertKind = 'gear' | 'parking' | 'departure' | 'pool' | 'iou' | 'custom';

export interface CrewAlert {
  id: string;
  worker_id: string;
  shift_id?: string;
  kind: CrewAlertKind;
  title: string;
  body: string;
  ref_id?: string;
  dedupe_key?: string;
  read_at?: string;
  created_at: string;
}

export interface CertGearItem {
  cert_code: string;
  item: string;
}

export interface BaseGearItem {
  item: string;
}

