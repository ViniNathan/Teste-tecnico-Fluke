/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
	pgm.sql(`
    ALTER TABLE rule_versions
    ALTER COLUMN condition TYPE JSONB
    USING to_jsonb(condition);
  `);
};

exports.down = (pgm) => {
	pgm.sql(`
    ALTER TABLE rule_versions
    ALTER COLUMN condition TYPE TEXT
    USING condition::text;
  `);
};
