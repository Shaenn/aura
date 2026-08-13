<template>
  <ResourceViewer
    :title="t('pages.agents.title')"
    :subtitle="t('pages.agents.subtitle')"
    icon="smart_toy"
    :loader="listAgents"
    :keys="AGENT_KEYS"
    :accent-for="(it) => agentColor(it.title || it.name)"
    :delete-path-for="(rel) => rel"
    :empty-label="t('pages.agents.empty')"
    :placeholder="t('pages.agents.placeholder')"
    :no-description="t('pages.agents.noDescription')"
    :delete-title="t('pages.agents.deleteTitle')"
    :delete-note="t('pages.agents.deleteNote')"
  />
</template>

<script setup lang="ts">
// An agent is a single file (agents/<name>.md), so no `refs-dir`: there is no
// folder of reference files to browse, unlike a skill.
//
// The dot is keyed on the agent's name, which is what a transcript records as
// `subagent_type` — so an agent wears the same colour here and in a replay.
import { useI18n } from 'vue-i18n';
import ResourceViewer from '@/components/resources/ResourceViewer.vue';
import { listAgents } from '@/services/claude';
import { agentColor } from '@/utils/agentColors';
import { AGENT_KEYS } from '@/utils/resourceFrontmatter';

const { t } = useI18n();
</script>
