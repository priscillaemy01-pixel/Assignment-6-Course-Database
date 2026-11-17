const http = require('http');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const port = Number(process.env.PORT) || 3000;
const databasePath = path.join(__dirname, 'database', 'university.db');

function sendJson(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(data));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;

    request.on('data', (chunk) => {
      if (tooLarge) {
        return;
      }

      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 1024) {
        tooLarge = true;
        const error = new Error('Request body must be no larger than 1 MB');
        error.statusCode = 413;
        reject(error);
      }
    });

    request.on('end', () => {
      if (tooLarge) {
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error('Request body must be valid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });

    request.on('error', reject);
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

function getAll(db, sql, parameters = []) {
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

function getOne(db, sql, parameters = []) {
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

function run(db, sql, parameters = []) {
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

async function handleRequest(db, request, response) {
  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(/^\/api\/courses(?:\/([^/]+))?\/?$/);

  if (!match) {
    sendJson(response, 404, { error: 'Endpoint not found' });
    return;
  }

  const idSegment = match[1];
  const id = idSegment === undefined ? null : Number(idSegment);
  if (idSegment !== undefined && (!Number.isInteger(id) || id <= 0)) {
    sendJson(response, 400, { error: 'Course ID must be a positive integer' });
    return;
  }

  const allowedMethods = idSegment === undefined
    ? ['GET', 'POST']
    : ['GET', 'PUT', 'DELETE'];
  if (!allowedMethods.includes(request.method)) {
    sendJson(response, 405, { error: 'Method not allowed' }, {
      Allow: allowedMethods.join(', '),
    });
    return;
  }

  try {
    if (request.method === 'GET' && id === null) {
      const courses = await getAll(db, 'SELECT * FROM courses ORDER BY id');
      sendJson(response, 200, courses);
      return;
    }

    if (request.method === 'GET') {
      const course = await getOne(db, 'SELECT * FROM courses WHERE id = ?', [id]);
      if (!course) {
        sendJson(response, 404, { error: 'Course not found' });
        return;
      }
      sendJson(response, 200, course);
      return;
    }

    const course = await readJsonBody(request);
    const validationError = validateCourse(course);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const values = [
      course.courseCode.trim(),
      course.title.trim(),
      course.credits,
      course.description,
      course.semester.trim(),
    ];

    if (request.method === 'POST') {
      const result = await run(
        db,
        `INSERT INTO courses (courseCode, title, credits, description, semester)
         VALUES (?, ?, ?, ?, ?)`,
        values
      );
      const createdCourse = await getOne(
        db,
        'SELECT * FROM courses WHERE id = ?',
        [result.lastID]
      );
      sendJson(response, 201, createdCourse);
      return;
    }

    if (request.method === 'PUT') {
      const result = await run(
        db,
        `UPDATE courses
         SET courseCode = ?, title = ?, credits = ?, description = ?, semester = ?
         WHERE id = ?`,
        [...values, id]
      );
      if (result.changes === 0) {
        sendJson(response, 404, { error: 'Course not found' });
        return;
      }

      const updatedCourse = await getOne(
        db,
        'SELECT * FROM courses WHERE id = ?',
        [id]
      );
      sendJson(response, 200, updatedCourse);
      return;
    }

    const result = await run(db, 'DELETE FROM courses WHERE id = ?', [id]);
    if (result.changes === 0) {
      sendJson(response, 404, { error: 'Course not found' });
      return;
    }
    sendJson(response, 200, { message: 'Course deleted successfully' });
  } catch (error) {
    console.error('API request failed:', error.message);
    sendJson(response, error.statusCode || 500, {
      error: error.statusCode ? error.message : 'Database operation failed',
    });
  }
}

const server = http.createServer((request, response) => {
  handleRequest(db, request, response).catch((error) => {
    console.error('Unexpected API error:', error.message);
    sendJson(response, 500, { error: 'Internal server error' });
  });
});

const db = new sqlite3.Database(
  databasePath,
  sqlite3.OPEN_READWRITE,
  (error) => {
    if (error) {
      console.error('Failed to connect to university.db:', error.message);
      process.exitCode = 1;
      return;
    }

    server.listen(port, () => {
      console.log(`Course API listening on http://localhost:${port}`);
    });
  }
);

function closeServer() {
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
