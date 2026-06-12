-- Track how each base_model edge was discovered. Enables confidence
-- scoring in the lineage tree and auditing of heuristic vs authoritative links.
--
-- Priority order (authoritative → heuristic):
--   hf_card            HuggingFace model card frontmatter (cardData.base_model)
--   hf_tag             HuggingFace auto-generated tags (base_model: prefix)
--   crfm               Stanford CRFM Ecosystem Graph dependency
--   fastchat           FastChat/LMSYS model_registry.py description text
--   openrouter_desc    OpenRouter model description parsing
--   version_chain      Hardcoded version chain (fix-base-model-chains.js)
--   creator_match      Base creator → creator matching
--   sync_ingest        Derivation detector at sync ingestion time
--   name_heuristic     Substring/token-overlap name matching
--   family_heuristic   Family name substring matching
--   manual             Hand-edited

ALTER TABLE super_models ADD COLUMN IF NOT EXISTS derivation_source VARCHAR(32);

COMMENT ON COLUMN super_models.derivation_source IS 'How the base_model link was discovered — enables edge confidence scoring in the lineage tree.';
