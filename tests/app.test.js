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
  assert.equal(listResponse.body[0].attendant_code, 'nao_definido');
  assert.equal(listResponse.body[0].attendant_name, 'Não Definido');
  assert.equal(listResponse.body[0].valor_formatado, 'R$ 50,00');
  assert.equal(listResponse.body[0].status_css_class, 'agendado');
  assert.equal(listResponse.body[0].data_formatada, '01/10/2023');

  await closeDatabase(db);
});

test('POST /api/postback requires transaction_id', async () => {
  const { app, db } = setupApp();

  const response = await request(app).post('/api/postback').send({});

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, 'transaction_id is required.');

  await closeDatabase(db);
});

test('POST /api/postback identifies attendant from email prefix', async () => {
  const { app, db } = setupApp();

  const payload = {
    transaction_id: 'with-attendant',
    status_code: 3,
    status_text: 'Pago',
    client_email: 'joaocliente@example.com',
    product_name: 'Produto Premium',
    total_value_cents: 150000,
    created_at: '2024-01-02 09:00:00',
    updated_at: '2024-01-02 09:00:00'
  };

  const response = await request(app).post('/api/postback').send(payload);
  assert.equal(response.statusCode, 201);

  const listResponse = await request(app).get('/api/sales');
  assert.equal(listResponse.statusCode, 200);
  const [sale] = listResponse.body;
  assert.equal(sale.attendant_code, 'joao');
  assert.equal(sale.attendant_name, 'João');
  assert.equal(sale.valor_formatado, 'R$ 1.500,00');
  assert.equal(sale.status_css_class, 'pago');
  assert.equal(sale.data_formatada, '02/01/2024');

  await closeDatabase(db);
});

test('GET /api/sales applies filters for status, attendant and search', async () => {
  const { app, db } = setupApp();

  const salesPayloads = [
    {
      transaction_id: 'tx-paid',
      status_code: 3,
      status_text: 'Pago',
      client_email: 'joaopessoa@example.com',
      product_name: 'Produto Pago',
      total_value_cents: 20000,
      created_at: '2024-01-10 10:00:00',
      updated_at: '2024-01-10 10:00:00'
    },
    {
      transaction_id: 'tx-scheduled',
      status_code: 2,
      status_text: 'Agendado',
      client_email: 'mariaatendimento@example.com',
      product_name: 'Produto Agendado',
      total_value_cents: 30000,
      created_at: '2024-01-09 10:00:00',
      updated_at: '2024-01-09 10:00:00'
    },
    {
      transaction_id: 'tx-other',
      status_code: 5,
      status_text: 'Frustrado',
      client_email: 'cliente@example.com',
      product_name: 'Produto Cancelado',
      total_value_cents: 10000,
      created_at: '2024-01-08 10:00:00',
      updated_at: '2024-01-08 10:00:00'
    }
  ];

  for (const payload of salesPayloads) {
    const response = await request(app).post('/api/postback').send(payload);
    assert.equal(response.statusCode, 201);
  }

  const statusResponse = await request(app).get('/api/sales').query({ status: 'pago' });
  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.body.length, 1);
  assert.equal(statusResponse.body[0].transaction_id, 'tx-paid');

  const attendantResponse = await request(app).get('/api/sales').query({ attendant: 'mari' });
  assert.equal(attendantResponse.statusCode, 200);
  assert.equal(attendantResponse.body.length, 1);
  assert.equal(attendantResponse.body[0].transaction_id, 'tx-scheduled');

  const searchResponse = await request(app).get('/api/sales').query({ search: 'cancel' });
  assert.equal(searchResponse.statusCode, 200);
  assert.equal(searchResponse.body.length, 1);
  assert.equal(searchResponse.body[0].transaction_id, 'tx-other');

  const combinedResponse = await request(app)
    .get('/api/sales')
    .query({ status: 'pago', attendant: 'joao', search: 'pago' });
  assert.equal(combinedResponse.statusCode, 200);
  assert.equal(combinedResponse.body.length, 1);
  assert.equal(combinedResponse.body[0].transaction_id, 'tx-paid');

  await closeDatabase(db);
});
