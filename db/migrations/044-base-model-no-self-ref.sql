-- Prevent base_model from referencing the same row (self-reference).
-- Self-referencing base_model creates infinite chains that crash the
-- frontend (NewDashboard, LineageTree, ModelCard, ModelDetailPanel) and
-- cause scripts like inherit-families.js to loop forever.
--
-- This is the first line of defense. Script-layer guards in
-- safe-chain-walker.js catch cross-model cycles before they're written.
ALTER TABLE super_models
  ADD CONSTRAINT ck_base_model_no_self_ref CHECK (base_model IS NULL OR base_model <> slug);
