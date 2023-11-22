/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.raw(`
    CREATE OR REPLACE VIEW inherited_group_apps
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
        AND g.deleted_at is null
      )
    SELECT group_id, inherited_apps_ids FROM groups_with_inherited_apps order BY group_id;
  `).raw(`
    CREATE OR REPLACE VIEW inherited_user_apps
    AS
      SELECT user_id, jsonb_agg(inherited_apps_ids) AS inherited_apps_ids, user_type FROM (
        SELECT DISTINCT(user_id), user_type, jsonb_array_elements(inherited_apps_ids) AS inherited_apps_ids FROM (
          SELECT u.id AS user_id, u.type AS user_type, ug.group_id, u.apps_ids AS user_apps_ids, iga.inherited_apps_ids AS group_apps_ids,
          CASE 
            WHEN u.type = 'SUPER_ADMIN' THEN (SELECT jsonb_agg(id) FROM (SELECT id FROM apps) AS apps_ids) 
            WHEN jsonb_array_length(u.apps_ids::jsonb) = 0 THEN iga.inherited_apps_ids
            ELSE u.apps_ids
          END AS inherited_apps_ids
          FROM users u 
          LEFT JOIN user_groups ug ON ug.user_id = u.id
          LEFT JOIN inherited_group_apps iga ON iga.group_id = ug.group_id 
          WHERE u.deleted_at is null
          ORDER by u.id 
        ) AS users_with_groups
      ) AS users_with_split_groups
      GROUP BY user_id, user_type
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.raw(`
    CREATE OR REPLACE VIEW inherited_group_apps
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
  `).raw(`
    CREATE OR REPLACE VIEW inherited_user_apps
    AS
      SELECT user_id, jsonb_agg(inherited_apps_ids) AS inherited_apps_ids, user_type FROM (
        SELECT DISTINCT(user_id), user_type, jsonb_array_elements(inherited_apps_ids) AS inherited_apps_ids FROM (
          SELECT u.id AS user_id, u.type AS user_type, ug.group_id, u.apps_ids AS user_apps_ids, iga.inherited_apps_ids AS group_apps_ids,
          CASE 
            WHEN u.type = 'SUPER_ADMIN' THEN (SELECT jsonb_agg(id) FROM (SELECT id FROM apps) AS apps_ids) 
            WHEN jsonb_array_length(u.apps_ids::jsonb) = 0 THEN iga.inherited_apps_ids
            ELSE u.apps_ids
          END AS inherited_apps_ids
          FROM users u 
          LEFT JOIN user_groups ug ON ug.user_id = u.id
          LEFT JOIN inherited_group_apps iga ON iga.group_id = ug.group_id 
          ORDER by u.id 
        ) AS users_with_groups
      ) AS users_with_split_groups
      GROUP BY user_id, user_type
  `);
};
