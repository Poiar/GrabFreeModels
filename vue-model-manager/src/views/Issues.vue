<template>
  <div>
    <div class="page-header">
      <h2>Known Issues</h2>
      <p>Non-fatal issues affecting model usability</p>
    </div>

    <div v-if="store.knownIssues.length === 0" class="card">
      <p class="text-dim">No known issues.</p>
    </div>

    <div v-for="issue in store.knownIssues" :key="issue.model_id + issue.issue" class="issue-card">
      <div class="issue-header">
        <span class="model-id">{{ issue.model_id }}</span>
        <span class="badge" :class="`badge-severity-${issue.severity}`">
          {{ issue.severity }}
        </span>
      </div>
      <div class="issue-body">
        <p><span class="label">Issue:</span> {{ issue.issue }}</p>
        <p><span class="label">Impact:</span> {{ issue.impact }}</p>
        <p><span class="label">Workaround:</span> {{ issue.workaround }}</p>
        <p class="issue-dates">
          Reported: {{ issue.reported }} · Last verified: {{ issue.last_verified }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModelsStore } from '@/store/models'

const store = useModelsStore()
</script>
