const jwt = require('jsonwebtoken');

const SECRET = 'seu_segredo_super_secreto';

function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ mensagem: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, SECRET, (err, usuario) => {
    if (err) {
      return res.status(403).json({ mensagem: 'Token inválido' });
    }

    req.usuario = usuario;
    next();
  });
}

module.exports = { autenticarToken, SECRET };
