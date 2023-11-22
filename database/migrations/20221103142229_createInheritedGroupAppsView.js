/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.raw(`
    CREATE VIEW inherited_group_apps
    AS
      WITH RECURSIVE groups_with_inherited_apps AS (
        SELECT distinct(id) AS group_id, parent_id, apps_ids, apps_ids AS inherited_apps_ids
        FROM groups 
        WHERE parent_id IS NULL
        UNION 
          SELECT g.id AS group_id, g.parent_id, g.apps_ids, 
          CASE 
            WHEN jsonb_array_length(g.apps_ids::jsonb) = 0 THEN groups_with_inherited_apps.inherited_apps_ids
            WHEN g.apps_ids IS NULL THEN groups_with_inherited_apps.inherited_apps_ids
            ELSE g.apps_ids
          END
          AS inherited_apps_ids
          FROM groups g 
          JOIN groups_with_inherited_apps 
            ON groups_with_inherited_apps.group_id = g.parent_id 
        WHERE g.parent_id is not null
      )
    SELECT group_id, inherited_apps_ids FROM groups_with_inherited_apps order BY group_id;
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropView('inherited_group_apps');
};
