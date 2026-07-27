import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const metrics = sqliteTable("metrics", {
  key: text("key").primaryKey(),
  value: text("value"),
  numericValue: real("numeric_value"),
  units: text("units").notNull(),
  sourceUrl: text("source_url").notNull(),
  observedAt: text("observed_at"),
  verifiedAt: text("verified_at"),
  retrievalStatus: text("retrieval_status").notNull(),
  validationResult: text("validation_result").notNull(),
  previousValue: text("previous_value"),
  note: text("note"),
  updatedAt: integer("updated_at").notNull(),
});

export const readings = sqliteTable("readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metricKey: text("metric_key").notNull(),
  numericValue: real("numeric_value").notNull(),
  units: text("units").notNull(),
  observedAt: text("observed_at").notNull(),
  verifiedAt: text("verified_at").notNull(),
  sourceUrl: text("source_url").notNull(),
});

export const quarantinedReadings = sqliteTable("quarantined_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metricKey: text("metric_key").notNull(),
  payload: text("payload").notNull(),
  reason: text("reason").notNull(),
  receivedAt: text("received_at").notNull(),
});
