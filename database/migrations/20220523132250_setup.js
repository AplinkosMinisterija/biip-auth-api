const commonFields = (table) => {
  table.timestamp('createdAt');
  table.integer('createdBy').unsigned();
  table.timestamp('updatedAt');
  table.integer('updatedBy').unsigned();
  table.timestamp('deletedAt');
  table.integer('deletedBy').unsigned();
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('users', (table) => {
      table.increments('id');
      table.string('firstName', 255);
      table.string('lastName', 255);
      table.string('email', 255);
      table.string('phone', 255);
      table
        .enu('type', ['USER', 'ADMIN', 'SUPER_ADMIN'], {
          useNative: true,
          enumName: 'user_type',
        })
        .defaultTo('USER');
      table.jsonb('appsIds');
      commonFields(table);
    })
    .createTable('usersEvartai', (table) => {
      table.increments('id');
      table.integer('userId').unsigned();
      table.string('personalCode', 255);
      table.string('companyCode', 255);
      table.string('companyName', 255);
      commonFields(table);
    })
    .createTable('usersLocal', (table) => {
      table.increments('id');
      table.integer('userId').unsigned();
      table.string('email', 255).notNullable();
      table.string('password', 255);
      table.string('changeHash', 255);
      commonFields(table);
    })
    .createTable('userGroups', (table) => {
      table.increments('id');
      table.integer('userId').unsigned().notNullable();
      table.integer('groupId').unsigned().notNullable();
      table
        .enu('role', ['USER', 'ADMIN'], {
          useNative: true,
          enumName: 'user_group_role',
        })
        .defaultTo('USER');
      commonFields(table);
    })
    .createTable('groups', (table) => {
      table.increments('id');
      table.string('name', 255).notNullable();
      table.integer('parentId').unsigned();
      table.string('companyCode', 255);
      table.jsonb('appsIds');
      commonFields(table);
    })
    .createTable('apps', (table) => {
      table.increments('id');
      table.string('name', 255).notNullable();
      table.text('type').notNullable();
      table.text('apiKey', 255);
      commonFields(table);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('users')
    .dropTableIfExists('usersEvartai')
    .dropTableIfExists('usersLocal')
    .dropTableIfExists('userGroups')
    .dropTableIfExists('groups')
    .dropTableIfExists('apps');
};
