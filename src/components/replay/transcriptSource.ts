// Which session the timeline is currently showing.
//
// Deep inside the tree, `OutputPane` needs `(slug, sessionId)` to fetch a tool
// output that Claude Code spilled to disk. Threading that pair through
// TranscriptTimeline → AssistantTurn → ToolCall → OutputPane as props would put
// it in four component signatures that have no other use for it. The pages that
// know it — TranscriptReplayPage, SessionsPage — provide it instead.
//
// Injecting `null` is a supported state: it means "we cannot fetch", and the
// pane degrades to showing the preview the transcript already carries.

import type { InjectionKey, Ref } from 'vue';

export interface TranscriptSource {
  slug: string;
  sessionId: string;
}

export const TRANSCRIPT_SOURCE: InjectionKey<Ref<TranscriptSource | null>> =
  Symbol('transcript-source');
