import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type {} from 'multer';

export async function validateImage(file: Pick<Express.Multer.File, 'buffer' | 'mimetype'>, maxBytes: number) {
  if (file.buffer.length > maxBytes) throw new PayloadTooLargeException('Limite de 5 MB por foto.');
  const formats: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  if (!Object.values(formats).includes(file.mimetype)) throw new UnsupportedMediaTypeException('Use JPEG, PNG ou WebP.');
  try {
    const image = sharp(file.buffer, { limitInputPixels: 20000000, failOn: 'warning' });
    const meta = await image.metadata();
    if (!meta.format || formats[meta.format] !== file.mimetype) throw new UnsupportedMediaTypeException('Formato real diferente do tipo informado.');
    if ((meta.pages ?? 1) !== 1) throw new BadRequestException('Imagens animadas não são aceitas.');
    // Fully decode and normalize: signatures/metadata alone cannot detect truncated images.
    const buffer = await image.rotate().toFormat(meta.format as 'jpeg' | 'png' | 'webp').toBuffer();
    if (buffer.length > maxBytes) throw new PayloadTooLargeException('Imagem normalizada excede 5 MB.');
    return { buffer, mime: formats[meta.format], extension: meta.format === 'jpeg' ? 'jpg' : meta.format,
      hash: createHash('sha256').update(file.buffer).digest('hex') };
  } catch (error) {
    if (error instanceof UnsupportedMediaTypeException || error instanceof BadRequestException || error instanceof PayloadTooLargeException) throw error;
    throw new BadRequestException('Imagem inválida, corrompida ou acima de 20 megapixels.');
  }
}
