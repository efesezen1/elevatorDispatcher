const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let _db;

function getDb() {
  if (_db) return _db;

  _db = new Database(process.env.DB_PATH || './water.db');
  _db.pragma('foreign_keys = ON');
  _db.pragma('journal_mode = WAL');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  _db.exec(schema);

  return _db;
}

module.exports = { getDb };
