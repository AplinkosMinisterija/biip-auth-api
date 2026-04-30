const { knexSnakeCaseMappers } = require('objection');
require('dotenv').config();

if (!process.env.DB_CONNECTION) {
  throw new Error('No database connection!');
}
const config = {
  client: 'pg',
  connection: process.env.DB_CONNECTION,
  migrations: {
    tableName: 'migrations',
    directory: './database/migrations',
  },
  // Bumped from 10 → 30 to absorb thundering herd on cold permissions cache
  // (the heavy inherited_user_apps view query). Recalibrate after we materialize.
  pool: { min: 2, max: 30 },
  ...knexSnakeCaseMappers(),
};

export default config;
module.exports = config;
