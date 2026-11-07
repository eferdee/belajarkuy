const express = require('express');
const { validate, parseId } = require('../validate');

/**
 * Router CRUD generik yang selalu dibatasi pada user yang sedang login.
 * Nama tabel & kolom hanya berasal dari konstanta di server (bukan input user).
 */
function crudRouter(db, { table, rules, orderBy, touch = false, check }) {
  const router = express.Router();
  const cols = Object.keys(rules);

  const list = db.prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY ${orderBy}`);
  const one = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`);
  const insert = db.prepare(
    `INSERT INTO ${table} (user_id, ${cols.join(', ')}) VALUES (@user_id, ${cols.map((c) => '@' + c).join(', ')})`
  );
  const remove = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`);

  const notFound = (res) => res.status(404).json({ error: 'Data tidak ditemukan.' });

  router.get('/', (req, res) => res.json(list.all(req.userId)));

  router.post('/', (req, res) => {
    const data = validate(req.body, rules);
    if (check) check(data);
    const { lastInsertRowid } = insert.run({ ...data, user_id: req.userId });
    res.status(201).json(one.get(lastInsertRowid, req.userId));
  });

  router.get('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const row = id && one.get(id, req.userId);
    row ? res.json(row) : notFound(res);
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const existing = id && one.get(id, req.userId);
    if (!existing) return notFound(res);

    const data = validate(req.body, rules, { partial: true });
    if (check) check({ ...existing, ...data });
    const keys = Object.keys(data);
    if (keys.length) {
      const set = keys.map((k) => `${k} = @${k}`).concat(touch ? ["updated_at = datetime('now')"] : []);
      db.prepare(`UPDATE ${table} SET ${set.join(', ')} WHERE id = @id AND user_id = @user_id`)
        .run({ ...data, id, user_id: req.userId });
    }
    res.json(one.get(id, req.userId));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const info = id ? remove.run(id, req.userId) : { changes: 0 };
    info.changes ? res.status(204).end() : notFound(res);
  });

  return router;
}

module.exports = { crudRouter };
