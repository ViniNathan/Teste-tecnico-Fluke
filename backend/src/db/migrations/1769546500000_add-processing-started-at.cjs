/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
	pgm.sql(`
    ALTER TABLE events
    ADD COLUMN processing_started_at TIMESTAMP;

    CREATE INDEX idx_events_processing_started_at
      ON events(state, processing_started_at);
  `);
};

exports.down = (pgm) => {
	pgm.sql(`
    DROP INDEX IF EXISTS idx_events_processing_started_at;
    ALTER TABLE events
    DROP COLUMN IF EXISTS processing_started_at;
  `);
};
