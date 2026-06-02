-- merge-duplicate-masters.sql
-- Merges super_models where the same underlying model has multiple masters
-- due to naming differences across providers.
--
-- Conservative: only merge pairs where remote_ids clearly refer to the same model.
-- Each pair is (merge_this_id → into_this_id).

BEGIN;

DO $$
DECLARE
    pairs INT[][] := ARRAY[
        -- GPT-OSS-120B: 3 masters, same model "gpt-oss-120b" on different providers
        -- Keep 924 (most datapoints), merge 977 (openrouter/cerebras/cortecs) and 1032 (openrouter/openai)
        [977, 924],
        [1032, 924],

        -- GLM-4.6V Flash: same model "glm-4.6v-flash" on llmgateway vs zenmux
        [1025, 998],

        -- Kimi K2 Instruct: same model "moonshotai/kimi-k2-instruct" on HF vs NVIDIA
        [1086, 1154],

        -- Kimi K2 0905: same model via nvidia vs iflowcn (already have kimi-k2-0905)
        [1109, 845],

        -- Llama 4 Scout FP8: same model on vercel/llama vs github/llama-4-scout
        -- Keep 1222 (most datapoints), merge 1043 and 1185
        [1043, 1222],
        [1185, 1222],

        -- Llama 4 Maverick FP8: same model on github/nvidia/vercel/llama
        -- Keep 931 (most datapoints), merge 898 and 926
        [898, 931],
        [926, 931],

        -- Cohere Command R 08-2024: same model "cohere-command-r-plus-08-2024" on github
        -- Both 865 (cohere-command-r-08-2024) and 1250 (cohere-command-r-plus-08-2024) on github-models
        -- They're actually different model IDs from cohere. Skip — these are different versions.

        -- sarvam-m: same model, different casing
        [1202, 1042],

        -- mistral-nemotron: same model, different casing
        [1101, 975],

        -- Whisper Large v3 dup: same model "whisper-large-v3" on different providers
        [1027, 885],

        -- Whisper Large v3 Turbo: same model "whisper-large-v3-turbo"
        -- Keep separate: turbo is a different (faster) variant. Skip.

        -- Compound Mini: same model family but different remote_ids (compound vs compound-mini)
        -- Keep separate — these are different endpoints on Groq. Skip.

        -- DeepSeek V3 variants: deepseek-v3 on iflowcn vs deepseek-v3.1-terminus on nvidia
        -- These are genuinely different model versions. Skip.

        -- DeepSeek R1 0528: same model "deepseek-r1-0528" on iflowcn vs github
        -- Keep 1150, merge 1006's datapoints? No — 1006 is generic "deepseek-r1", keep it.
        -- Skip — different versions.

        -- Qwen3 Coder Plus: same model "qwen3-coder-plus" on different providers
        [903, 1112],

        -- Qwen3-Max: same model on openrouter vs zenmux/umans
        -- Keep 947, merge 976 and 1077
        [976, 947],
        [1077, 947],

        -- Phi-4 variants: genuinely different models (mini, multimodal, reasoning, etc.)
        -- Skip — these should stay separate.

        -- Nemotron 3 Nano 30B A3B: same model on different providers (cerebras/openrouter/nvidia)
        [932, 1064],

        -- Nemotron 3 Nano Omni 30B: merge into 1022 (has more datapoints)
        -- Actually 1234 is more specific. Keep 1022 (cerebras + openrouter + kilo + zenmux = 4 dp)
        -- vs 1234 (github = 1 dp). Skip — 1234 may be a different packaging.

        -- Nemotron Super 49B v1.5: same model, just version bump
        [1204, 1031],

        -- Llama 3.3 Nemotron Super 49B v1.5: version bump of same model
        [1181, 954],

        -- MiMo-V2.5-TTS variants: TTS and TTS-VoiceClone are different models
        -- Skip — genuinely different capabilities.

        -- Mistral Medium 3 variants: 3.5 is a different version. Skip.

        -- Mistral Nemo variants: different sizes (12B vs 8B minitron). Skip.

        -- Mistral Large 3 variants: same base model, different provider packaging
        [1050, 1073],

        -- Gemma naming variants (gemma-2-2b-it, gemma-3-27b, gemma-4-31b):
        -- Different providers using different naming. Same model though.
        -- Skip for now — too aggressive without more research.
    ];
    i INT;
    from_id INT;
    to_id INT;
    moved INT := 0;
BEGIN
    FOR i IN 1..array_length(pairs, 1) LOOP
        from_id := pairs[i][1];
        to_id := pairs[i][2];

        IF from_id = to_id THEN CONTINUE; END IF;

        -- Reassign datapoint_models that won't conflict
        UPDATE datapoint_models dm
        SET super_model_id = to_id,
            updated_at = now()
        WHERE dm.super_model_id = from_id
          AND NOT EXISTS (
              SELECT 1 FROM datapoint_models existing
              WHERE existing.datapoint_provider_id = dm.datapoint_provider_id
                AND existing.remote_id = dm.remote_id
                AND existing.super_model_id = to_id
          );

        -- Delete remaining datapoint_models (conflicts)
        DELETE FROM datapoint_models WHERE super_model_id = from_id;

        -- Delete the duplicate master
        DELETE FROM super_models WHERE id = from_id;

        moved := moved + 1;
    END LOOP;

    RAISE NOTICE 'Merged % duplicate masters', moved;
END $$;

-- Validate: no orphaned datapoint_models
DO $$
DECLARE
    orphaned INT;
BEGIN
    SELECT COUNT(*) INTO orphaned
    FROM datapoint_models dm
    WHERE NOT EXISTS (SELECT 1 FROM super_models mm WHERE mm.id = dm.super_model_id);

    IF orphaned > 0 THEN
        RAISE WARNING '% orphaned datapoint_models found', orphaned;
    ELSE
        RAISE NOTICE 'No orphaned datapoint_models';
    END IF;
END $$;

COMMIT;
