/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .table('userGroups', (table) => {
      table.index('userId');
      table.index('groupId');
      table.index('role');
    })
    .table('groups', (table) => {
      table.index('parentId');
    })
    .table('usersEvartai', (table) => {
      table.index('userId');
    })
    .table('usersLocal', (table) => {
      table.index('userId');
    })
    .table('permissions', (table) => {
      table.index('userId');
      table.index('groupId');
      table.index('appId');
      table.index('role');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
