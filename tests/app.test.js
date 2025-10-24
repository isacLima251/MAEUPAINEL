const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/server');

const setupApp = () => {
  const { app, db } = createApp({ databasePath: ':memory:' });
  return { app, db };
};

const closeDatabase = (db) =>
  new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

test('GET /api/sales returns an empty list when there are no records', async () => {
  const { app, db } = setupApp();

  const response = await request(app).get('/api/sales');

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, []);

  await closeDatabase(db);
});

test('POST /api/postback stores the sale and GET /api/sales returns it', async () => {
  const { app, db } = setupApp();

  const payload = {
    transaction_id: 'abc123',
    status_code: 1,
    status_text: 'Aguardando Pagamento',
    client_email: 'cliente@example.com',
    product_name: 'Produto Exemplo',
    total_value_cents: 5000,
    created_at: '2023-10-01 10:00:00',
    updated_at: '2023-10-01 10:00:00'
  };

  const postResponse = await request(app).post('/api/postback').send(payload);
  assert.equal(postResponse.statusCode, 201);

  const listResponse = await request(app).get('/api/sales');
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.length, 1);
  assert.equal(listResponse.body[0].transaction_id, payload.transaction_id);
  assert.equal(listResponse.body[0].status_code, payload.status_code);

  await closeDatabase(db);
});

test('POST /api/postback requires transaction_id', async () => {
  const { app, db } = setupApp();

  const response = await request(app).post('/api/postback').send({});

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, 'transaction_id is required.');

  await closeDatabase(db);
});
