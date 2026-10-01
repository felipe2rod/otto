// Processo do worker: o mesmo código da API, sem as rotas de negócio. Na fatia 0 ele só responde
// saúde; os consumidores da fila (exportação, tarefa do agente) entram a partir da fatia 2.
import { iniciar } from './aplicacao';

await iniciar('worker', process.env);
