USE shinetech_db;
ALTER TABLE job_items ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'spare';
DESCRIBE job_items;
