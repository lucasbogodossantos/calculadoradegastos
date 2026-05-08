const express = require('express');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { autenticarToken, SECRET } = require('./auth');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));



// CADASTRO DE USUÁRIO

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

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({
      mensagem: 'Email ou CPF já cadastrado'
    });
  }

  return res.status(500).json({
    mensagem: 'Erro ao cadastrar'
  });
}

      res.json({ mensagem: 'Usuário cadastrado com segurança!' });
    });

  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: 'Erro ao criptografar senha' });
  }
});



// LOGIN

app.post('/login', (req, res) => {
  const { login, senha } = req.body; // email ou cpf

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
        return res.status(401).json({ mensagem: 'Senha incorreta' });
      }

      const token = jwt.sign(
        { id: usuario.id, email: usuario.email },
        SECRET,
        { expiresIn: '1h' }
      );

      res.json({
        mensagem: 'Login realizado com sucesso!',
        token
      });

    } catch (erro) {
      console.error(erro);
      res.status(500).json({ mensagem: 'Erro ao verificar senha' });
    }
  });
});



// CADASTRO DE VEÍCULO (PROTEGIDO)

app.post('/veiculo', autenticarToken, (req, res) => {
  const {
    tipo,
    placa,
    marca_modelo,
    cor,
    combustivel,
    numero_eixos,
    peso_total
  } = req.body;

  const usuario_id = req.usuario.id;

  if (tipo === 'caminhao' && (!numero_eixos || !peso_total)) {
    return res.status(400).json({
      mensagem: 'Caminhão precisa de número de eixos e peso total'
    });
  }

  const sql = `
    INSERT INTO veiculo 
    (usuario_id, tipo, placa, marca_modelo, cor, combustivel, numero_eixos, peso_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [
    usuario_id,
    tipo,
    placa,
    marca_modelo,
    cor,
    combustivel,
    numero_eixos || null,
    peso_total || null
  ], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ mensagem: 'Erro ao cadastrar veículo' });
    }

    res.json({ mensagem: 'Veículo cadastrado com sucesso!' });
  });
});


// ESCOLHA DE TRANSPORTE

app.post('/transporte', autenticarToken, (req, res) => {
  const { tipo, veiculo_id, km_por_litro } = req.body;
  const usuario_id = req.usuario.id;

  const veiculos = ['carro', 'moto', 'caminhao'];

  // validação básica
  if (!tipo) {
    return res.status(400).json({ mensagem: 'Tipo de transporte é obrigatório' });
  }

  // validação para veículos próprios
  if (veiculos.includes(tipo)) {
    if (!veiculo_id || !km_por_litro) {
      return res.status(400).json({
        mensagem: 'Selecione um veículo e informe o Km/L'
      });
    }
  }

  const sql = `
    INSERT INTO transporte (usuario_id, tipo, veiculo_id, km_por_litro)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [
    usuario_id,
    tipo,
    veiculo_id || null,
    km_por_litro || null
  ], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ mensagem: 'Erro ao salvar transporte' });
    }

    res.json({ mensagem: 'Transporte salvo com sucesso!' });
  });
});



// LISTAR VEÍCULOS DO USUÁRIO

app.get('/veiculos', autenticarToken, (req, res) => {
  const usuario_id = req.usuario.id;

  const sql = `SELECT * FROM veiculo WHERE usuario_id = ?`;

  db.query(sql, [usuario_id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ mensagem: 'Erro ao buscar veículos' });
    }

    res.json(results);
  });
});




// TESTE DE ROTA PROTEGIDA

app.get('/perfil', autenticarToken, (req, res) => {
  res.json({
    mensagem: 'Acesso autorizado!',
    usuario: req.usuario
  });
});



// SERVIDOR

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
