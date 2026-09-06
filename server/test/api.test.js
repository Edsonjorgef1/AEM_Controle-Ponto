import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

// Estes testes precisam de um PostgreSQL acessível (ver server/README.md).
// Sem ligação disponível, são ignorados em vez de falharem o build.
let dbAvailable = true;
try {
  await pool.query('SELECT 1');
} catch {
  dbAvailable = false;
  console.warn('[test] PostgreSQL indisponível — testes de API ignorados.');
}

describe('API de Controlo de Ponto', { skip: !dbAvailable }, () => {
  let baseUrl;
  let server;
  let adminToken;
  let operatorToken;
  let member;

  const api = (path, { token, method = 'GET', body } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  const login = async (email, password) => {
    const res = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(res.status, 200, `login falhou para ${email}`);
    return (await res.json()).token;
  };

  before(async () => {
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Estado limpo e previsível para cada execução.
    await pool.query('TRUNCATE scan_log, attendance, members RESTART IDENTITY CASCADE');
    await pool.query("DELETE FROM users WHERE email LIKE '%@teste.local'");

    const hash = await bcrypt.hash('teste123', 4);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES
         ('Admin Teste', 'admin@teste.local', $1, 'admin'),
         ('Operador Teste', 'operador@teste.local', $1, 'operador')`,
      [hash],
    );

    adminToken = await login('admin@teste.local', 'teste123');
    operatorToken = await login('operador@teste.local', 'teste123');
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it('recusa credenciais erradas sem revelar se o email existe', async () => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@teste.local', password: 'errada' },
    });
    assert.equal(res.status, 401);
    assert.match((await res.json()).error, /incorrect/i);
  });

  it('exige autenticação nas rotas protegidas', async () => {
    assert.equal((await api('/api/members')).status, 401);
  });

  it('cria pessoas com código sequencial por categoria', async () => {
    const { rows } = await pool.query("SELECT id FROM categories WHERE code_prefix = 'FUN'");
    const categoryId = rows[0].id;

    const first = await api('/api/members', {
      token: adminToken,
      method: 'POST',
      body: { full_name: 'Ana Cossa', category_id: categoryId, position: 'Secretária' },
    });
    assert.equal(first.status, 201);
    member = await first.json();
    assert.equal(member.internal_code, 'FUN0001');
    assert.match(member.qr_token, /^AEM-[0-9a-f]{32}$/);

    const second = await api('/api/members', {
      token: adminToken,
      method: 'POST',
      body: { full_name: 'Beto Chale', category_id: categoryId },
    });
    assert.equal((await second.json()).internal_code, 'FUN0002');
  });

  it('regista entrada na primeira leitura do QR Code', async () => {
    const res = await api('/api/attendance/scan', {
      token: operatorToken,
      method: 'POST',
      body: { code: member.qr_token },
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.action, 'entrada');
    assert.ok(body.record.check_in);
    assert.equal(body.record.check_out, null);
  });

  it('trata uma segunda leitura imediata como duplicado, não como saída', async () => {
    const res = await api('/api/attendance/scan', {
      token: operatorToken,
      method: 'POST',
      body: { code: member.qr_token },
    });
    assert.equal(res.status, 409);
  });

  it('regista saída quando já passou o intervalo mínimo', async () => {
    await pool.query(
      "UPDATE attendance SET check_in = '00:05' WHERE member_id = $1 AND work_date = CURRENT_DATE",
      [member.id],
    );

    const res = await api('/api/attendance/scan', {
      token: operatorToken,
      method: 'POST',
      body: { code: member.qr_token },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.action, 'saida');
    assert.ok(body.record.check_out);
  });

  it('recusa uma terceira leitura no mesmo dia', async () => {
    const res = await api('/api/attendance/scan', {
      token: operatorToken,
      method: 'POST',
      body: { code: member.qr_token },
    });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /já registou entrada/i);
  });

  it('aceita o código interno além do token do QR Code', async () => {
    const res = await api('/api/attendance/scan', {
      token: operatorToken,
      method: 'POST',
      body: { code: 'fun0002' },
    });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).action, 'entrada');
  });

  it('recusa códigos desconhecidos e regista a tentativa', async () => {
    const res = await api('/api/attendance/scan', {
      token: operatorToken,
      method: 'POST',
      body: { code: 'AEM-inexistente' },
    });
    assert.equal(res.status, 404);

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM scan_log WHERE action = 'recusado'",
    );
    assert.ok(rows[0].total > 0, 'a tentativa recusada deve ficar no histórico');
  });

  it('marca atraso quando a entrada ultrapassa o horário e a tolerância', async () => {
    const { rows: cats } = await pool.query("SELECT id FROM categories WHERE code_prefix = 'PRO'");
    const created = await api('/api/members', {
      token: adminToken,
      method: 'POST',
      body: { full_name: 'Carlos Nhaca', category_id: cats[0].id },
    });
    const professor = await created.json();

    // Horário 08:00 com 10 min de tolerância: entrada às 09:00 são 50 min de atraso.
    const res = await api('/api/attendance/manual', {
      token: adminToken,
      method: 'POST',
      body: {
        member_id: professor.id,
        work_date: new Date().toISOString().slice(0, 10),
        check_in: '09:00',
        check_out: '16:00',
      },
    });
    assert.equal(res.status, 201);
    const record = await res.json();
    assert.equal(record.status, 'Atrasado');
    assert.equal(record.late_minutes, 50);
    assert.equal(record.early_leave_minutes, 0);
  });

  it('impede o operador de ver relatórios ou gerir pessoas', async () => {
    assert.equal((await api('/api/reports/summary', { token: operatorToken })).status, 403);
    assert.equal(
      (await api('/api/members', { token: operatorToken, method: 'POST', body: { full_name: 'X', category_id: 1 } })).status,
      403,
    );
  });

  it('produz um relatório com presenças, faltas e atrasos', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await api(`/api/reports/summary?from=${today}&to=${today}`, { token: adminToken });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.period.from, today);
    assert.ok(body.items.length >= 3);

    const ana = body.items.find((i) => i.full_name === 'Ana Cossa');
    assert.equal(ana.present_days, 1);
    assert.ok('absent_days' in ana && 'attendance_rate' in ana);
  });

  it('exporta o relatório em CSV', async () => {
    const res = await api('/api/reports/export', { token: adminToken });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(await res.text(), /Codigo;Nome;Categoria/);
  });

  it('gera a imagem do QR Code da pessoa', async () => {
    const res = await api(`/api/members/${member.id}/qrcode`, { token: adminToken });
    assert.equal(res.status, 200);
    assert.match((await res.json()).image, /^data:image\/png;base64,/);
  });

  it('emite um novo QR Code e invalida o anterior', async () => {
    const previous = member.qr_token;
    const res = await api(`/api/members/${member.id}/regenerate-qr`, {
      token: adminToken,
      method: 'POST',
    });
    assert.equal(res.status, 200);
    assert.notEqual((await res.json()).qr_token, previous);

    const reused = await api('/api/attendance/scan', {
      token: operatorToken,
      method: 'POST',
      body: { code: previous },
    });
    assert.equal(reused.status, 404, 'o QR Code antigo deve deixar de funcionar');
  });
});
