Write a PySpark job that reads a CSV with columns (id, name, email, phone, created_at), deduplicates on (email, phone) keeping the most recent record, and writes the result as parquet.

Handle nulls in dedup keys — if both email and phone are null, drop the row. If only one is null, deduplicate on the non-null key.

Include a test that:
1. Generates a 1000-row CSV where 20% are duplicates
2. Runs the dedup pipeline
3. Asserts the output row count is correct
4. Prints a summary of duplicates found per key
