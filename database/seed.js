const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const databasePath = path.join(__dirname, 'university.db');
const courses = [
  [1, 'CS101', 'Intro Programming', 3, 'Learn Python basics', 'Fall 2024'],
  [2, 'BIO120', 'General Biology', 3, 'Introduction to biological principles', 'Fall 2024'],
  [3, 'MATH150', 'Calculus I', 4, 'Basic calculus', 'Fall 2024'],
  [4, 'ENG101', 'Composition I', 3, 'Academic writing and critical thinking', 'Spring 2025'],
  [5, 'ME210', 'Thermodynamics', 3, 'Principles of thermodynamics and heat transfer', 'Spring 2025'],
  [6, 'CS301', 'Database Systems', 3, 'Design and implementation of database systems', 'Fall 2024'],
  [7, 'PHYS201', 'Physics II', 4, 'Electricity, magnetism, and modern physics', 'Spring 2025'],
  [8, 'CS201', 'Data Structures', 4, 'Study of fundamental data structures and algorithms', 'Spring 2025'],
];
const insertCourseSql = `
  INSERT OR REPLACE INTO courses
    (id, courseCode, title, credits, description, semester)
  VALUES (?, ?, ?, ?, ?, ?)
`;

const db = new sqlite3.Database(
  databasePath,
  sqlite3.OPEN_READWRITE,
  (error) => {
    if (error) {
      console.error('Failed to connect to university.db:', error.message);
      return;
    }

    console.log('Connected to university.db');

    let insertFailed = false;
    db.serialize(() => {
      courses.forEach((course) => {
        db.run(insertCourseSql, course, (insertError) => {
          if (insertError) {
            insertFailed = true;
            console.error('Failed to insert course:', insertError.message);
          }
        });
      });

      db.close((closeError) => {
        if (closeError) {
          console.error('Failed to close database connection:', closeError.message);
          return;
        }

        if (!insertFailed) {
          console.log('Course values were successfully added to the database');
        }
        console.log('Database connection closed');
      });
    });
  }
);