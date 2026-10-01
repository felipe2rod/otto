// Processo do worker: o mesmo código da API, sem as rotas de negócio. Responde saúde e consome a
// fila de exportação (ciclo-de-vida.ts liga o consumidor na subida). A tarefa do agente entra depois.
import { iniciar } from './aplicacao';

await iniciar('worker', process.env);
