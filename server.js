const express = require('express');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcrypt');

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static('public'));

app.post('/usuario', async (req, res) => {
  const { nome, data_nascimento, cpf, telefone, email, endereco, senha } = req.body;

  try {
    const senhaCriptografada = await bcrypt.hash(senha, 10);

    const sql = `
      INSERT INTO usuario 
      (nome, data_nascimento, cpf, telefone, email, endereco, senha)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
      nome,
      data_nascimento,
      cpf,
      telefone,
      email,
      endereco,
      senhaCriptografada
    ], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ mensagem: 'Erro ao cadastrar' });
      }

      res.json({ mensagem: 'Usuário cadastrado com segurança!' });
    });

  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: 'Erro ao criptografar senha' });
  }
});

