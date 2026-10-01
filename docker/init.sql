SELECT 'CREATE DATABASE evolution_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution_db')\gexec
GRANT ALL PRIVILEGES ON DATABASE evolution_db TO helpdesk_user;
