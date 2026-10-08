/*
  # AI Infrastructure and ML Tables

  1. New Tables
    - `agent_states` - Track state of all AI agents
    - `agent_tasks` - Queue and history of agent tasks
    - `agent_decisions` - Audit trail of agent decisions
    - `ml_models` - Metadata for deployed ML models
    - `training_data` - Store training examples for ML
    - `rl_experiences` - Reinforcement learning experience replay
    - `credential_graphs` - Worker credential relationship graphs
    - `match_scores` - Historical matching scores
    - `reputation_scores` - Worker reputation calculations
    - `fraud_signals` - Fraud detection alerts
    - `route_optimizations` - Route planning cache
    - `embedding_cache` - Vector embeddings for semantic search

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access
    - Add admin-only policies for sensitive data

  3. Performance
    - Add indexes for common queries
    - Add partial indexes for active records
    - Add GiST indexes for vector similarity
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Agent States Table
CREATE TABLE IF NOT EXISTS agent_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text UNIQUE NOT NULL,
  agent_type text NOT NULL,
  status text NOT NULL DEFAULT 'idle',
  last_run timestamptz,
  last_error text,
  success_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  average_processing_time_ms numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Agent Tasks Table
CREATE TABLE IF NOT EXISTS agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  task_type text NOT NULL,
  priority integer DEFAULT 5,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending',
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Agent Decisions Table
CREATE TABLE IF NOT EXISTS agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  decision_type text NOT NULL,
  input_data jsonb NOT NULL,
  output_data jsonb NOT NULL,
  confidence numeric,
  reasoning text[],
  performance_metrics jsonb,
  created_at timestamptz DEFAULT now()
);

-- ML Models Table
CREATE TABLE IF NOT EXISTS ml_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  model_type text NOT NULL,
  status text DEFAULT 'training',
  accuracy numeric,
  performance_metrics jsonb,
  input_schema jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  hyperparameters jsonb,
  training_date timestamptz,
  last_evaluated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(name, version)
);

-- Training Data Table
CREATE TABLE IF NOT EXISTS training_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type text NOT NULL,
  features jsonb NOT NULL,
  label jsonb NOT NULL,
  weight numeric DEFAULT 1.0,
  source text,
  created_at timestamptz DEFAULT now()
);

-- RL Experiences Table
CREATE TABLE IF NOT EXISTS rl_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id text NOT NULL,
  state jsonb NOT NULL,
  action jsonb NOT NULL,
  reward numeric NOT NULL,
  next_state jsonb NOT NULL,
  done boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Credential Graphs Table
CREATE TABLE IF NOT EXISTS credential_graphs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nodes jsonb NOT NULL,
  edges jsonb NOT NULL,
  reputation_score numeric DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Match Scores Table
CREATE TABLE IF NOT EXISTS match_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  overall_score numeric NOT NULL,
  skill_match_score numeric,
  availability_score numeric,
  location_score numeric,
  reputation_score numeric,
  historical_success_score numeric,
  confidence numeric,
  reasoning text[],
  created_at timestamptz DEFAULT now(),
  UNIQUE(worker_id, gig_id, created_at)
);

-- Reputation Scores Table
CREATE TABLE IF NOT EXISTS reputation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  overall_score numeric DEFAULT 0,
  reliability numeric DEFAULT 0,
  skill_quality numeric DEFAULT 0,
  communication numeric DEFAULT 0,
  professionalism numeric DEFAULT 0,
  completion_rate numeric DEFAULT 0,
  on_time_rate numeric DEFAULT 0,
  review_average numeric DEFAULT 0,
  total_gigs integer DEFAULT 0,
  trend text DEFAULT 'stable',
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Fraud Signals Table
CREATE TABLE IF NOT EXISTS fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type text NOT NULL,
  entity_id uuid NOT NULL,
  entity_type text NOT NULL,
  severity numeric NOT NULL,
  confidence numeric NOT NULL,
  indicators text[],
  requires_action boolean DEFAULT false,
  investigated boolean DEFAULT false,
  investigation_notes text,
  created_at timestamptz DEFAULT now()
);

-- Route Optimizations Table
CREATE TABLE IF NOT EXISTS route_optimizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  origin jsonb NOT NULL,
  destination jsonb NOT NULL,
  recommended_departure_time timestamptz NOT NULL,
  estimated_travel_time integer NOT NULL,
  route jsonb NOT NULL,
  alternatives jsonb,
  traffic_conditions text,
  weather_impact text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '1 hour')
);

-- Embedding Cache Table (for semantic search)
CREATE TABLE IF NOT EXISTS embedding_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  embedding vector(384),
  text_content text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

-- CREATE INDEX IF NOT EXISTSes for performance
CREATE INDEX IF NOT EXISTS idx_agent_states_agent_id ON agent_states(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_states_status ON agent_states(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority ON agent_tasks(priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_agent_id ON agent_decisions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_created_at ON agent_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_models_status ON ml_models(status) WHERE status = 'deployed';
CREATE INDEX IF NOT EXISTS idx_training_data_model_type ON training_data(model_type);
CREATE INDEX IF NOT EXISTS idx_rl_experiences_episode_id ON rl_experiences(episode_id);
CREATE INDEX IF NOT EXISTS idx_credential_graphs_worker_id ON credential_graphs(worker_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_worker_id ON match_scores(worker_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_gig_id ON match_scores(gig_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_score ON match_scores(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_scores_worker_id ON reputation_scores(worker_id);
CREATE INDEX IF NOT EXISTS idx_reputation_scores_score ON reputation_scores(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_entity ON fraud_signals(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_requires_action ON fraud_signals(requires_action) WHERE requires_action = true;
CREATE INDEX IF NOT EXISTS idx_route_optimizations_worker_gig ON route_optimizations(worker_id, gig_id);
CREATE INDEX IF NOT EXISTS idx_route_optimizations_expires_at ON route_optimizations(expires_at);

-- GiST index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_embedding_cache_vector ON embedding_cache USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_entity ON embedding_cache(entity_type, entity_id);

-- Enable Row Level Security
ALTER TABLE agent_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE rl_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_optimizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_states (admin only)
DROP POLICY IF EXISTS "Admins can manage agent states" ON agent_states;
CREATE POLICY "Admins can manage agent states" ON agent_states
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for agent_tasks (admin only)
DROP POLICY IF EXISTS "Admins can manage agent tasks" ON agent_tasks;
CREATE POLICY "Admins can manage agent tasks" ON agent_tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for agent_decisions (admin only)
DROP POLICY IF EXISTS "Admins can view agent decisions" ON agent_decisions;
CREATE POLICY "Admins can view agent decisions" ON agent_decisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for ml_models (read for authenticated, write for admin)
DROP POLICY IF EXISTS "Authenticated users can view ML models" ON ml_models;
CREATE POLICY "Authenticated users can view ML models" ON ml_models
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage ML models" ON ml_models;
CREATE POLICY "Admins can manage ML models" ON ml_models
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for credential_graphs
DROP POLICY IF EXISTS "Workers can view own credential graph" ON credential_graphs;
CREATE POLICY "Workers can view own credential graph" ON credential_graphs
  FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid());

DROP POLICY IF EXISTS "System can manage credential graphs" ON credential_graphs;
CREATE POLICY "System can manage credential graphs" ON credential_graphs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for match_scores
DROP POLICY IF EXISTS "Workers can view own match scores" ON match_scores;
CREATE POLICY "Workers can view own match scores" ON match_scores
  FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid());

DROP POLICY IF EXISTS "Companies can view match scores for their gigs" ON match_scores;
CREATE POLICY "Companies can view match scores for their gigs" ON match_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM gigs
      WHERE gigs.id = match_scores.gig_id
      AND gigs.created_by = auth.uid()
    )
  );

-- RLS Policies for reputation_scores
DROP POLICY IF EXISTS "Workers can view own reputation" ON reputation_scores;
CREATE POLICY "Workers can view own reputation" ON reputation_scores
  FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid());

DROP POLICY IF EXISTS "All users can view worker reputations" ON reputation_scores;
CREATE POLICY "All users can view worker reputations" ON reputation_scores
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for fraud_signals (admin only)
DROP POLICY IF EXISTS "Admins can manage fraud signals" ON fraud_signals;
CREATE POLICY "Admins can manage fraud signals" ON fraud_signals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for route_optimizations
DROP POLICY IF EXISTS "Workers can view own route optimizations" ON route_optimizations;
CREATE POLICY "Workers can view own route optimizations" ON route_optimizations
  FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid());

DROP POLICY IF EXISTS "System can manage route optimizations" ON route_optimizations;
CREATE POLICY "System can manage route optimizations" ON route_optimizations
  FOR INSERT
  TO authenticated
  USING (worker_id = auth.uid());

-- RLS Policies for embedding_cache (read for authenticated)
DROP POLICY IF EXISTS "Authenticated users can read embeddings" ON embedding_cache;
CREATE POLICY "Authenticated users can read embeddings" ON embedding_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- CREATE OR REPLACE FUNCTION to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE OR REPLACE TRIGGER update_agent_states_updated_at
  BEFORE UPDATE ON agent_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_ml_models_updated_at
  BEFORE UPDATE ON ml_models
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_embedding_cache_updated_at
  BEFORE UPDATE ON embedding_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- CREATE OR REPLACE FUNCTION to clean up expired route optimizations
CREATE OR REPLACE FUNCTION cleanup_expired_route_optimizations()
RETURNS void AS $$
BEGIN
  DELETE FROM route_optimizations
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;
