// Lê o site de uma marca e mostra a ficha: npx tsx scripts/ler-site.ts marca.com.br
import { lerSite } from '../src/servidor/site';

const r = await lerSite(process.argv[2] ?? '');
const logo = r.logo && ('no' in r.logo ? { vetor: r.logo.no.moldura, caminhos: r.logo.no.caminhos.length, cores: [...new Set((r.logo.no.caminhos as { preenchimento?: string }[]).map((c) => c.preenchimento))], avisos: r.logo.avisos } : r.logo);
console.log(JSON.stringify({ ...r, logo }, null, 1));
