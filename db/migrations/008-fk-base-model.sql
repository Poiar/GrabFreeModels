-- M14: FK from super_models.base_model → super_models.slug
-- slug has a UNIQUE constraint so this FK is valid
ALTER TABLE super_models ADD CONSTRAINT IF NOT EXISTS fk_super_models_base_model
  FOREIGN KEY (base_model) REFERENCES super_models(slug) ON DELETE SET NULL;
