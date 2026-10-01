import { SondaDoBanco } from '../saude/sonda-do-banco';
import type { PrismaComEscopo } from './prisma-com-escopo';

export class SondaDoPrisma extends SondaDoBanco {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  responde(): Promise<boolean> {
    return this.prisma.responde();
  }
}
