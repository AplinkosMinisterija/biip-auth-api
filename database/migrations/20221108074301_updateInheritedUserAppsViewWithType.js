/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.raw(`
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

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropViewIfExists('inherited_user_apps');
};
