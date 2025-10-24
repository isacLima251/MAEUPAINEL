const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/database');

const setupApp = () => {
  const db = createDatabase({ path: ':memory:' });
  const { app } = createApp({ db });
  return { app, db };
};

test('GET /api/sales returns an empty list when there are no records', async () => {
  const { app, db } = setupApp();

  const response = await request(app).get('/api/sales');

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, []);

  await new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
});

test('POST /api/postback upserts a sale and GET /api/sales lists it', async () => {
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

  await new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
});
