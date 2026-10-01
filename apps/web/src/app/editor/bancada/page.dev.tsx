// SÓ DE DESENVOLVIMENTO. O nome termina em ".dev.tsx" de propósito: o next.config.ts só aceita essa
// extensão como página quando o ambiente é de desenvolvimento, então esta rota NÃO EXISTE no build
// de produção (scripts/conferir-pacote-publico.ts confere). Abre o editor com um documento de
// exemplo fixo, sem API: http://localhost:8080/editor/bancada
import { CarregadorDaBancada } from '../../../editor/bancada/CarregadorDaBancada';

export default function PaginaDaBancada() {
  return <CarregadorDaBancada />;
}
