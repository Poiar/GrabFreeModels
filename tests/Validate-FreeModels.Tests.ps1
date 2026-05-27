# Requires -Modules Pester
Describe 'Validate-FreeModels Script' {
    BeforeAll {
        $repoRoot = "C:\OC\GrabFreeModels"
        $jsonPath = Join-Path $repoRoot "available-models.json"
        $original = Get-Content $jsonPath -Raw | ConvertFrom-Json
    }
    Context 'Sanity check script' {
        It 'reports no missing IDs after pruning' {
            & "C:\OC\GrabFreeModels\scripts\check-rankings.ps1" | Should -Not -Match 'Missing model ID'
        }
    }
    AfterAll {
        # Restore original JSON in case test modified it (no modification expected)
        $original | ConvertTo-Json -Depth 10 | Set-Content $jsonPath -Encoding utf8
    }
}
