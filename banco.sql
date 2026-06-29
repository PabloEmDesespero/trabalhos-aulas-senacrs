CREATE DATABASE IF NOT EXISTS loja_26_1;
USE loja_26_1;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(150) NOT NULL UNIQUE,
    nome VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    provider VARCHAR(50) DEFAULT 'local',
    google_id VARCHAR(255) UNIQUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categoria (
    id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
    id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    url VARCHAR(500) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    categoria_id INT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    FOREIGN KEY (categoria_id) REFERENCES categoria (id)
);

INSERT INTO categoria (id, nome) VALUES 
(1, "Desenvolvimento"), 
(2, "Documentação");