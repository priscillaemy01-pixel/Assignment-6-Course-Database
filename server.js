const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = Number(process.env.PORT) || 3000;
const databasePath = path.join(__dirname, 'database', 'university.db');
let db;
let server;

app.use(express.json({ limit: '1mb' }));

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function getAll(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, parameters, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function getOne(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, parameters, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function run(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, parameters, function (error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function validateCourse(course) {
  if (!course || typeof course !== 'object' || Array.isArray(course)) {
    return 'Request body must be a course object';
  }
  if (typeof course.courseCode !== 'string' || !course.courseCode.trim()) {
    return 'courseCode must be a non-empty string';
  }
  if (typeof course.title !== 'string' || !course.title.trim()) {
    return 'title must be a non-empty string';
  }
  if (!Number.isInteger(course.credits) || course.credits <= 0) {
    return 'credits must be a positive integer';
  }
  if (typeof course.description !== 'string') {
    return 'description must be a string';
  }
  if (typeof course.semester !== 'string' || !course.semester.trim()) {
    return 'semester must be a non-empty string';
  }
  return null;
}

function validateCourseId(request, response, next) {
  if (!/^[1-9]\d*$/.test(request.params.id)) {
    response.status(400).json({ error: 'Course ID must be a positive integer' });
    return;
  }

  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id)) {
    response.status(400).json({ error: 'Course ID must be a positive integer' });
    return;
  }

  request.courseId = id;
  next();
}

function courseValues(course) {
  return [
    course.courseCode.trim(),
    course.title.trim(),
    course.credits,
    course.description,
    course.semester.trim(),
  ];
}

app.get('/api/courses', asyncRoute(async (request, response) => {
  const courses = await getAll('SELECT * FROM courses ORDER BY id');
  response.json(courses);
}));

app.get(
  '/api/courses/:id',
  validateCourseId,
  asyncRoute(async (request, response) => {
    const course = await getOne(
      'SELECT * FROM courses WHERE id = ?',
      [request.courseId]
    );
    if (!course) {
      response.status(404).json({ error: 'Course not found' });
      return;
    }
    response.json(course);
  })
);

app.post('/api/courses', asyncRoute(async (request, response) => {
  const validationError = validateCourse(request.body);
  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  const result = await run(
    `INSERT INTO courses (courseCode, title, credits, description, semester)
     VALUES (?, ?, ?, ?, ?)`,
    courseValues(request.body)
  );
  const course = await getOne('SELECT * FROM courses WHERE id = ?', [result.lastID]);
  response.status(201).json(course);
}));

app.put(
  '/api/courses/:id',
  validateCourseId,
  asyncRoute(async (request, response) => {
    const validationError = validateCourse(request.body);
    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    const result = await run(
      `UPDATE courses
       SET courseCode = ?, title = ?, credits = ?, description = ?, semester = ?
       WHERE id = ?`,
      [...courseValues(request.body), request.courseId]
    );
    if (result.changes === 0) {
      response.status(404).json({ error: 'Course not found' });
      return;
    }

    const course = await getOne(
      'SELECT * FROM courses WHERE id = ?',
      [request.courseId]
    );
    response.json(course);
  })
);

app.delete(
  '/api/courses/:id',
  validateCourseId,
  asyncRoute(async (request, response) => {
    const result = await run(
      'DELETE FROM courses WHERE id = ?',
      [request.courseId]
    );
    if (result.changes === 0) {
      response.status(404).json({ error: 'Course not found' });
      return;
    }
    response.json({ message: 'Course deleted successfully' });
  })
);

app.use((request, response) => {
  response.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, request, response, next) => {
  console.error('API request failed:', error.message);
  if (response.headersSent) {
    next(error);
    return;
  }

  const status = error.status || error.statusCode || 500;
  response.status(status).json({
    error: status >= 500 ? 'Database operation failed' : error.message,
  });
});

db = new sqlite3.Database(
  databasePath,
  sqlite3.OPEN_READWRITE,
  (error) => {
    if (error) {
      console.error('Failed to connect to university.db:', error.message);
      process.exitCode = 1;
      return;
    }

    server = app.listen(port, () => {
      console.log(`Course API listening on http://localhost:${port}`);
    });
  }
);

function closeServer() {
  if (!server) {
    return;
  }

  server.close(() => {
    db.close((error) => {
      if (error) {
        console.error('Failed to close database connection:', error.message);
        process.exitCode = 1;
        return;
      }
      console.log('Database connection closed');
    });
  });
}

process.once('SIGINT', closeServer);
process.once('SIGTERM', closeServer);
