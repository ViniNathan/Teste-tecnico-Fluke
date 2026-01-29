/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
	pgm.sql(`
    ALTER TABLE rule_executions
    DROP CONSTRAINT IF EXISTS rule_executions_result_check;

    ALTER TABLE rule_executions
    ADD CONSTRAINT rule_executions_result_check
    CHECK (result IN ('applied', 'skipped', 'failed', 'deduped'));
  `);
};

exports.down = (pgm) => {
	pgm.sql(`
    ALTER TABLE rule_executions
    DROP CONSTRAINT IF EXISTS rule_executions_result_check;

    ALTER TABLE rule_executions
    ADD CONSTRAINT rule_executions_result_check
    CHECK (result IN ('applied', 'skipped', 'failed'));
  `);
};
