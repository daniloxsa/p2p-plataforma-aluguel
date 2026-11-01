import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { validateImage } from '../fotos/validate-image.ts';
import type {} from 'multer';

// Parse untrusted PDF structures off the API event loop with a bounded heap/time.
async function checkPdf(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const { PDFDocument } = await import(workerData.library);
        const pdf = await PDFDocument.load(workerData.bytes, { throwOnInvalidObject: true, updateMetadata: false });
        if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 100) throw Error('Invalid pages');
        parentPort.postMessage(true);
      })().catch(() => parentPort.postMessage(false));
    `, { eval: true, workerData: { bytes: buffer, library: import.meta.resolve('pdf-lib') }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } });
    const timer = setTimeout(() => { reject(new Error('PDF timeout')); void worker.terminate(); }, 10000);
    worker.once('message', valid => { clearTimeout(timer); void worker.terminate(); valid ? resolve() : reject(new Error('Invalid PDF')); });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', () => { clearTimeout(timer); reject(new Error('PDF worker stopped')); });
  });
}

export async function validateDocument(file: Express.Multer.File | undefined, maxBytes: number) {
  if (!file?.buffer?.length) throw new BadRequestException('Selecione um documento não vazio.');
  if (file.buffer.length > maxBytes) throw new PayloadTooLargeException('Documento acima do limite permitido.');
  const extension = /\.([a-z0-9]+)$/i.exec(file.originalname)?.[1]?.toLowerCase();
  const types: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  if (!extension || types[extension] !== file.mimetype) throw new BadRequestException('Use PDF, JPEG, PNG ou WebP com extensão e tipo compatíveis.');
  if (extension !== 'pdf') {
    try { return await validateImage(file, maxBytes); }
    catch (error) {
      if (error instanceof PayloadTooLargeException) throw error;
      throw new BadRequestException('Imagem inválida, incompatível ou acima de 20 megapixels.');
    }
  }
  try {
    if (!/^%PDF-1\.[0-7]/.test(file.buffer.subarray(0, 8).toString('ascii')) ||
      !/%%EOF\s*$/.test(file.buffer.subarray(-1024).toString('latin1'))) throw new Error('Invalid PDF envelope');
    await checkPdf(file.buffer);
    return { buffer: file.buffer, mime: 'application/pdf', extension: 'pdf' };
  } catch { throw new BadRequestException('PDF inválido, protegido ou com mais de 100 páginas.'); }
}
