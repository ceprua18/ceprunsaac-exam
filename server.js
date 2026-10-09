const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares para procesar JSON y archivos estáticos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de la base de datos SQLite
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error al abrir la base de datos', err.message);
    } else {
        console.log('Conectado a SQLite con éxito.');
    }
});

// Creación automática de tablas e índices únicos
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS codigos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        estado TEXT DEFAULT 'disponible',
        dispositivo_id TEXT DEFAULT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS resultados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE,
        codigo_usado TEXT,
        puntaje REAL,
        modo TEXT DEFAULT 'publico',
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        db.run(`ALTER TABLE resultados ADD COLUMN estado TEXT DEFAULT 'pendiente'`, (alterErr) => {
            // Ignora el error si la columna ya existe
        });
    });

    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_nombre_lower ON resultados(LOWER(nombre))`);
});

// ==========================================
// RUTAS PARA ENTREGAR LAS PÁGINAS HTML
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
/*
app.get('/exam', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pago.html'));
});
*/

app.get('/exam', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'exam.html'));
});

// ==========================================
// RUTA API: Validación y registro de nombres
// ==========================================
app.post('/api/registrar-nombre', (req, res) => {
    let { nombre, modo } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'Por favor ingresa tu nombre o apodo.' });
    }

    const nombreLimpio = nombre.trim().toLowerCase();
    const modoParticipacion = modo === 'anonimo' ? 'anonimo' : 'publico';

    db.get(`SELECT * FROM resultados WHERE LOWER(nombre) = ?`, [nombreLimpio], (err, row) => {
        if (err) {
            console.error("Error en BD:", err.message);
            return res.status(500).json({ error: 'Error interno en el servidor.' });
        }

        if (row) {
            return res.status(400).json({ error: '⚠️ El nombre de usuario ya existe, por favor elige y cambia de nombre.' });
        }

        const query = `INSERT INTO resultados (nombre, puntaje, modo, estado) VALUES (?, 0, ?, 'pendiente')`;
        db.run(query, [nombre.trim(), modoParticipacion], function(err2) {
            if (err2) {
                return res.status(400).json({ error: '⚠️ El nombre de usuario ya existe.' });
            }
            
            console.log(`¡Registrado con éxito! ID: ${this.lastID}, Nombre: ${nombre.trim()}, Modo: ${modoParticipacion}`);
            return res.json({ success: true, message: 'Registrado correctamente' });
        });
    });
});

// ==========================================
// RUTA API: Validación de códigos de acceso
// ==========================================
app.post('/api/validar-codigo', (req, res) => {
    let { codigo } = req.body;

    if (!codigo || !codigo.trim()) {
        return res.status(400).json({ error: 'Ingresa un código de acceso.' });
    }

    const codigoLimpio = codigo.trim();

    // Verificamos si el código existe en la base de datos
    db.get(`SELECT * FROM codigos WHERE codigo = ?`, [codigoLimpio], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Error en el servidor.' });
        }

        // Nota: Si aún no has insertado códigos manualmente en tu tabla 'codigos', 
        // puedes permitir que cualquier código pase para pruebas cambiando esto de momento.
        // Por ahora validaremos contra la tabla:
        if (!row) {
            // OPCIONAL FLEXIBLE PARA PRUEBAS: Si quieres que cualquier código inventado 
            // te deje pasar mientras creas tus códigos, comitiva esta validación. 
            // De lo contrario, exige que exista en la BD:
            return res.status(400).json({ error: '❌ Código de acceso inválido o no registrado.' });
        }

        if (row.estado === 'usado') {
            return res.status(400).json({ error: '⚠️ Este código ya ha sido utilizado.' });
        }

        // Marcar como usado
        db.run(`UPDATE codigos SET estado = 'usado' WHERE id = ?`, [row.id], (err2) => {
            if (err2) {
                console.error("Error al actualizar código:", err2);
            }
            return res.json({ success: true, message: 'Código válido' });
        });
    });
});

// ==========================================
// RUTA API: Guardar puntaje del examen
// ==========================================
app.post('/api/guardar-resultado', (req, res) => {
    let { nombre, puntaje } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'Nombre no encontrado' });
    }

    const nombreLimpio = nombre.trim().toLowerCase();

    db.get(`SELECT estado FROM resultados WHERE LOWER(nombre) = ?`, [nombreLimpio], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Error en el servidor.' });
        }

        if (row && row.estado === 'completado') {
            return res.status(400).json({ error: '⚠️ Este examen ya fue registrado y enviado anteriormente.' });
        }

        // Convertimos el puntaje bruto (ej: 12 puntos) a nota sobre 20 con 2 decimales (ej: 12 / 6 = 2.00)
        const notaVigesimalDecimal = Number((puntaje / 6).toFixed(2));

        const query = `UPDATE resultados SET puntaje = ?, estado = 'completado' WHERE LOWER(nombre) = ?`;
        db.run(query, [notaVigesimalDecimal, nombreLimpio], function(err2) {
            if (err2) {
                console.error("Error al guardar puntaje:", err2.message);
                return res.status(500).json({ error: 'Error al actualizar el puntaje.' });
            }
            console.log(`¡Nota guardada con éxito! Estudiante: ${nombre}, Nota sobre 20: ${notaVigesimalDecimal}`);
            return res.json({ success: true });
        });
    });
});

// Iniciar el servidor web
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});