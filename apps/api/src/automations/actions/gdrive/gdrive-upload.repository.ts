export interface GdriveUploadContext {
  readonly envelope: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly auditPath: string | null;
    readonly sealedPath: string | null;
  };
  /** Documents in `ord` order. Empty for a legacy envelope without document rows. */
  readonly documents: ReadonlyArray<{
    readonly ord: number;
    readonly title: string;
    readonly sealedPath: string | null;
  }>;
}

/** Queries for the Drive action: the sealed artifacts and the remembered folder. */
export abstract class GdriveUploadRepository {
  abstract loadContext(input: {
    readonly ownerId: string;
    readonly envelopeId: string;
  }): Promise<GdriveUploadContext | null>;

  /**
   * Remember the default folder on the recipe (`config.folder_id` /
   * `folder_name`), only while none is stored. Returns the folder id that
   * is stored afterwards, which may be another run's if it won the race.
   */
  abstract rememberFolder(input: {
    readonly ownerId: string;
    readonly automationId: string;
    readonly folderId: string;
    readonly folderName: string;
  }): Promise<string>;
}
