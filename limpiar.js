const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {

    console.log('Buscando nombres duplicados...');

    db.all(`
        SELECT LOWER(TRIM(nombre)) AS nombre_normalizado,
               COUNT(*) AS cantidad
        FROM resultados
        GROUP BY LOWER(TRIM(nombre))
        HAVING COUNT(*) > 1
    `, (err, rows) => {

        if (err) {
            console.error('Error:', err.message);
            return;
        }

        if (rows.length === 0) {
            console.log('No hay duplicados.');
            return;
        }

        console.log('Duplicados encontrados:');

        console.table(rows);

        db.run(`
            DELETE FROM resultados
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM resultados
                GROUP BY LOWER(TRIM(nombre))
            )
        `, (err) => {

            if (err) {
                console.error(
                    'Error eliminando duplicados:',
                    err.message
                );
                return;
            }

            console.log(
                '✅ Duplicados eliminados correctamente.'
            );

            // Ahora creamos el índice correctamente

            db.run(`
                CREATE UNIQUE INDEX IF NOT EXISTS
                idx_nombre_lower
                ON resultados(LOWER(TRIM(nombre)))
            `, (err) => {

                if (err) {
                    console.error(
                        'Error creando índice:',
                        err.message
                    );
                } else {
                    console.log(
                        '✅ Índice único creado correctamente.'
                    );
                }

                db.close();
            });

        });

    });

});