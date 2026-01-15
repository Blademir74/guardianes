// scripts/checkSchema.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:NuevaClave123@localhost:5432/guardianes_db',
});

checkSchema();