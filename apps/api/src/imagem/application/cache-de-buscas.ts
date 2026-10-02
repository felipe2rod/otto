// Porta: o cache das buscas no banco de imagens (ADR 032: toda busca é servida do cache por 24 horas).
// É da plataforma, não da conta: o resultado de uma busca é o mesmo para qualquer conta, e a cota do banco
// é uma só. Não guarda o texto da busca: `chave` é um hash. Só cresce.
// É também a prova de que um id "veio de busca": o servidor só baixa endereço que está aqui.
import type { ImagemNoBanco } from './banco-de-imagens';

export abstract class CacheDeBuscas {
  /** Os resultados da busca mais recente com esta chave, se foi feita a partir de `desde`. */
  abstract recente(banco: string, chave: string, desde: Date): Promise<ImagemNoBanco[] | undefined>;
  abstract guardar(banco: string, chave: string, resultados: readonly ImagemNoBanco[], agora: Date): Promise<void>;
  /** Um resultado que apareceu em alguma busca feita a partir de `desde`, pelo id. O mais recente. */
  abstract vista(banco: string, id: string, desde: Date): Promise<ImagemNoBanco | undefined>;
}
