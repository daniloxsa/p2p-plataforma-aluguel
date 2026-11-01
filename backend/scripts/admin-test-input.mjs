import { emitKeypressEvents } from 'node:readline';
import { AdminTestError, AdminTestCancelled } from './admin-test-safety.mjs';

// Both email and password are invisible. No readline history, argv or env input.
export function readHidden(prompt, { input = process.stdin, output = process.stdout, maxLength = 255 } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new AdminTestError('Use um terminal interativo com entrada oculta; credenciais por pipe não são aceitas.'));
  }
  return new Promise((resolve, reject) => {
    let value = '', finished = false;
    const wasRaw = Boolean(input.isRaw);
    const finish = (error) => {
      if (finished) return;
      finished = true;
      input.removeListener('keypress', keypress);
      input.removeListener('end', ended);
      input.removeListener('error', ended);
      process.removeListener('SIGINT', cancelled);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      const result = value; value = '';
      if (error) reject(error); else resolve(result);
    };
    const cancelled = () => finish(new AdminTestCancelled('Entrada cancelada.'));
    const ended = () => finish(new AdminTestError('Terminal encerrado durante a entrada.'));
    const keypress = (text, key = {}) => {
      if (key.ctrl && ['c', 'd', 'z'].includes(key.name)) return cancelled();
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') { value = [...value].slice(0, -1).join(''); return; }
      if (key.ctrl || key.meta || !text || /[\p{C}]/u.test(text)) return;
      if (value.length + text.length > maxLength) return finish(new AdminTestError('Entrada excedeu o limite permitido; nada foi enviado.'));
      value += text;
    };
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.on('keypress', keypress);
    input.once('end', ended);
    input.once('error', ended);
    process.once('SIGINT', cancelled);
    output.write(prompt);
    input.resume();
  });
}
