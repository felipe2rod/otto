#!/bin/sh
# Roda uma vez, na criação do volume do banco, como superusuário do contêiner.
# Cria os três papéis do ADR 023 e as duas bases (desenvolvimento e teste).
#   otto_migrador  dono das tabelas; só o serviço "migracao" (e o de teste) tem a URL dele
#   otto_app       API e worker; sem BYPASSRLS, sem CREATE, não é dono de nada
#   otto_operacao  análise entre contas, fora dos contêineres do MVP; nasce sem acesso a tabela nenhuma
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v senha_migrador="$BANCO_SENHA_MIGRADOR" \
  -v senha_app="$BANCO_SENHA_APP" \
  -v senha_operacao="$BANCO_SENHA_OPERACAO" <<'SQL'
CREATE ROLE otto_migrador LOGIN PASSWORD :'senha_migrador' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE otto_app      LOGIN PASSWORD :'senha_app'      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE otto_operacao LOGIN PASSWORD :'senha_operacao' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE DATABASE otto       OWNER otto_migrador;
CREATE DATABASE otto_teste OWNER otto_migrador;
SQL

for base in otto otto_teste; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$base" <<'SQL'
-- Ninguém além do dono cria objeto no esquema (já é o padrão do PostgreSQL 15 em diante; fica escrito).
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO otto_app, otto_operacao;
SQL
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "REVOKE ALL ON DATABASE $base FROM PUBLIC" -c "GRANT CONNECT ON DATABASE $base TO otto_app, otto_operacao"
done
