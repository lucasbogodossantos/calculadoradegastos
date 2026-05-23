-- ── BANCO DE DADOS: viagem_db ─────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS viagem_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE viagem_db;

-- Usuário
CREATE TABLE IF NOT EXISTS usuario (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nome            VARCHAR(120)        NOT NULL,
  data_nascimento DATE,
  cpf             VARCHAR(14) UNIQUE  NOT NULL,
  telefone        VARCHAR(20),
  email           VARCHAR(120) UNIQUE NOT NULL,
  endereco        VARCHAR(255),
  senha           VARCHAR(255)        NOT NULL,
  criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Veículo
CREATE TABLE IF NOT EXISTS veiculo (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT          NOT NULL,
  tipo         ENUM('carro','moto','caminhao') NOT NULL,
  placa        VARCHAR(10) UNIQUE NOT NULL,
  marca_modelo VARCHAR(100),
  cor          VARCHAR(40),
  combustivel  ENUM('Gasolina','Etanol','Diesel','Flex') DEFAULT 'Gasolina',
  numero_eixos INT,
  peso_total   DECIMAL(10,2),
  criado_em    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
);

-- Histórico de viagens
CREATE TABLE IF NOT EXISTS viagem (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id         INT NOT NULL,
  veiculo_id         INT,
  origem             VARCHAR(255) NOT NULL,
  destino            VARCHAR(255) NOT NULL,
  distancia_km       DECIMAL(10,2),
  duracao_min        DECIMAL(10,2),
  litros             DECIMAL(10,2),
  custo_total        DECIMAL(10,2),
  km_por_litro       DECIMAL(6,2),
  preco_combustivel  DECIMAL(6,3),
  criado_em          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (veiculo_id) REFERENCES veiculo(id)  ON DELETE SET NULL
);
