/**
 * Periodic password rotation for admins: track when each local password was
 * last set. Existing rows are backfilled to `createdAt` so current admins are
 * treated as expired and forced to rotate on their next login (rows with no
 * `createdAt` stay NULL, which the app also treats as "must change").
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('usersLocal', (table) => {
      table.timestamp('lastPasswordChangeAt');
    })
    .then(() =>
      knex('usersLocal')
        .whereNull('lastPasswordChangeAt')
        .update({ lastPasswordChangeAt: knex.ref('createdAt') }),
    );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('usersLocal', (table) => {
    table.dropColumn('lastPasswordChangeAt');
  });
};
