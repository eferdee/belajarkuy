const { ValidationError } = require('../validate');
const { crudRouter } = require('./crud');

const CATEGORY = { max: 40, default: 'Umum' };

function tasksRouter(db) {
  return crudRouter(db, {
    table: 'tasks',
    orderBy: "CASE status WHEN 'completed' THEN 1 ELSE 0 END, due_date IS NULL, due_date, id DESC",
    touch: true,
    rules: {
      title: { required: true, max: 150 },
      category: CATEGORY,
      due_date: { type: 'date', nullable: true },
      priority: { enum: ['low', 'medium', 'high'], default: 'medium' },
      status: { enum: ['todo', 'in_progress', 'completed'], default: 'todo' },
      notes: { max: 2000 },
    },
  });
}

function notesRouter(db) {
  return crudRouter(db, {
    table: 'notes',
    orderBy: 'updated_at DESC, id DESC',
    touch: true,
    rules: {
      title: { required: true, max: 150 },
      category: CATEGORY,
      body: { max: 10000 },
    },
  });
}

function sessionsRouter(db) {
  return crudRouter(db, {
    table: 'sessions',
    orderBy: 'date, start_time, id',
    rules: {
      title: { required: true, max: 150 },
      category: CATEGORY,
      date: { type: 'date', required: true },
      start_time: { type: 'time', required: true },
      end_time: { type: 'time', required: true },
    },
    check: (d) => {
      if (d.start_time && d.end_time && d.end_time <= d.start_time) {
        throw new ValidationError({ end_time: 'Jam selesai harus setelah jam mulai' });
      }
    },
  });
}

module.exports = { tasksRouter, notesRouter, sessionsRouter };
