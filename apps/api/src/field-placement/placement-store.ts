import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { FieldKind } from 'shared';
import type { EnvelopesService } from '../envelopes/envelopes.service';
import {
  EnvelopeFieldNotFoundError,
  type CreateFieldInput,
  type EnvelopesRepository,
  type FieldUpdateById,
} from '../envelopes/envelopes.repository';
import type { StorageService } from '../storage/storage.service';

export interface PlacementSigner {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface PlacementStoredField {
  readonly id: string;
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly required: boolean;
  readonly link_id: string | null;
}

export interface PlacementEnvelope {
  readonly id: string;
  readonly status: string;
  readonly original_file_path: string | null;
  readonly signers: readonly PlacementSigner[];
  readonly fields: readonly PlacementStoredField[];
}

/**
 * The envelopes service owns writes. The engine never talks to SQL
 * itself. Tests pass an in-memory store; MCP will pass
 * `envelopePlacementStore`.
 */
export interface PlacementStore {
  load(owner_id: string, envelope_id: string): Promise<PlacementEnvelope>;
  download(path: string): Promise<Buffer>;
  replaceFields(
    owner_id: string,
    envelope_id: string,
    fields: readonly CreateFieldInput[],
  ): Promise<readonly PlacementStoredField[]>;
  updateFieldsById(
    envelope_id: string,
    updates: readonly FieldUpdateById[],
    remove: readonly string[],
  ): Promise<readonly PlacementStoredField[]>;
}

function toStored(field: {
  readonly id: string;
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number | null | undefined;
  readonly height?: number | null | undefined;
  readonly required: boolean;
  readonly link_id?: string | null | undefined;
}): PlacementStoredField {
  return {
    id: field.id,
    signer_id: field.signer_id,
    kind: field.kind,
    page: field.page,
    x: field.x,
    y: field.y,
    width: field.width ?? null,
    height: field.height ?? null,
    required: field.required,
    link_id: field.link_id ?? null,
  };
}

export function envelopePlacementStore(
  envelopes: EnvelopesService,
  repo: EnvelopesRepository,
  storage: StorageService,
): PlacementStore {
  return {
    async load(owner_id: string, envelope_id: string): Promise<PlacementEnvelope> {
      const envelope = await envelopes.getById(owner_id, envelope_id);
      const paths = await repo.getFilePaths(envelope_id);
      return {
        id: envelope.id,
        status: envelope.status,
        original_file_path: paths?.original_file_path ?? null,
        signers: envelope.signers.map((signer) => ({
          id: signer.id,
          name: signer.name,
          color: signer.color,
        })),
        fields: envelope.fields.map((field) => toStored(field)),
      };
    },
    async download(path: string): Promise<Buffer> {
      try {
        return await storage.download(path);
      } catch {
        throw new BadRequestException('file_not_ready');
      }
    },
    async replaceFields(owner_id, envelope_id, fields) {
      const stored = await envelopes.replaceFields(owner_id, envelope_id, fields);
      return stored.map((field) => toStored(field));
    },
    async updateFieldsById(envelope_id, updates, remove) {
      try {
        const stored = await repo.updateFieldsById(envelope_id, updates, remove);
        return stored.map((field) => toStored(field));
      } catch (err) {
        if (err instanceof EnvelopeFieldNotFoundError)
          throw new NotFoundException('field_not_found');
        throw err;
      }
    },
  };
}
