/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- ============================================
    -- EVENTS TABLE
    -- ============================================
    CREATE TABLE events (
      id SERIAL PRIMARY KEY,
      external_id VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      state VARCHAR(20) NOT NULL CHECK (state IN ('pending', 'processing', 'processed', 'failed')),
      received_count INTEGER DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP,
      replayed_at TIMESTAMP,
      CONSTRAINT unique_external_id UNIQUE (external_id)
    );

    CREATE INDEX idx_events_state ON events(state);
    CREATE INDEX idx_events_type ON events(type);
    CREATE INDEX idx_events_created_at ON events(created_at);
    CREATE INDEX idx_events_payload ON events USING GIN (payload);

    -- ============================================
    -- EVENT_ATTEMPTS TABLE
    -- ============================================
    CREATE TABLE event_attempts (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      status VARCHAR(20) CHECK (status IN ('success', 'failed')),
      error TEXT,
      started_at TIMESTAMP NOT NULL,
      finished_at TIMESTAMP
    );

    CREATE INDEX idx_attempts_event_id ON event_attempts(event_id);
    CREATE INDEX idx_attempts_started_at ON event_attempts(started_at);

    -- ============================================
    -- RULES TABLE
    -- ============================================
    CREATE TABLE rules (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      current_version_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_rules_event_type ON rules(event_type);
    CREATE INDEX idx_rules_active ON rules(active);

    -- ============================================
    -- RULE_VERSIONS TABLE
    -- ============================================
    CREATE TABLE rule_versions (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
      condition TEXT NOT NULL,
      action JSONB NOT NULL,
      version INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_rule_version UNIQUE (rule_id, version)
    );

    CREATE INDEX idx_rule_versions_rule_id ON rule_versions(rule_id);

    -- ============================================
    -- RULE_EXECUTIONS TABLE
    -- ============================================
    CREATE TABLE rule_executions (
      id SERIAL PRIMARY KEY,
      attempt_id INTEGER NOT NULL REFERENCES event_attempts(id) ON DELETE CASCADE,
      rule_id INTEGER NOT NULL REFERENCES rules(id),
      rule_version_id INTEGER NOT NULL REFERENCES rule_versions(id),
      result VARCHAR(20) CHECK (result IN ('applied', 'skipped', 'failed')),
      error TEXT,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_rule_executions_attempt_id ON rule_executions(attempt_id);

    -- ============================================
    -- Circular FK (rules -> rule_versions)
    -- ============================================
    ALTER TABLE rules 
    ADD CONSTRAINT fk_current_version 
    FOREIGN KEY (current_version_id) 
    REFERENCES rule_versions(id);
  `);
};

exports.down = pgm => {
  // A ordem de drop é importante por causa das FKs
  pgm.sql(`
    ALTER TABLE rules DROP CONSTRAINT IF EXISTS fk_current_version;
    DROP TABLE IF EXISTS rule_executions;
    DROP TABLE IF EXISTS rule_versions;
    DROP TABLE IF EXISTS rules;
    DROP TABLE IF EXISTS event_attempts;
    DROP TABLE IF EXISTS events;
  `);
};