import { describe, expect, it } from 'vitest';
import { paraMensagensDoClaude } from '../modelo';

describe('paraMensagensDoClaude', () => {
  it('junta resposta de ferramenta e imagens do render na mesma mensagem do usuário', () => {
    const { system, messages } = paraMensagensDoClaude([
      { role: 'system', content: 'prompt' },
      { role: 'user', content: 'tarefa' },
      { role: 'assistant', content: 'vou olhar', tool_calls: [{ id: 't1', type: 'function', function: { name: 'renderizar', arguments: '{"prancheta":"Feed"}' } }] },
      { role: 'tool', tool_call_id: 't1', content: 'render anexado' },
      { role: 'user', content: [{ type: 'text', text: 'Render:' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }] },
    ]);
    expect(system).toBe('prompt');
    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'vou olhar' }, { type: 'tool_use', id: 't1', name: 'renderizar', input: { prancheta: 'Feed' } }] });
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'render anexado' },
        { type: 'text', text: 'Render:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
      ],
    });
  });

  it('devolve os blocos originais do Claude, com o raciocínio, quando existem', () => {
    const blocos = [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'oi' }];
    const { messages } = paraMensagensDoClaude([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'oi', blocos }]);
    expect(messages[1]).toEqual({ role: 'assistant', content: blocos });
  });
});

describe('tipoDaImagem', () => {
  it('lê o tipo pela assinatura, não pelo que foi declarado', async () => {
    const { tipoDaImagem } = await import('../modelo');
    expect(tipoDaImagem('iVBORw0KGgoAAAA')).toBe('image/png');
    expect(tipoDaImagem('/9j/4AAQ')).toBe('image/jpeg');
    expect(tipoDaImagem('xxxx')).toBeUndefined();
  });
});
