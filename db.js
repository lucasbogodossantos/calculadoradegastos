const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());

app.post('/usuario', (req, res) => {
  const { nome } = req.body;

  db.query('INSERT INTO usuario (nome) VALUES (?)', [nome], (err) => {
    if (err) return res.status(500).send(err);
    res.send('Usuário cadastrado');
  });
});

app.listen(3306, () => {
  console.log('Rodando...');
});
