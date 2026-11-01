import { Injectable } from '@nestjs/common';

@Injectable()
export class DocumentConfig {
  readonly maxBytes: number;
  constructor() {
    const mb = Number(process.env.VEHICLE_DOCUMENT_MAX_SIZE_MB ?? 10);
    if (!Number.isInteger(mb) || mb < 1 || mb > 10) throw new Error('VEHICLE_DOCUMENT_MAX_SIZE_MB deve estar entre 1 e 10.');
    this.maxBytes = mb * 1024 * 1024;
  }
}
