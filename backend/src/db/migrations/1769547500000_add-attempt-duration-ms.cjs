/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
	pgm.sql(`
    ALTER TABLE event_attempts
    ADD COLUMN duration_ms BIGINT;
  `);
};

exports.down = (pgm) => {
	pgm.sql(`
    ALTER TABLE event_attempts
    DROP COLUMN IF EXISTS duration_ms;
  `);
};
