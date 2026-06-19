const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');

const db = require('./db');
const { autenticarToken, SECRET } = require('./auth');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));


// CADASTRO DE USUÁRIO
app.post('/usuario', async (req, res) => {
  const { nome, data_nascimento, cpf, telefone, email, endereco, senha } = req.body;

  if (!nome || !cpf || !email || !senha) {
    return res.status(400).json({ mensagem: 'Campos Obrigatórios: nome, cpf, email, senha' });
  }

  try {
    const senhaCriptografada = await bcrypt.hash(senha, 10);

    const sql = `
      INSERT INTO usuario (nome, data_nascimento, cpf, telefone, email, endereco, senha)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [nome, data_nascimento, cpf, telefone, email, endereco, senhaCriptografada], (err) => {
      if (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ mensagem: 'Email ou CPF já Cadastrado' });
        }
        return res.status(500).json({ mensagem: 'Erro ao Cadastrar' });
      }
      res.json({ mensagem: 'Usuário Cadastrado com Sucesso!' });
    });

  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: 'Erro ao processar cadastro' });
  }
});


// LOGIN 
app.post('/login', (req, res) => {
  const { login, senha } = req.body;

  if (!login || !senha) {
    return res.status(400).json({ mensagem: 'Login e Senha São Obrigatórios' });
  }

  const sql = `SELECT * FROM usuario WHERE email = ? OR cpf = ?`;

  db.query(sql, [login, login], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ mensagem: 'Erro no servidor' });
    }

    if (results.length === 0) {
      return res.status(401).json({ mensagem: 'Usuário não encontrado' });
    }

    const usuario = results[0];

    try {
      const senhaValida = await bcrypt.compare(senha, usuario.senha);

      if (!senhaValida) {
        return res.status(401).json({ mensagem: 'Usuário ou Senha Inválido' });
      }

      const token = jwt.sign(
        { id: usuario.id, email: usuario.email, nome: usuario.nome },
        SECRET,
        { expiresIn: '8h' }
      );

      res.json({
        mensagem: 'Login Realizado com Sucesso!',
        token,
        nome: usuario.nome
      });

    } catch (erro) {
      console.error(erro);
      res.status(500).json({ mensagem: 'Erro ao verificar senha' });
    }
  });
});


// CADASTRO DE VEÍCULO
app.post('/veiculo', autenticarToken, (req, res) => {
  const { tipo, placa, marca_modelo, cor, combustivel, numero_eixos, peso_total } = req.body;
  const usuario_id = req.usuario.id;

  if (!tipo || !placa || !marca_modelo) {
    return res.status(400).json({ mensagem: 'Campos obrigatórios: tipo, placa, marca/modelo' });
  }

  if (tipo === 'caminhao' && (!numero_eixos || !peso_total)) {
    return res.status(400).json({ mensagem: 'Caminhão precisa de número de eixos e peso total' });
  }

  const sql = `
    INSERT INTO veiculo (usuario_id, tipo, placa, marca_modelo, cor, combustivel, numero_eixos, peso_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [
    usuario_id, tipo, placa.toUpperCase(), marca_modelo,
    cor, combustivel, numero_eixos || null, peso_total || null
  ], (err) => {
    if (err) {
      console.error(err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ mensagem: 'Placa já cadastrada' });
      }
      return res.status(500).json({ mensagem: 'Erro ao cadastrar veículo' });
    }
    res.json({ mensagem: 'Veículo cadastrado com sucesso!' });
  });
});


// LISTAR VEÍCULOS DO USUÁRIO
app.get('/veiculos', autenticarToken, (req, res) => {
  const usuario_id = req.usuario.id;

  const sql = `SELECT * FROM veiculo WHERE usuario_id = ? ORDER BY id DESC`;

  db.query(sql, [usuario_id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ mensagem: 'Erro ao buscar veículos' });
    }
    res.json(results);
  });
});


// DELETAR VEÍCULO
app.delete('/veiculo/:id', autenticarToken, (req, res) => {
  const usuario_id = req.usuario.id;
  const veiculo_id = req.params.id;

  const sql = `DELETE FROM veiculo WHERE id = ? AND usuario_id = ?`;

  db.query(sql, [veiculo_id, usuario_id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ mensagem: 'Erro ao deletar veículo' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ mensagem: 'Veículo não encontrado' });
    }
    res.json({ mensagem: 'Veículo removido com sucesso!' });
  });
});


// SALVAR HISTÓRICO DE VIAGEM
app.post('/viagem', autenticarToken, (req, res) => {
  const { veiculo_id, origem, destino, distancia_km, duracao_min, litros, custo_total, km_por_litro, preco_combustivel } = req.body;
  const usuario_id = req.usuario.id;

  const sql = `
    INSERT INTO viagem (usuario_id, veiculo_id, origem, destino, distancia_km, duracao_min, litros, custo_total, km_por_litro, preco_combustivel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [
    usuario_id, veiculo_id || null, origem, destino,
    distancia_km, duracao_min, litros, custo_total,
    km_por_litro, preco_combustivel
  ], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ mensagem: 'Erro ao salvar viagem' });
    }
    res.json({ mensagem: 'Viagem salva no histórico!' });
  });
});


// HISTÓRICO DE VIAGENS
app.get('/viagens', autenticarToken, (req, res) => {
  const usuario_id = req.usuario.id;

  const sql = `
    SELECT v.*, ve.marca_modelo, ve.placa
    FROM viagem v
    LEFT JOIN veiculo ve ON v.veiculo_id = ve.id
    WHERE v.usuario_id = ?
    ORDER BY v.criado_em DESC
    LIMIT 20
  `;

  db.query(sql, [usuario_id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ mensagem: 'Erro ao buscar histórico' });
    }
    res.json(results);
  });
});


// PERFIL
app.get('/perfil', autenticarToken, (req, res) => {
  const sql = `SELECT id, nome, email, cpf, telefone, endereco, data_nascimento FROM usuario WHERE id = ?`;

  db.query(sql, [req.usuario.id], (err, results) => {
    if (err) return res.status(500).json({ mensagem: 'Erro ao buscar perfil' });
    if (!results.length) return res.status(404).json({ mensagem: 'Usuário não encontrado' });
    res.json(results[0]);
  });
});


// SERVIDOR
app.listen(3000, () => {
  console.log('Servidor rodando em http://localhost:3000');
});
