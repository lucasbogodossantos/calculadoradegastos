const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'a1b2c3',
  database: 'viagem_db'
});

db.connect((err) => {
  if (err) {
    console.error('Erro ao conectar:', err);
  } else {
    console.log('Conectado ao banco');
  }
});

module.exports = db;
