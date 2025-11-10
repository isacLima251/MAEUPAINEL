const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/server');

const loginAndGetToken = async (app) => {
  const response = await request(app).post('/api/login').send({ username: 'admin', password: 'admin' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.token, 'Expected login response to include a token');
  return response.body.token;
};

const createAuthClient = (app, token) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
  put: (url) => request(app).put(url).set('Authorization', `Bearer ${token}`),
  delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`)
});

const setupApp = () => {
  const { app, db } = createApp({ databasePath: ':memory:' });
  return { app, db };
};

const closeDatabase = (db) =>
  new Promise((resolve, reject) => {
    db.close((error) => {
      if (error && error.code !== 'SQLITE_BUSY' && error.code !== 'SQLITE_MISUSE') {
        reject(error);
      } else {
        resolve();
      }
    });
  });

const currentMonthDate = (day = 15) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dayString = String(Math.min(Math.max(day, 1), 28)).padStart(2, '0');
  return `${year}-${month}-${dayString} 12:00:00`;
};

const padTwoDigits = (value) => String(value).padStart(2, '0');

const formatDateTime = (date) => {
  const year = date.getFullYear();
  const month = padTwoDigits(date.getMonth() + 1);
  const day = padTwoDigits(date.getDate());
  const hours = padTwoDigits(date.getHours());
  const minutes = padTwoDigits(date.getMinutes());
  const seconds = padTwoDigits(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const dateDaysFromToday = (days) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatDateTime(date);
};

const dateInThisMonth = (day = 15) => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(Math.max(day, 1), maxDay));
  return formatDateTime(target);
};

const dateInLastMonth = (day = 10) => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12, 0, 0, 0);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(Math.max(day, 1), maxDay));
  return formatDateTime(target);
};

test('GET /api/sales returns an empty list when there are no records', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();

  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const response = await auth.get('/api/sales');

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, []);

  await closeDatabase(db);
});

test('POST /api/postback stores the sale and GET /api/sales returns it', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const payload = {
    transaction_id: 'abc123',
    status_code: 1,
    status_text: 'Aguardando Pagamento',
    client_email: 'cliente@example.com',
    client_name: 'Cliente Exemplo',
    client_cpf: '123.456.789-00',
    client_phone: '(11) 91234-5678',
    product_name: 'Produto Exemplo',
    total_value_cents: 5000,
    created_at: '2023-10-01 10:00:00',
    updated_at: '2023-10-01 10:00:00'
  };

  const postResponse = await request(app).post('/api/postback').send(payload);
  assert.equal(postResponse.statusCode, 201);

  const listResponse = await auth.get('/api/sales');
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.length, 1);
  assert.equal(listResponse.body[0].transaction_id, payload.transaction_id);
  assert.equal(listResponse.body[0].status_code, payload.status_code);
  assert.equal(listResponse.body[0].attendant_code, 'nao_definido');
  assert.equal(listResponse.body[0].attendant_name, 'Não Definido');
  assert.equal(listResponse.body[0].client_name, payload.client_name);
  assert.equal(listResponse.body[0].client_cpf, payload.client_cpf);
  assert.equal(listResponse.body[0].client_phone, payload.client_phone);
  assert.equal(listResponse.body[0].valor_formatado, 'R$ 50,00');
  assert.equal(listResponse.body[0].status_css_class, 'agendado');
  assert.equal(listResponse.body[0].data_formatada, '01/10/2023');

  await closeDatabase(db);
});

test('GET /api/postback-url returns the resolved URL', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const response = await auth.get('/api/postback-url').set('Host', 'painel.example.com');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { url: 'http://painel.example.com/api/postback' });

  await closeDatabase(db);
});

test('POST /api/postback requires transaction_id', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();

  const response = await request(app).post('/api/postback').send({});

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, 'transaction_id is required.');

  await closeDatabase(db);
});

test('POST /api/attendants requires a 4-character code', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const shortCodeResponse = await auth
    .post('/api/attendants')
    .send({ name: 'Teste', code: 'abc' });
  assert.equal(shortCodeResponse.statusCode, 400);

  const invalidCharResponse = await auth
    .post('/api/attendants')
    .send({ name: 'Teste', code: 'abc!' });
  assert.equal(invalidCharResponse.statusCode, 400);

  const reservedCodeResponse = await auth
    .post('/api/attendants')
    .send({ name: 'Teste', code: 'nao_definido' });
  assert.equal(reservedCodeResponse.statusCode, 400);

  const validResponse = await auth
    .post('/api/attendants')
    .send({ name: 'Teste', code: 'abcd' });
  assert.equal(validResponse.statusCode, 201);

  await closeDatabase(db);
});

test('POST /api/postback identifies attendant from email prefix', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const attendantCreateResponse = await auth
    .post('/api/attendants')
    .send({ name: 'João', code: 'joao', monthlyCost: 150 });
  assert.equal(attendantCreateResponse.statusCode, 201);
  assert.deepEqual(attendantCreateResponse.body, {
    code: 'joao',
    name: 'João',
    monthlyCost: 150
  });

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

  const listResponse = await auth.get('/api/sales');
  assert.equal(listResponse.statusCode, 200);
  const [sale] = listResponse.body;
  assert.equal(sale.attendant_code, 'joao');
  assert.equal(sale.attendant_name, 'João');
  assert.equal(sale.valor_formatado, 'R$ 1.500,00');
  assert.equal(sale.status_css_class, 'pago');
  assert.equal(sale.data_formatada, '02/01/2024');

  await closeDatabase(db);
});

test('PUT /api/sales/:transactionId/status updates sale status manually', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const salePayload = {
    transaction_id: 'manual-status-1',
    status_code: 2,
    status_text: 'Agendado',
    client_email: 'cliente@example.com',
    product_name: 'Produto Manual',
    total_value_cents: 12345,
    created_at: '2024-02-10 08:00:00',
    updated_at: '2024-02-10 08:00:00'
  };

  const postResponse = await request(app).post('/api/postback').send(salePayload);
  assert.equal(postResponse.statusCode, 201);

  const updateResponse = await auth
    .put('/api/sales/manual-status-1/status')
    .send({ status: 'pago' });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.body.transaction_id, 'manual-status-1');
  assert.equal(updateResponse.body.status_code, 3);
  assert.equal(updateResponse.body.status_text, 'Pago');
  assert.equal(updateResponse.body.status_css_class, 'pago');

  const listResponse = await auth.get('/api/sales');
  assert.equal(listResponse.statusCode, 200);
  const updatedSale = listResponse.body.find((sale) => sale.transaction_id === 'manual-status-1');
  assert.ok(updatedSale, 'Updated sale should exist');
  assert.equal(updatedSale.status_code, 3);
  assert.equal(updatedSale.status_text, 'Pago');
  assert.equal(updatedSale.status_css_class, 'pago');

  await closeDatabase(db);
});

test('PUT /api/sales/:transactionId/status validates status values', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const salePayload = {
    transaction_id: 'manual-status-2',
    status_code: 2,
    status_text: 'Agendado',
    client_email: 'cliente2@example.com',
    product_name: 'Produto Manual 2',
    total_value_cents: 54321,
    created_at: '2024-02-11 08:00:00',
    updated_at: '2024-02-11 08:00:00'
  };

  const postResponse = await request(app).post('/api/postback').send(salePayload);
  assert.equal(postResponse.statusCode, 201);

  const invalidResponse = await auth
    .put('/api/sales/manual-status-2/status')
    .send({ status: 'invalid' });
  assert.equal(invalidResponse.statusCode, 400);

  const notFoundResponse = await auth
    .put('/api/sales/unknown-transaction/status')
    .send({ status: 'pago' });
  assert.equal(notFoundResponse.statusCode, 404);

  await closeDatabase(db);
});

test('GET /api/sales applies filters for status, attendant and search', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  await auth
    .post('/api/attendants')
    .send({ name: 'João', code: 'joao', monthlyCost: 150 });
  await auth.post('/api/attendants').send({ name: 'Maria', code: 'mari' });

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

  const statusResponse = await auth.get('/api/sales').query({ status: 'pago' });
  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.body.length, 1);
  assert.equal(statusResponse.body[0].transaction_id, 'tx-paid');

  const attendantResponse = await auth.get('/api/sales').query({ attendant: 'mari' });
  assert.equal(attendantResponse.statusCode, 200);
  assert.equal(attendantResponse.body.length, 1);
  assert.equal(attendantResponse.body[0].transaction_id, 'tx-scheduled');

  const searchResponse = await auth.get('/api/sales').query({ search: 'cancel' });
  assert.equal(searchResponse.statusCode, 200);
  assert.equal(searchResponse.body.length, 1);
  assert.equal(searchResponse.body[0].transaction_id, 'tx-other');

  const combinedResponse = await auth
    .get('/api/sales')
    .query({ status: 'pago', attendant: 'joao', search: 'pago' });
  assert.equal(combinedResponse.statusCode, 200);
  assert.equal(combinedResponse.body.length, 1);
  assert.equal(combinedResponse.body[0].transaction_id, 'tx-paid');

  await closeDatabase(db);
});

test('POST /api/attendants creates a new attendant and GET lists it', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const createResponse = await auth
    .post('/api/attendants')
    .send({ name: 'João', code: 'joia', monthlyCost: 250.75 });
  assert.equal(createResponse.statusCode, 201);
  assert.deepEqual(createResponse.body, { code: 'joia', name: 'João', monthlyCost: 250.75 });

  const duplicateResponse = await auth
    .post('/api/attendants')
    .send({ name: 'Outro João', code: 'joia' });
  assert.equal(duplicateResponse.statusCode, 409);

  const listResponse = await auth.get('/api/attendants');
  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.body, [{ code: 'joia', name: 'João', monthlyCost: 250.75 }]);

  await closeDatabase(db);
});

test('GET /api/attendants returns an empty list when database is empty', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const response = await auth.get('/api/attendants');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, []);

  await closeDatabase(db);
});

test('PUT and DELETE /api/attendants update and remove attendants', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  await auth
    .post('/api/attendants')
    .send({ name: 'João', code: 'joia', monthlyCost: 100 });

  const updateResponse = await auth
    .put('/api/attendants/joia')
    .send({ name: 'Joana', newCode: 'joab', monthlyCost: 150.5 });
  assert.equal(updateResponse.statusCode, 200);
  assert.deepEqual(updateResponse.body, { code: 'joab', name: 'Joana', monthlyCost: 150.5 });

  const listResponse = await auth.get('/api/attendants');
  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.body, [{ code: 'joab', name: 'Joana', monthlyCost: 150.5 }]);

  const deleteResponse = await auth.delete('/api/attendants/joab');
  assert.equal(deleteResponse.statusCode, 204);

  const listAfterDelete = await auth.get('/api/attendants');
  assert.equal(listAfterDelete.statusCode, 200);
  assert.deepEqual(listAfterDelete.body, []);

  await closeDatabase(db);
});

test('PUT /api/sales/:transactionId/attendant assigns and clears an attendant', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const attendantCreateResponse = await auth
    .post('/api/attendants')
    .send({ name: 'João', code: 'joao', monthlyCost: 150 });
  assert.equal(attendantCreateResponse.statusCode, 201);
  assert.deepEqual(attendantCreateResponse.body, {
    code: 'joao',
    name: 'João',
    monthlyCost: 150
  });

  const salePayload = {
    transaction_id: 'assign-1',
    status_code: 2,
    status_text: 'Agendado',
    client_email: 'cliente@example.com',
    product_name: 'Produto 1',
    total_value_cents: 10000,
    created_at: currentMonthDate(5),
    updated_at: currentMonthDate(5)
  };

  const postResponse = await request(app).post('/api/postback').send(salePayload);
  assert.equal(postResponse.statusCode, 201);

  const assignResponse = await auth
    .put('/api/sales/assign-1/attendant')
    .send({ attendant_code: 'joao' });
  assert.equal(assignResponse.statusCode, 200);
  assert.equal(assignResponse.body.attendant_code, 'joao');
  assert.equal(assignResponse.body.attendant_name, 'João');

  const clearResponse = await auth
    .put('/api/sales/assign-1/attendant')
    .send({ attendant_code: 'nao_definido' });
  assert.equal(clearResponse.statusCode, 200);
  assert.equal(clearResponse.body.attendant_code, 'nao_definido');
  assert.equal(clearResponse.body.attendant_name, 'Não Definido');

  await closeDatabase(db);
});

test('GET /api/settings returns defaults and PUT updates them', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const defaultResponse = await auth.get('/api/settings');
  assert.equal(defaultResponse.statusCode, 200);
  assert.deepEqual(defaultResponse.body, {
    name: '',
    email: '',
    investment: 0,
    userName: '',
    userEmail: '',
    monthlyInvestment: 0
  });

  const updatePayload = {
    name: 'Ana',
    email: 'ana@example.com',
    investment: 4321.98
  };

  const updateResponse = await auth.put('/api/settings').send(updatePayload);
  assert.equal(updateResponse.statusCode, 200);
  assert.deepEqual(updateResponse.body, {
    ...updatePayload,
    userName: 'Ana',
    userEmail: 'ana@example.com',
    monthlyInvestment: 4321.98
  });

  const verifyResponse = await auth.get('/api/settings');
  assert.equal(verifyResponse.statusCode, 200);
  assert.deepEqual(verifyResponse.body, {
    ...updatePayload,
    userName: 'Ana',
    userEmail: 'ana@example.com',
    monthlyInvestment: 4321.98
  });

  await closeDatabase(db);
});

test('GET /api/summary defaults to today when no period is provided', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const todayDate = dateDaysFromToday(0);
  const yesterdayDate = dateDaysFromToday(-1);

  await request(app)
    .post('/api/postback')
    .send({
      transaction_id: 'summary-today-agendado',
      status_code: 2,
      status_text: 'Agendado',
      client_email: 'today@example.com',
      product_name: 'Produto Hoje',
      total_value_cents: 50000,
      created_at: todayDate,
      updated_at: todayDate
    });

  await request(app)
    .post('/api/postback')
    .send({
      transaction_id: 'summary-yesterday-pago',
      status_code: 3,
      status_text: 'Pago',
      client_email: 'yesterday@example.com',
      product_name: 'Produto Ontem',
      total_value_cents: 70000,
      created_at: yesterdayDate,
      updated_at: yesterdayDate
    });

  const response = await auth.get('/api/summary');

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    agendado: 500,
    pago: 0,
    aReceber: 500,
    frustrado: 0,
    vendasDiretas: 0,
    investimento: 0,
    lucro: 0,
    roi: 0,
    graficoFunil: [500, 0, 500, 0],
    graficoComposicao: [0, 500, 0],
    agendadoMes: 500,
    pagoDoAgendado: 0,
    aReceberAgendado: 500,
    frustradoAgendado: 0,
    investimentoTotal: 0,
    lucroMes: 0
  });

  await closeDatabase(db);
});

test('GET /api/summary aggregates sales data for the current month and attendant filter', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  await auth.put('/api/settings').send({
    userName: 'Empresa',
    userEmail: 'empresa@example.com',
    monthlyInvestment: 200
  });

  const attendantCreateResponse = await auth
    .post('/api/attendants')
    .send({ name: 'João', code: 'joao', monthlyCost: 150 });
  assert.equal(attendantCreateResponse.statusCode, 201);
  assert.deepEqual(attendantCreateResponse.body, {
    code: 'joao',
    name: 'João',
    monthlyCost: 150
  });

  const salesPayloads = [
    {
      transaction_id: 'sum-agendado',
      status_code: 2,
      status_text: 'Agendado',
      client_email: 'cliente-ag@example.com',
      product_name: 'Produto Agendado',
      total_value_cents: 100000,
      created_at: currentMonthDate(3),
      updated_at: currentMonthDate(3)
    },
    {
      transaction_id: 'sum-pago',
      status_code: 3,
      status_text: 'Pago',
      client_email: 'joaovendas@example.com',
      product_name: 'Produto Pago',
      total_value_cents: 30000,
      created_at: currentMonthDate(4),
      updated_at: currentMonthDate(4)
    },
    {
      transaction_id: 'sum-frustrado',
      status_code: 5,
      status_text: 'Frustrado',
      client_email: 'cliente-fr@example.com',
      product_name: 'Produto Frustrado',
      total_value_cents: 20000,
      created_at: currentMonthDate(5),
      updated_at: currentMonthDate(5)
    }
  ];

  for (const payload of salesPayloads) {
    const response = await request(app).post('/api/postback').send(payload);
    assert.equal(response.statusCode, 201);
  }

  await auth
    .put('/api/sales/sum-pago/attendant')
    .send({ attendant_code: 'joao' });

  const attendantsList = await auth.get('/api/attendants');
  assert.equal(attendantsList.statusCode, 200);
  assert.deepEqual(attendantsList.body, [{ code: 'joao', name: 'João', monthlyCost: 150 }]);

  const summaryResponse = await auth.get('/api/summary').query({ period: 'this_month' });
  assert.equal(summaryResponse.statusCode, 200);
  assert.deepEqual(summaryResponse.body, {
    agendado: 1000,
    pago: 300,
    aReceber: 700,
    frustrado: 200,
    vendasDiretas: 0,
    investimento: 200,
    lucro: 100,
    roi: 50,
    graficoFunil: [1000, 300, 700, 200],
    graficoComposicao: [300, 700, 200],
    agendadoMes: 1000,
    pagoDoAgendado: 300,
    aReceberAgendado: 700,
    frustradoAgendado: 200,
    investimentoTotal: 200,
    lucroMes: 100
  });

  const attendantSummaryResponse = await auth
    .get('/api/summary')
    .query({ period: 'this_month', attendant: 'joao' });
  assert.equal(attendantSummaryResponse.statusCode, 200);
  assert.deepEqual(attendantSummaryResponse.body, {
    agendado: 0,
    pago: 300,
    aReceber: -300,
    frustrado: 0,
    vendasDiretas: 0,
    investimento: 150,
    lucro: 150,
    roi: 100,
    graficoFunil: [0, 300, -300, 0],
    graficoComposicao: [300, -300, 0],
    agendadoMes: 0,
    pagoDoAgendado: 300,
    aReceberAgendado: -300,
    frustradoAgendado: 0,
    investimentoTotal: 150,
    lucroMes: 150
  });

  await closeDatabase(db);
});

test('GET /api/summary filters sales by last_month period', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  const lastMonthDate = dateInLastMonth(12);
  const thisMonthDate = dateInThisMonth(5);

  await request(app)
    .post('/api/postback')
    .send({
      transaction_id: 'last-month-sale',
      status_code: 3,
      status_text: 'Pago',
      client_email: 'cliente-lastmonth@example.com',
      product_name: 'Produto Mês Passado',
      total_value_cents: 80000,
      created_at: lastMonthDate,
      updated_at: lastMonthDate
    });

  await request(app)
    .post('/api/postback')
    .send({
      transaction_id: 'this-month-sale',
      status_code: 2,
      status_text: 'Agendado',
      client_email: 'cliente-thismonth@example.com',
      product_name: 'Produto Este Mês',
      total_value_cents: 50000,
      created_at: thisMonthDate,
      updated_at: thisMonthDate
    });

  const response = await auth.get('/api/summary').query({ period: 'last_month' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    agendado: 0,
    pago: 800,
    aReceber: -800,
    frustrado: 0,
    vendasDiretas: 0,
    investimento: 0,
    lucro: 800,
    roi: 0,
    graficoFunil: [0, 800, -800, 0],
    graficoComposicao: [800, -800, 0],
    agendadoMes: 0,
    pagoDoAgendado: 800,
    aReceberAgendado: -800,
    frustradoAgendado: 0,
    investimentoTotal: 0,
    lucroMes: 800
  });

  await closeDatabase(db);
});

test('GET /api/summary supports custom date ranges with attendant filter', { concurrency: 1 }, async () => {
  const { app, db } = setupApp();
  const token = await loginAndGetToken(app);
  const auth = createAuthClient(app, token);

  await auth.put('/api/settings').send({ monthlyInvestment: 100 });

  await auth
    .post('/api/attendants')
    .send({ name: 'João', code: 'joao', monthlyCost: 80 });

  const insideDateOne = dateDaysFromToday(-3);
  const insideDateTwo = dateDaysFromToday(-2);
  const insideDateThree = dateDaysFromToday(-1);
  const outsideDate = dateDaysFromToday(-10);

  await request(app)
    .post('/api/postback')
    .send({
      transaction_id: 'custom-agendado',
      status_code: 2,
      status_text: 'Agendado',
      client_email: 'joao.agendado@example.com',
      product_name: 'Pacote Agendado',
      total_value_cents: 40000,
      created_at: insideDateOne,
      updated_at: insideDateOne
    });

  await request(app)
    .post('/api/postback')
    .send({
      transaction_id: 'custom-pago',
      status_code: 3,
      status_text: 'Pago',
      client_email: 'joao.pago@example.com',
      product_name: 'Pacote Pago',
      total_value_cents: 20000,
      created_at: insideDateTwo,
      updated_at: insideDateTwo
    });

  await request(app)
    .post('/api/postback')
    .send({
      transaction_id: 'custom-frustrado',
      status_code: 5,
      status_text: 'Frustrado',
      client_email: 'joao.frustrado@example.com',
      product_name: 'Pacote Frustrado',
      total_value_cents: 15000,
      created_at: insideDateThree,
      updated_at: insideDateThree
    });

  await request(app)
    .post('/api/postback')
    .send({
      transaction_id: 'custom-outside',
      status_code: 3,
      status_text: 'Pago',
      client_email: 'joao.fora@example.com',
      product_name: 'Pacote Fora',
      total_value_cents: 50000,
      created_at: outsideDate,
      updated_at: outsideDate
    });

  const startDate = dateDaysFromToday(-4).slice(0, 10);
  const endDate = dateDaysFromToday(-1).slice(0, 10);

  const customResponse = await auth
    .get('/api/summary')
    .query({ startDate, endDate });

  assert.equal(customResponse.statusCode, 200);
  assert.deepEqual(customResponse.body, {
    agendado: 400,
    pago: 200,
    aReceber: 200,
    frustrado: 150,
    vendasDiretas: 0,
    investimento: 100,
    lucro: 100,
    roi: 100,
    graficoFunil: [400, 200, 200, 150],
    graficoComposicao: [200, 200, 150],
    agendadoMes: 400,
    pagoDoAgendado: 200,
    aReceberAgendado: 200,
    frustradoAgendado: 150,
    investimentoTotal: 100,
    lucroMes: 100
  });

  const attendantResponse = await auth
    .get('/api/summary')
    .query({ startDate, endDate, attendant: 'joao' });

  assert.equal(attendantResponse.statusCode, 200);
  assert.deepEqual(attendantResponse.body, {
    agendado: 400,
    pago: 200,
    aReceber: 200,
    frustrado: 150,
    vendasDiretas: 0,
    investimento: 80,
    lucro: 120,
    roi: 150,
    graficoFunil: [400, 200, 200, 150],
    graficoComposicao: [200, 200, 150],
    agendadoMes: 400,
    pagoDoAgendado: 200,
    aReceberAgendado: 200,
    frustradoAgendado: 150,
    investimentoTotal: 80,
    lucroMes: 120
  });

  await closeDatabase(db);
});
