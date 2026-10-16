const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares para procesar JSON y archivos estáticos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de la base de datos PostgreSQL (Neon)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Creación automática de tablas e índices únicos al iniciar
async function initDb() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS codigos (
            id SERIAL PRIMARY KEY,
            codigo TEXT UNIQUE,
            estado TEXT DEFAULT 'disponible',
            dispositivo_id TEXT DEFAULT NULL
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS resultados (
            id SERIAL PRIMARY KEY,
            nombre TEXT UNIQUE,
            codigo_usado TEXT,
            puntaje REAL,
            modo TEXT DEFAULT 'publico',
            fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            estado TEXT DEFAULT 'pendiente'
        )`);

        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_nombre_lower ON resultados(LOWER(nombre))`);
        console.log('Conectado a PostgreSQL con éxito.');
    } catch (err) {
        console.error('Error al inicializar la base de datos', err.message);
    }
}

initDb();

// ==========================================
// RUTAS PARA ENTREGAR LAS PÁGINAS HTML
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pago', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pago.html'));
});


app.get('/exam', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'exam.html'));
});

// ==========================================
// RUTA API: Validación y registro de nombres
// ==========================================
app.post('/api/registrar-nombre', async (req, res) => {
    let { nombre, modo } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'Por favor ingresa tu nombre o apodo.' });
    }

    const nombreLimpio = nombre.trim().toLowerCase();
    const modoParticipacion = modo === 'anonimo' ? 'anonimo' : 'publico';

    try {
        const checkResult = await pool.query(`SELECT * FROM resultados WHERE LOWER(nombre) = $1`, [nombreLimpio]);

        if (checkResult.rows.length > 0) {
            return res.status(400).json({ error: '⚠️ El nombre de usuario ya existe, por favor elige y cambia de nombre.' });
        }

        const query = `INSERT INTO resultados (nombre, puntaje, modo, estado) VALUES ($1, 0, $2, 'pendiente') RETURNING id`;
        const insertResult = await pool.query(query, [nombre.trim(), modoParticipacion]);
        
        console.log(`¡Registrado con éxito! ID: ${insertResult.rows[0].id}, Nombre: ${nombre.trim()}, Modo: ${modoParticipacion}`);
        return res.json({ success: true, message: 'Registrado correctamente' });
    } catch (err) {
        console.error("Error en BD:", err.message);
        return res.status(400).json({ error: '⚠️ El nombre de usuario ya existe.' });
    }
});

// ==========================================
// RUTA API: Validación de códigos de acceso
// ==========================================
app.post('/api/validar-codigo', async (req, res) => {
    let { codigo } = req.body;

    if (!codigo || !codigo.trim()) {
        return res.status(400).json({ error: 'Ingresa un código de acceso.' });
    }

    const codigoLimpio = codigo.trim();

    try {
        const result = await pool.query(`SELECT * FROM codigos WHERE codigo = $1`, [codigoLimpio]);
        const row = result.rows[0];

        if (!row) {
            return res.status(400).json({ error: '❌ Código de acceso inválido o no registrado.' });
        }

        if (row.estado === 'usado') {
            return res.status(400).json({ error: '⚠️ Este código ya ha sido utilizado.' });
        }

        // Marcar como usado
        await pool.query(`UPDATE codigos SET estado = 'usado' WHERE id = $1`, [row.id]);
        return res.json({ success: true, message: 'Código válido' });
    } catch (err) {
        console.error("Error en el servidor:", err);
        return res.status(500).json({ error: 'Error en el servidor.' });
    }
});

// ==========================================
// RUTA API: Guardar puntaje del examen
// ==========================================
app.post('/api/guardar-resultado', async (req, res) => {
    let { nombre, puntaje } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'Nombre no encontrado' });
    }

    const nombreLimpio = nombre.trim().toLowerCase();

    try {
        const result = await pool.query(`SELECT estado FROM resultados WHERE LOWER(nombre) = $1`, [nombreLimpio]);
        const row = result.rows[0];

        if (row && row.estado === 'completado') {
            return res.status(400).json({ error: '⚠️ Este examen ya fue registrado y enviado anteriormente.' });
        }

        const notaVigesimalDecimal = Number((puntaje / 6).toFixed(2));

        const query = `UPDATE resultados SET puntaje = $1, estado = 'completado' WHERE LOWER(nombre) = $2`;
        await pool.query(query, [notaVigesimalDecimal, nombreLimpio]);

        console.log(`¡Nota guardada con éxito! Estudiante: ${nombre}, Nota sobre 20: ${notaVigesimalDecimal}`);
        return res.json({ success: true });
    } catch (err2) {
        console.error("Error al guardar puntaje:", err2.message);
        return res.status(500).json({ error: 'Error al actualizar el puntaje.' });
    }
});

// Iniciar el servidor web
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});