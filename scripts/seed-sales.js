const { initializeDatabase } = require('../src/server');

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

const createDateTimeFromBase = (baseDate, dayOffset, hour, minute = 0) => {
  const date = new Date(baseDate.getTime());
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return formatDateTime(date);
};

const createDateTimeFromMonthDay = (monthBase, day, hour, minute = 0) => {
  const date = new Date(monthBase.getTime());
  date.setDate(day);
  date.setHours(hour, minute, 0, 0);
  return formatDateTime(date);
};

const statusDefinitions = {
  agendado: { code: 2, text: 'Agendado' },
  pago: { code: 3, text: 'Pago' },
  frustrado: { code: 5, text: 'Frustrado' },
  cobranca: { code: 4, text: 'Em Cobrança' }
};

const attendantNames = {
  joao: 'João',
  mari: 'Maria',
  luci: 'Luciana',
  nao_definido: 'Não Definido'
};

const buildSale = ({
  id,
  status,
  valueCents,
  dateTime,
  attendantCode,
  attendantName,
  clientName,
  productName
}) => {
  const statusDef = statusDefinitions[status];
  if (!statusDef) {
    throw new Error(`Unknown status "${status}" for sale ${id}`);
  }

  const normalizedId = id.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const normalizedAttendantCode = attendantCode ?? null;
  const resolvedAttendantName = attendantName ?? (normalizedAttendantCode ? attendantNames[normalizedAttendantCode] || null : null);

  return {
    transaction_id: id,
    status_code: statusDef.code,
    status_text: statusDef.text,
    client_email: `${normalizedId}@cliente.com`,
    client_name: clientName || `Cliente ${id}`,
    client_cpf: null,
    client_phone: null,
    product_name: productName || `Produto ${id}`,
    total_value_cents: valueCents,
    created_at: dateTime,
    updated_at: dateTime,
    raw_payload: '{}',
    attendant_code: normalizedAttendantCode,
    attendant_name: resolvedAttendantName
  };
};

const now = new Date();
const todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0, 0);
const dayOfWeek = (todayBase.getDay() + 6) % 7;
const startOfCurrentWeek = new Date(todayBase.getTime());
startOfCurrentWeek.setDate(todayBase.getDate() - dayOfWeek);

const startOfLastWeek = new Date(startOfCurrentWeek.getTime());
startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

const startOfLastMonth = new Date(todayBase.getFullYear(), todayBase.getMonth() - 1, 1, 10, 0, 0, 0);
const daysInLastMonth = new Date(todayBase.getFullYear(), todayBase.getMonth(), 0).getDate();

const currentWeekOffsets = [];
for (let i = 0; i < 7 && currentWeekOffsets.length < 5; i += 1) {
  if (i === dayOfWeek) {
    continue;
  }
  currentWeekOffsets.push(i);
}

const lastWeekOffsets = [0, 1, 2, 3, 4];
const lastMonthDays = [2, 7, 12, 18, 24].map((day) => Math.min(day, daysInLastMonth));

const todayDates = [
  createDateTimeFromBase(todayBase, 0, 9, 0),
  createDateTimeFromBase(todayBase, 0, 11, 15),
  createDateTimeFromBase(todayBase, 0, 13, 30),
  createDateTimeFromBase(todayBase, 0, 15, 45),
  createDateTimeFromBase(todayBase, 0, 17, 5)
];

const thisWeekDates = currentWeekOffsets.map((offset, index) =>
  createDateTimeFromBase(startOfCurrentWeek, offset, 9 + index * 2, index % 2 === 0 ? 0 : 30)
);

const lastWeekDates = lastWeekOffsets.map((offset, index) =>
  createDateTimeFromBase(startOfLastWeek, offset, 10 + index, index % 2 === 0 ? 15 : 45)
);

const lastMonthDates = lastMonthDays.map((day, index) =>
  createDateTimeFromMonthDay(startOfLastMonth, day, 9 + index, index % 2 === 0 ? 20 : 50)
);

const sales = [
  // Hoje
  buildSale({
    id: 'today-01',
    status: 'agendado',
    valueCents: 15000,
    dateTime: todayDates[0],
    attendantCode: 'nao_definido',
    clientName: 'Cliente Hoje 1',
    productName: 'Consulta Rápida'
  }),
  buildSale({
    id: 'today-02',
    status: 'pago',
    valueCents: 60000,
    dateTime: todayDates[1],
    attendantCode: 'joao',
    clientName: 'Cliente Hoje 2',
    productName: 'Plano Premium'
  }),
  buildSale({
    id: 'today-03',
    status: 'frustrado',
    valueCents: 32000,
    dateTime: todayDates[2],
    attendantCode: 'mari',
    clientName: 'Cliente Hoje 3',
    productName: 'Mentoria Express'
  }),
  buildSale({
    id: 'today-04',
    status: 'pago',
    valueCents: 27500,
    dateTime: todayDates[3],
    attendantCode: null,
    clientName: 'Cliente Hoje 4',
    productName: 'Workshop Digital'
  }),
  buildSale({
    id: 'today-05',
    status: 'cobranca',
    valueCents: 18000,
    dateTime: todayDates[4],
    attendantCode: 'nao_definido',
    clientName: 'Cliente Hoje 5',
    productName: 'Revisão Mensal'
  }),
  // Esta semana (sem contar hoje)
  buildSale({
    id: 'week-01',
    status: 'agendado',
    valueCents: 20000,
    dateTime: thisWeekDates[0],
    attendantCode: 'mari',
    clientName: 'Cliente Semana 1',
    productName: 'Plano Básico'
  }),
  buildSale({
    id: 'week-02',
    status: 'pago',
    valueCents: 48000,
    dateTime: thisWeekDates[1],
    attendantCode: 'joao',
    clientName: 'Cliente Semana 2',
    productName: 'Plano Pro'
  }),
  buildSale({
    id: 'week-03',
    status: 'frustrado',
    valueCents: 23000,
    dateTime: thisWeekDates[2],
    attendantCode: 'luci',
    clientName: 'Cliente Semana 3',
    productName: 'Programa Intensivo'
  }),
  buildSale({
    id: 'week-04',
    status: 'agendado',
    valueCents: 26000,
    dateTime: thisWeekDates[3],
    attendantCode: 'nao_definido',
    clientName: 'Cliente Semana 4',
    productName: 'Sessão Estratégica'
  }),
  buildSale({
    id: 'week-05',
    status: 'pago',
    valueCents: 41000,
    dateTime: thisWeekDates[4],
    attendantCode: null,
    clientName: 'Cliente Semana 5',
    productName: 'Campanha Especial'
  }),
  // Semana passada
  buildSale({
    id: 'lastweek-01',
    status: 'pago',
    valueCents: 52000,
    dateTime: lastWeekDates[0],
    attendantCode: 'joao',
    clientName: 'Cliente Semana Passada 1',
    productName: 'Consultoria Completa'
  }),
  buildSale({
    id: 'lastweek-02',
    status: 'agendado',
    valueCents: 18000,
    dateTime: lastWeekDates[1],
    attendantCode: 'mari',
    clientName: 'Cliente Semana Passada 2',
    productName: 'Plano Revisão'
  }),
  buildSale({
    id: 'lastweek-03',
    status: 'frustrado',
    valueCents: 22000,
    dateTime: lastWeekDates[2],
    attendantCode: 'nao_definido',
    clientName: 'Cliente Semana Passada 3',
    productName: 'Treinamento Online'
  }),
  buildSale({
    id: 'lastweek-04',
    status: 'cobranca',
    valueCents: 19500,
    dateTime: lastWeekDates[3],
    attendantCode: 'luci',
    clientName: 'Cliente Semana Passada 4',
    productName: 'Workshop Presencial'
  }),
  buildSale({
    id: 'lastweek-05',
    status: 'pago',
    valueCents: 36000,
    dateTime: lastWeekDates[4],
    attendantCode: null,
    clientName: 'Cliente Semana Passada 5',
    productName: 'Plano VIP'
  }),
  // Mês passado
  buildSale({
    id: 'lastmonth-01',
    status: 'agendado',
    valueCents: 27000,
    dateTime: lastMonthDates[0],
    attendantCode: 'nao_definido',
    clientName: 'Cliente Mês Passado 1',
    productName: 'Plano Mensal'
  }),
  buildSale({
    id: 'lastmonth-02',
    status: 'pago',
    valueCents: 43000,
    dateTime: lastMonthDates[1],
    attendantCode: 'joao',
    clientName: 'Cliente Mês Passado 2',
    productName: 'Programa Avançado'
  }),
  buildSale({
    id: 'lastmonth-03',
    status: 'frustrado',
    valueCents: 25000,
    dateTime: lastMonthDates[2],
    attendantCode: 'mari',
    clientName: 'Cliente Mês Passado 3',
    productName: 'Mentoria Premium'
  }),
  buildSale({
    id: 'lastmonth-04',
    status: 'agendado',
    valueCents: 31000,
    dateTime: lastMonthDates[3],
    attendantCode: 'luci',
    clientName: 'Cliente Mês Passado 4',
    productName: 'Plano Estratégico'
  }),
  buildSale({
    id: 'lastmonth-05',
    status: 'pago',
    valueCents: 39000,
    dateTime: lastMonthDates[4],
    attendantCode: null,
    clientName: 'Cliente Mês Passado 5',
    productName: 'Campanha Premium'
  })
];

const seedSales = () => {
  const db = initializeDatabase();

  db.serialize(() => {
    db.run('DELETE FROM sales', (deleteError) => {
      if (deleteError) {
        console.error('Failed to clear sales table', deleteError);
        db.close();
        return;
      }

      const insertSql = `
        INSERT OR REPLACE INTO sales (
          transaction_id,
          status_code,
          status_text,
          client_email,
          client_name,
          client_cpf,
          client_phone,
          product_name,
          total_value_cents,
          created_at,
          updated_at,
          raw_payload,
          attendant_code,
          attendant_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const statement = db.prepare(insertSql, (prepareError) => {
        if (prepareError) {
          console.error('Failed to prepare insert statement', prepareError);
          db.close();
        }
      });

      sales.forEach((sale) => {
        statement.run(
          [
            sale.transaction_id,
            sale.status_code,
            sale.status_text,
            sale.client_email,
            sale.client_name,
            sale.client_cpf,
            sale.client_phone,
            sale.product_name,
            sale.total_value_cents,
            sale.created_at,
            sale.updated_at,
            sale.raw_payload,
            sale.attendant_code,
            sale.attendant_name
          ],
          (error) => {
            if (error) {
              console.error(`Failed to insert sale ${sale.transaction_id}`, error);
            }
          }
        );
      });

      statement.finalize((finalizeError) => {
        if (finalizeError) {
          console.error('Failed to finalize insert statement', finalizeError);
        } else {
          console.log(`Seeded ${sales.length} sales records.`);
        }

        db.close((closeError) => {
          if (closeError) {
            console.error('Failed to close database after seeding', closeError);
          }
        });
      });
    });
  });
};

seedSales();
