/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('groups', (table) => {
    table.string('companyEmail', 255);
    table.string('companyPhone', 255);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('groups', (table) => {
    table.dropColumn('companyEmail');
    table.dropColumn('companyPhone');
  });
};
