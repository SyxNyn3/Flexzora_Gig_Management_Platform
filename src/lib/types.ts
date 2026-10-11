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
      compliance_docs: {
        Row: ComplianceDoc;
        Insert: Omit<ComplianceDoc, 'id' | 'uploaded_at' | 'updated_at' | 'status' | 'reviewed_by' | 'reviewed_at' | 'review_note' | 'worker'>;
        Update: Partial<Pick<ComplianceDoc, 'document_path' | 'status'>>;
      };
      certifications: {
        Row: Certification;
        Insert: Omit<Certification, 'id' | 'created_at' | 'updated_at' | 'verification_status'> & {
          verification_status?: CertVerificationStatus;
        };
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
      calendar_imports: {
        Row: CalendarImport;
        Insert: Omit<CalendarImport, 'id' | 'created_at' | 'block_count' | 'synced_at' | 'last_error'>;
        Update: Partial<Pick<CalendarImport, 'name' | 'feed_url'>>;
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
        Insert: Omit<Payout, 'id' | 'created_at' | 'updated_at' | 'invoice' | 'kind'> & { kind?: Payout['kind'] };
        Update: Partial<Omit<Payout, 'id' | 'created_at' | 'updated_at' | 'invoice'>>;
      };
      import_jobs: {
        Row: ImportJob;
        Insert: Omit<ImportJob, 'id' | 'created_at' | 'committed_at'>;
        Update: Partial<Omit<ImportJob, 'id' | 'created_at' | 'company_id' | 'created_by'>>;
      };
      import_rows: {
        Row: ImportRow;
        Insert: Omit<ImportRow, 'id' | 'created_at' | 'updated_at' | 'entity_id'> & { id?: string; entity_id?: string | null };
        Update: Partial<Omit<ImportRow, 'id' | 'created_at' | 'job_id'>>;
      };
      company_docs: {
        Row: CompanyDoc;
        Insert: Omit<CompanyDoc, 'id' | 'created_at' | 'updated_at'> & { created_by?: string | null };
        Update: Partial<Omit<CompanyDoc, 'id' | 'created_at' | 'company_id'>>;
      };
      copilot_messages: {
        Row: CopilotMessage;
        Insert: Omit<CopilotMessage, 'id' | 'created_at'> & { profile_id?: string | null };
        Update: Partial<Pick<CopilotMessage, 'action' | 'content'>>;
      };

      staff_members: {
        Row: StaffMember;
        Insert: Omit<StaffMember, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<StaffMember, 'id' | 'created_at' | 'company_id'>>;
      };
      staff_assignments: {
        Row: StaffAssignment;
        Insert: Omit<StaffAssignment, 'id' | 'created_at' | 'updated_at' | 'member'>;
        Update: Partial<Omit<StaffAssignment, 'id' | 'created_at' | 'company_id' | 'staff_id' | 'event_id' | 'member'>>;
      };
      broadcasts: {
        Row: Broadcast;
        Insert: Omit<Broadcast, 'id' | 'created_at' | 'updated_at' | 'sent_at' | 'recipient_count' | 'status' | 'error'> & {
          status?: BroadcastStatus;
        };
        Update: Partial<Omit<Broadcast, 'id' | 'created_at' | 'company_id'>>;
      };
      broadcast_recipients: {
        Row: BroadcastRecipient;
        Insert: Omit<BroadcastRecipient, 'id' | 'created_at'>;
        Update: Partial<Omit<BroadcastRecipient, 'id' | 'created_at' | 'broadcast_id'>>;
      };
      calendar_feeds: {
        Row: CalendarFeed;
        Insert: Omit<CalendarFeed, 'id' | 'created_at' | 'token' | 'last_accessed_at'> & { token?: string };
        Update: Partial<Pick<CalendarFeed, 'label' | 'is_active'>>;
      };
      ops_tasks: {
        Row: OpsTask;
        Insert: Omit<OpsTask, 'id' | 'created_at' | 'updated_at' | 'done_at' | 'event' | 'shift' | 'assignee'>;
        Update: Partial<Omit<OpsTask, 'id' | 'created_at' | 'company_id' | 'event' | 'shift' | 'assignee'>>;
      };
      shift_templates: {
        Row: ShiftTemplate;
        Insert: Omit<ShiftTemplate, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ShiftTemplate, 'id' | 'created_at' | 'company_id'>>;
      };
      company_alerts: {
        Row: CompanyAlert;
        Insert: Omit<CompanyAlert, 'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'event' | 'shift'>;
        Update: Partial<Omit<CompanyAlert, 'id' | 'created_at' | 'company_id' | 'event' | 'shift'>>;
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
        Insert: Omit<FoodRun, 'id' | 'created_at' | 'updated_at' | 'runner' | 'pending_runner' | 'min_orders' | 'late_fee_cents' | 'pending_runner_worker_id'> & {
          min_orders?: number;
          late_fee_cents?: number;
        };
        Update: Partial<Omit<FoodRun, 'id' | 'created_at' | 'updated_at' | 'runner' | 'pending_runner'>>;
      };
      food_run_orders: {
        Row: FoodRunOrder;
        Insert: Omit<FoodRunOrder, 'id' | 'created_at' | 'updated_at' | 'worker'>;
        Update: Partial<Omit<FoodRunOrder, 'id' | 'created_at' | 'updated_at' | 'worker'>>;
      };
      crew_alerts: {
        Row: CrewAlert;
        Insert: Omit<CrewAlert, 'id' | 'created_at' | 'read_at' | 'sms_sent_at'>;
        Update: Partial<Omit<CrewAlert, 'id' | 'created_at'>>;
      };
      alert_preferences: {
        Row: AlertPreference;
        Insert: Omit<AlertPreference, 'updated_at'> & { updated_at?: string };
        Update: Partial<Omit<AlertPreference, 'worker_id' | 'kind'>>;
      };
      platform_policies: {
        Row: PlatformPolicy;
        Insert: PlatformPolicy;
        Update: Partial<PlatformPolicy>;
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
      swap_requests: {
        Row: SwapRequest;
        Insert: Omit<SwapRequest, 'id' | 'created_at' | 'updated_at' | 'status' | 'accepted_claim_id' | 'offered_assignment_id' | 'requester'>;
        Update: Partial<Omit<SwapRequest, 'id' | 'created_at' | 'updated_at' | 'requester'>>;
      };
      swap_claims: {
        Row: SwapClaim;
        Insert: Omit<SwapClaim, 'id' | 'created_at' | 'updated_at' | 'status' | 'claimer'>;
        Update: Partial<Omit<SwapClaim, 'id' | 'created_at' | 'updated_at' | 'claimer'>>;
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

export type CertVerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

/** Cleared-rate percentiles for a role family inside a market radius. */
export interface RateGuidance {
  count: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

export type ComplianceDocType = 'w9' | 'i9' | 'other';
export type ComplianceDocStatus = 'pending' | 'approved' | 'rejected';

export interface ComplianceDoc {
  id: string;
  worker_id: string;
  doc_type: ComplianceDocType;
  /** Storage path in the private compliance-docs bucket. */
  document_path: string;
  status: ComplianceDocStatus;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  uploaded_at: string;
  updated_at: string;
  worker?: Profile;
}

export interface CertGap {
  cert_type_code: string;
  cert_name: string;
  demand_count: number;
  /** missing | pending | rejected | expired | unsubmitted */
  state: string;
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
  /** Storage path in the private cert-docs bucket. */
  document_path?: string | null;
  document_name?: string | null;
  verification_status: CertVerificationStatus;
  verification_requested_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
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
  import_id?: string;
  created_at: string;
}

export interface CalendarImport {
  id: string;
  worker_id: string;
  name: string;
  feed_url: string;
  synced_at?: string;
  block_count: number;
  last_error?: string;
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
export type TimesheetStatus = 'open' | 'submitted' | 'approved' | 'disputed' | 'paid' | 'voided';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';
export type PayoutStatus = 'queued' | 'processing' | 'paid' | 'failed';
export type PayoutMethod = 'ach' | 'instant';
export type EscrowStatus = 'pending' | 'funded' | 'partially_released' | 'released' | 'refunded';
export type RosterTier = 'preferred' | 'core' | 'blocked' | 'standby';

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
  /** Optional — imported venues may lack coords; geo/clock-in degrade to unverified. */
  latitude?: number | null;
  longitude?: number | null;
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
  /** Union packs: minimum rest hours between calls; early hours inside the gap bill at double time. */
  turnaround_min_hours?: number | null;
  /** Union packs: break length that counts as a real meal. */
  meal_break_min_minutes?: number;
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
  /** IANA wall-clock zone of the venue (America/Los_Angeles default). */
  timezone?: string;
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
  standby_rate?: number | null;
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
  meal_penalty_hours?: number;
  turnaround_penalty_hours?: number;
  gross_pay: number;
  status: TimesheetStatus;
  worker_notes?: string;
  manager_notes?: string;
  approved_by?: string;
  approved_at?: string;
  dispute_opened_by?: string;
  dispute_reason?: string;
  resolution?: 'as_submitted' | 'adjusted' | 'voided';
  resolved_by?: string;
  resolved_at?: string;
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
  kind: 'timesheet' | 'iou_transfer';
  crew_iou_id?: string;
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
  timezone?: string;
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

// ---------------------------------------------------------------------------
// Company OS — AI Upload Wizard
// ---------------------------------------------------------------------------
export type ImportTarget = 'venues' | 'shifts' | 'roster_contacts' | 'staff' | 'shift_templates';
export type ImportJobStatus =
  | 'uploaded'
  | 'mapped'
  | 'reviewing'
  | 'committing'
  | 'committed'
  | 'failed'
  | 'cancelled';
export type ImportRowStatus = 'pending' | 'ready' | 'warning' | 'error' | 'skipped' | 'imported';

export interface ImportJob {
  id: string;
  company_id: string;
  created_by: string;
  target: ImportTarget;
  file_name: string;
  file_type: string;
  status: ImportJobStatus;
  source_columns: string[];
  mapping: Record<string, string>;
  mapping_source?: string | null;
  event_id?: string | null;
  stats: {
    total?: number;
    imported?: number;
    ready?: number;
    warning?: number;
    error?: number;
    skipped?: number;
  };
  error?: string | null;
  created_at: string;
  committed_at?: string | null;
}

export interface ImportRow {
  id: string;
  job_id: string;
  row_index: number;
  raw: Record<string, string>;
  mapped: Record<string, string>;
  status: ImportRowStatus;
  message?: string | null;
  entity_id?: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Company OS — Copilot
// ---------------------------------------------------------------------------
export interface CompanyDoc {
  id: string;
  company_id: string;
  title: string;
  body: string;
  tags: string[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type CopilotActionStatus = 'pending' | 'done' | 'dismissed';

export interface CopilotAction {
  kind: 'save_doc' | 'broadcast_draft';
  label: string;
  payload: Record<string, unknown>;
  status: CopilotActionStatus;
  note?: string;
}

export interface CopilotMessage {
  id: string;
  company_id: string;
  profile_id?: string | null;
  role: 'user' | 'assistant';
  content: string;
  query_kind?: string | null;
  result?: Record<string, unknown>[] | null;
  action?: CopilotAction | null;
  created_at: string;
}


// ---------------------------------------------------------------------------
// Company OS — staff layer (internal team, distinct from marketplace crew)
// ---------------------------------------------------------------------------
export type StaffEmploymentType = 'salaried' | 'day_rate' | 'hourly';
export type StaffAssignmentStatus = 'assigned' | 'confirmed' | 'declined';

export interface StaffMember {
  id: string;
  company_id: string;
  profile_id?: string | null;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  employment_type: StaffEmploymentType;
  day_rate?: number | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffAssignment {
  id: string;
  company_id: string;
  staff_id: string;
  event_id: string;
  role_label?: string | null;
  call_time?: string | null;
  status: StaffAssignmentStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  member?: StaffMember;
}

// ---------------------------------------------------------------------------
// Company OS — broadcast messaging
// ---------------------------------------------------------------------------
export type BroadcastAudience = 'all' | 'event' | 'shift';
export type BroadcastStatus = 'draft' | 'sent' | 'failed';
export type BroadcastChannel = 'in_app' | 'email' | 'sms';
export type BroadcastRecipientStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'skipped';

export interface Broadcast {
  id: string;
  company_id: string;
  created_by?: string | null;
  subject?: string | null;
  body: string;
  audience: BroadcastAudience;
  event_id?: string | null;
  shift_id?: string | null;
  include_staff: boolean;
  status: BroadcastStatus;
  recipient_count: number;
  error?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BroadcastRecipient {
  id: string;
  broadcast_id: string;
  company_id: string;
  worker_id?: string | null;
  staff_id?: string | null;
  channel: BroadcastChannel;
  status: BroadcastRecipientStatus;
  error?: string | null;
  notification_id?: string | null;
  created_at: string;
  delivered_at?: string | null;
  worker_name?: string;
  staff_name?: string;
}

// ---------------------------------------------------------------------------
// Company OS — calendar feeds (ICS)
// ---------------------------------------------------------------------------
export type CalendarFeedScope = 'company' | 'event' | 'staff' | 'worker';

export interface CalendarFeed {
  id: string;
  company_id: string;
  token: string;
  scope: CalendarFeedScope;
  event_id?: string | null;
  staff_id?: string | null;
  worker_id?: string | null;
  label?: string | null;
  created_by?: string | null;
  is_active: boolean;
  last_accessed_at?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Company OS — operations kanban
// ---------------------------------------------------------------------------
export type OpsColumn = 'todo' | 'in_progress' | 'done';
export type OpsPriority = 'low' | 'normal' | 'high' | 'urgent';
export type OpsTaskSource = 'manual' | 'auto_unfilled';

// ---------------------------------------------------------------------------
// Lane B — shift templates ("call packs")
// ---------------------------------------------------------------------------
export interface ShiftTemplate {
  id: string;
  company_id: string;
  name: string;
  role_name: string;
  skill_id?: string | null;
  min_proficiency: number;
  required_cert_codes: string[];
  headcount: number;
  hourly_rate: number;
  duration_minutes: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpsTask {
  id: string;
  company_id: string;
  event_id?: string | null;
  shift_id?: string | null;
  title: string;
  notes?: string | null;
  column_key: OpsColumn;
  priority: OpsPriority;
  source: OpsTaskSource;
  assigned_staff_id?: string | null;
  due_at?: string | null;
  sort_order: number;
  created_by?: string | null;
  done_at?: string | null;
  created_at: string;
  updated_at: string;
  event?: { id: string; name: string } | null;
  shift?: { id: string; title: string } | null;
  assignee?: StaffMember | null;
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
  settled_cents: number;
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
  departure_lat?: number;
  departure_lng?: number;
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

export interface RideBuddy {
  buddy_worker_id: string;
  buddy_name: string;
  rides_together: number;
  i_drove_last: boolean;
  last_ride_at: string;
  buddy_confirmed: boolean;
  buddy_offer_id?: string;
}

export interface LastRideOfferParams {
  seats: number;
  departure_area?: string;
  gas_share_cents: number;
  notes?: string;
  departure_lat?: number;
  departure_lng?: number;
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
  geo_lat?: number;
  geo_lng?: number;
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
export type CrewPostStatus = 'open' | 'awaiting_accept' | 'resolved' | 'closed';

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
  pending_runner_worker_id?: string;
  restaurant: string;
  menu_link?: string;
  order_cutoff_at: string;
  delivery_area?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  min_orders: number;
  late_fee_cents: number;
  notes?: string;
  status: FoodRunStatus;
  created_at: string;
  updated_at: string;
  runner?: Profile;
  pending_runner?: Profile;
}

export interface CrewDistance {
  kind: 'ride' | 'lodging' | 'food';
  ref_id: string;
  /** headline distance for the card badge (km) */
  km: number;
  /** rides only: extra km vs. driving straight to the venue */
  detour_km?: number;
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

// --- Platform policies --------------------------------------------------------
export interface PlatformPolicy {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

// --- SmartAlerts -------------------------------------------------------------
export type CrewAlertKind = 'gear' | 'parking' | 'departure' | 'pool' | 'iou' | 'ride_buddy' | 'custom';

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
  sms_sent_at?: string;
  created_at: string;
}

export interface AlertPreference {
  worker_id: string;
  kind: CrewAlertKind;
  push: boolean;
  sms: boolean;
  updated_at: string;
}

export interface CertGearItem {
  cert_code: string;
  item: string;
}

export interface BaseGearItem {
  item: string;
}

// --- ShiftSwap ---------------------------------------------------------------
export type SwapRequestStatus = 'open' | 'offered' | 'completed' | 'cancelled';
export type SwapClaimStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface SwapRequest {
  id: string;
  assignment_id: string;
  shift_id: string;
  requester_worker_id: string;
  reason?: string;
  sweetener_cents: number;
  accepted_claim_id?: string;
  offered_assignment_id?: string;
  status: SwapRequestStatus;
  company_decision?: 'approved' | 'rejected';
  company_decided_at?: string;
  company_decision_reason?: string;
  created_at: string;
  updated_at: string;
  requester?: Profile;
}

export interface SwapClaim {
  id: string;
  swap_request_id: string;
  claimer_worker_id: string;
  message?: string;
  status: SwapClaimStatus;
  created_at: string;
  updated_at: string;
  claimer?: Profile;
}

/** Cert-gated swap preview — safe fields only (no requester identity). */
export interface LockedSwap {
  swap_id: string;
  sweetener_cents: number;
  posted_at: string;
  missing: { code: string; name: string; state: 'missing' | 'pending' | 'rejected' | 'expired' | 'unsubmitted' }[];
}

// ---------------------------------------------------------------------------
// Company OS — automatic reminders (alerts inbox)
// ---------------------------------------------------------------------------
export type AlertKind = 'unfilled_call' | 'cert_expiring' | 'timesheet_pending' | 'shift_tomorrow' | 'cert_review';
export type AlertSeverity = 'info' | 'warning' | 'urgent';
export type AlertStatus = 'open' | 'resolved' | 'dismissed';

export interface CompanyAlert {
  id: string;
  company_id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  body?: string | null;
  dedupe_key?: string | null;
  event_id?: string | null;
  shift_id?: string | null;
  timesheet_id?: string | null;
  due_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
  event?: { id: string; name: string } | null;
  shift?: { id: string; title: string; starts_at: string } | null;
}

