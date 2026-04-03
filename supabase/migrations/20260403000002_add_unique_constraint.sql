-- Add UNIQUE constraint on user_id to prevent duplicates and enable proper upserts
ALTER TABLE roadmap_data ADD CONSTRAINT roadmap_data_user_id_unique UNIQUE (user_id);
