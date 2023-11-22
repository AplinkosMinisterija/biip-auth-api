/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('permissions', (table) => {
    table.increments('id');
    table.integer('userId').unsigned();
    table.integer('groupId').unsigned();
    table.integer('appId').unsigned();
    table.enu('role', ['USER', 'ADMIN'], {
      useNative: true,
      enumName: 'permission_user_role',
    });
    table.jsonb('accesses');
    table.jsonb('features');
    table.timestamp('createdAt');
    table.integer('createdBy').unsigned();
    table.timestamp('updatedAt');
    table.integer('updatedBy').unsigned();
    table.timestamp('deletedAt');
    table.integer('deletedBy').unsigned();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('permissions');
};
