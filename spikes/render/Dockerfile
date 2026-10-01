# Spike de render (ADR 030). Imagem só de desenvolvimento: o código entra por montagem.
FROM node:24-slim
# O volume nomeado de node_modules herda o dono desta pasta: sem isto ele nasce do root.
RUN mkdir -p /spike/node_modules && chown -R node:node /spike
USER node
WORKDIR /spike
