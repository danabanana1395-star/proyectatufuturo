// =====================================================
//  Proyecta Tu Futuro – Node.js + Express + MySQL
//  Puerto 3002
//  Arrancar: node server.js
// =====================================================

const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
  host     : 'localhost',
  user     : 'root',
  password : 'diegardo74',          // ← tu contraseña aquí
  database : 'proyecta_db',
  charset  : 'utf8mb4',
};

let pool;

async function initDB() {
  try {
    pool = await mysql.createPool({ ...dbConfig, waitForConnections: true, connectionLimit: 10 });
    console.log('✅ Conectado a MySQL');

    await pool.query(`CREATE TABLE IF NOT EXISTS resultados (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      nombre       VARCHAR(120) NOT NULL,
      edad         INT,
      carrera1     VARCHAR(120),
      pct1         INT,
      carrera2     VARCHAR(120),
      pct2         INT,
      carrera3     VARCHAR(120),
      pct3         INT,
      creado_en    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS admins (
      id       INT AUTO_INCREMENT PRIMARY KEY,
      usuario  VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL
    ) CHARACTER SET utf8mb4`);

    const [admins] = await pool.query('SELECT id FROM admins WHERE usuario = ?', ['admin']);
    if (admins.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query('INSERT INTO admins (usuario, password) VALUES (?, ?)', ['admin', hash]);
      console.log('👤 Admin  →  usuario: admin  |  password: admin123');
    }

  } catch (err) {
    console.error('❌ Error MySQL:', err.message);
    process.exit(1);
  }
}

// ── Guardar resultado ──────────────────────────────
app.post('/api/resultado', async (req, res) => {
  const { nombre, edad, carrera1, pct1, carrera2, pct2, carrera3, pct3 } = req.body;
  if (!nombre || !carrera1)
    return res.status(400).json({ error: 'Nombre y resultado son obligatorios.' });
  try {
    const [r] = await pool.query(
      `INSERT INTO resultados (nombre, edad, carrera1, pct1, carrera2, pct2, carrera3, pct3)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre.trim(), edad || null, carrera1, pct1||0, carrera2||'', pct2||0, carrera3||'', pct3||0]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar resultado.' });
  }
});

// ── Admin login ────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM admins WHERE usuario = ?', [usuario]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas.' });
    const ok = await bcrypt.compare(password, rows[0].password);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas.' });
    const token = Buffer.from(`${rows[0].id}:${Date.now()}`).toString('base64');
    res.json({ ok: true, token });
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

function authAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const dec = Buffer.from(token, 'base64').toString('utf8');
    if (!dec.includes(':')) throw new Error();
    next();
  } catch { res.status(401).json({ error: 'No autorizado.' }); }
}

// ── Todos los resultados ───────────────────────────
app.get('/api/admin/resultados', authAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM resultados ORDER BY creado_en DESC');
    res.json({ ok: true, datos: rows });
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

// ── Estadísticas ───────────────────────────────────
app.get('/api/admin/stats', authAdmin, async (req, res) => {
  try {
    const [[total]]  = await pool.query('SELECT COUNT(*) AS total FROM resultados');
    const [topCarr]  = await pool.query(`
      SELECT carrera1 AS carrera, COUNT(*) AS total
      FROM resultados GROUP BY carrera1 ORDER BY total DESC LIMIT 8`);
    const [recientes] = await pool.query(
      'SELECT nombre, carrera1, pct1, creado_en FROM resultados ORDER BY creado_en DESC LIMIT 10'
    );
    res.json({ ok: true, total: total.total, topCarr, recientes });
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

// ── Exportar CSV ───────────────────────────────────
app.get('/api/admin/exportar', authAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM resultados ORDER BY creado_en DESC');
    if (!rows.length) return res.send('Sin datos');
    const header = 'Nombre,Edad,Carrera1,Match1%,Carrera2,Match2%,Carrera3,Match3%,Fecha\n';
    const body   = rows.map(r =>
      `"${r.nombre}",${r.edad||''},"${r.carrera1}",${r.pct1}%,"${r.carrera2}",${r.pct2}%,"${r.carrera3}",${r.pct3}%,"${r.creado_en}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="proyecta_resultados.csv"');
    res.send('\uFEFF' + header + body);
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor en http://localhost:${PORT}`);
    console.log(`📋 Admin en     http://localhost:${PORT}/admin.html`);
    console.log(`🏠 App en       http://localhost:${PORT}/index.html`);
  });
});
