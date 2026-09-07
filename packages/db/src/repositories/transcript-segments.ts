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

  insert(segment: TranscriptSegment): TranscriptSegment {
    const parsed = transcriptSegmentSchema.parse(segment);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): TranscriptSegment | undefined {
    return getRow<TranscriptSegment>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  list(): TranscriptSegment[] {
    return listRows<TranscriptSegment>(this.db, `SELECT * FROM ${TABLE} ORDER BY segment_index`, [], JSON_FIELDS);
  }

  listBySourceAsset(sourceAssetId: string): TranscriptSegment[] {
    return listRows<TranscriptSegment>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE source_asset_id = ? ORDER BY segment_index`,
      [sourceAssetId],
      JSON_FIELDS,
    );
  }
}