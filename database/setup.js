const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const databasePath = path.join(__dirname, 'university.db');

const db = new sqlite3.Database(databasePath, (error) => {
  if (error) {
    console.error('Failed to create or open university.db:', error.message);
    return;
  }

  console.log('Connected to university.db');
});

db.run(
  `CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY,
    courseCode TEXT,
    title TEXT,
    credits INTEGER,
    description TEXT,
    semester TEXT
  )`,
  (error) => {
    if (error) {
      console.error('Failed to create courses table:', error.message);
    } else {
      console.log('Database university.db created successfully');
    }

    db.close((closeError) => {
      if (closeError) {
        console.error('Failed to close database connection:', closeError.message);
        return;
      }

      console.log('Database connection closed');
    });
  }
);

module.exports = db;