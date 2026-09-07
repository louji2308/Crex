import { transcriptSegmentSchema } from "@crex/schemas";
import type { TranscriptSegment } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "transcript_segments";
const JSON_FIELDS = [] as const;

export class TranscriptSegmentRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(segment: TranscriptSegment): Promise<TranscriptSegment> {
    const parsed = transcriptSegmentSchema.parse(segment);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<TranscriptSegment | undefined> {
    return getRow<TranscriptSegment>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<TranscriptSegment[]> {
    return listRows<TranscriptSegment>(this.db, `SELECT * FROM ${TABLE} ORDER BY segment_index`, [], JSON_FIELDS);
  }

  async listBySourceAsset(sourceAssetId: string): Promise<TranscriptSegment[]> {
    return listRows<TranscriptSegment>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE source_asset_id = ? ORDER BY segment_index`,
      [sourceAssetId],
      JSON_FIELDS,
    );
  }
}