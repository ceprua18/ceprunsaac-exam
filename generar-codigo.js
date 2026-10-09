const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile);

// Aquí defines el código que quieras dar a tus usuarios
const nuevoCodigo = 'UNSAAC-2026';

db.run(`INSERT INTO codigos (codigo, estado) VALUES (?, 'disponible')`, [nuevoCodigo], function(err) {
    if (err) {
        console.log('❌ El código ya existe o hubo un error:', err.message);
    } else {
        console.log(`✅ ¡Código creado con éxito! -> "${nuevoCodigo}"`);
    }
    db.close();
});