<template>
  <ResourceViewer
    :title="t('pages.skills.title')"
    :subtitle="t('pages.skills.subtitle')"
    icon="bolt"
    :loader="listSkills"
    :keys="SKILL_KEYS"
    :delete-path-for="skillDir"
    :refs-dir="skillDir"
    :empty-label="t('pages.skills.empty')"
    :placeholder="t('pages.skills.placeholder')"
    :no-description="t('pages.skills.noDescription')"
    :delete-title="t('pages.skills.deleteTitle')"
    :delete-note="t('pages.skills.deleteNote')"
  />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ResourceViewer from 'components/resources/ResourceViewer.vue';
import { listSkills } from 'src/services/claude';
import { SKILL_KEYS } from 'src/utils/resourceFrontmatter';

const { t } = useI18n();

/** A skill is a folder: `skills/foo/SKILL.md` → `skills/foo`. */
const skillDir = (rel: string): string => rel.replace(/\/SKILL\.md$/i, '');
</script>
