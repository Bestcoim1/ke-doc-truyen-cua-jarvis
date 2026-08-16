import type { Database } from "@/database.types";

export type ContinuityEntity =
  Database["public"]["Tables"]["continuity_entities"]["Row"];
export type ContinuityEvidence =
  Database["public"]["Tables"]["continuity_evidence"]["Row"];
export type ContinuityFact =
  Database["public"]["Tables"]["continuity_facts"]["Row"];
export type ContinuityPlotThread =
  Database["public"]["Tables"]["continuity_plot_threads"]["Row"];
export type ContinuityAnalysisRun =
  Database["public"]["Tables"]["continuity_analysis_runs"]["Row"];
export type ContinuityInboxEvidence =
  Database["public"]["Tables"]["continuity_inbox_evidence"]["Row"];
export type ContinuityInboxItem =
  Database["public"]["Tables"]["continuity_inbox_items"]["Row"];
export type ContinuityTimelineEvent =
  Database["public"]["Tables"]["continuity_timeline_events"]["Row"];
export type ContinuityCharacterKnowledge =
  Database["public"]["Tables"]["continuity_character_knowledge"]["Row"];

export type ContinuityInboxItemWithEvidence = ContinuityInboxItem & {
  evidence: ContinuityInboxEvidence[];
};

export type ContinuityEntityKind =
  Database["public"]["Enums"]["continuity_entity_kind"];
export type ContinuityEvidenceKind =
  Database["public"]["Enums"]["continuity_evidence_kind"];
export type ContinuityFactStatus =
  Database["public"]["Enums"]["continuity_fact_status"];
export type ContinuityThreadStatus =
  Database["public"]["Enums"]["continuity_thread_status"];
export type ContinuityThreadType =
  Database["public"]["Enums"]["continuity_thread_type"];
export type ContinuityAlertKind =
  Database["public"]["Enums"]["continuity_alert_kind"];
export type ContinuityInboxKind =
  Database["public"]["Enums"]["continuity_inbox_kind"];
export type ContinuityKnowledgeState =
  Database["public"]["Enums"]["continuity_knowledge_state"];
export type ContinuityReviewStatus =
  Database["public"]["Enums"]["continuity_review_status"];
export type ContinuitySeverity =
  Database["public"]["Enums"]["continuity_severity"];

export const CONTINUITY_ENTITY_KINDS = [
  "character",
  "location",
  "item",
  "organization",
  "world_rule",
] as const satisfies readonly ContinuityEntityKind[];

export const CONTINUITY_FACT_STATUSES = [
  "canon",
  "candidate",
  "inference",
  "disputed",
  "retconned",
  "inactive",
] as const satisfies readonly ContinuityFactStatus[];

export const CONTINUITY_EVIDENCE_KINDS = [
  "direct_source",
  "author_document",
  "summary_derived",
  "inference",
  "suggestion",
] as const satisfies readonly ContinuityEvidenceKind[];

export const CONTINUITY_THREAD_TYPES = [
  "foreshadowing",
  "mystery",
  "promise",
  "setup_payoff",
  "other",
] as const satisfies readonly ContinuityThreadType[];

export const CONTINUITY_THREAD_STATUSES = [
  "open",
  "progressing",
  "apparently_dropped",
  "resolved",
  "intentionally_unresolved",
  "unknown",
] as const satisfies readonly ContinuityThreadStatus[];

export const ENTITY_KIND_LABELS: Record<ContinuityEntityKind, string> = {
  character: "Nhân vật",
  location: "Địa điểm",
  item: "Vật phẩm",
  organization: "Tổ chức",
  world_rule: "Luật thế giới",
};

export const FACT_STATUS_LABELS: Record<ContinuityFactStatus, string> = {
  canon: "Canon đã xác nhận",
  candidate: "Ứng viên — chờ duyệt",
  inference: "Suy luận",
  disputed: "Đang tranh chấp",
  retconned: "Đã bị retcon",
  inactive: "Không còn hiệu lực",
};

export const EVIDENCE_KIND_LABELS: Record<ContinuityEvidenceKind, string> = {
  direct_source: "Nguồn trực tiếp",
  author_document: "Tài liệu tác giả",
  summary_derived: "Từ bản tóm tắt",
  inference: "Suy luận",
  suggestion: "Đề xuất",
};

export const THREAD_TYPE_LABELS: Record<ContinuityThreadType, string> = {
  foreshadowing: "Foreshadowing",
  mystery: "Bí ẩn",
  promise: "Lời hứa truyện",
  setup_payoff: "Setup / payoff",
  other: "Khác",
};

export const THREAD_STATUS_LABELS: Record<ContinuityThreadStatus, string> = {
  open: "Đang mở",
  progressing: "Đang tiến triển",
  apparently_dropped: "Có nguy cơ bị bỏ quên",
  resolved: "Đã giải quyết",
  intentionally_unresolved: "Chủ ý để ngỏ",
  unknown: "Chưa rõ",
};

export const INBOX_KIND_LABELS: Record<ContinuityInboxKind, string> = {
  state_change: "Thay đổi trạng thái",
  location_change: "Di chuyển / vị trí",
  knowledge_claim: "Kiến thức nhân vật",
  possession_change: "Vật phẩm / sở hữu",
  timeline_event: "Sự kiện timeline",
  alert: "Cảnh báo continuity",
};

export const ALERT_KIND_LABELS: Record<ContinuityAlertKind, string> = {
  state_conflict: "Trạng thái xung đột",
  impossible_travel: "Di chuyển cần kiểm tra",
  premature_knowledge: "Kiến thức xuất hiện quá sớm",
  duplicate_item: "Vật phẩm xuất hiện trùng",
  forgotten_thread: "Plot thread có nguy cơ bị quên",
};

export const SEVERITY_LABELS: Record<ContinuitySeverity, string> = {
  minor: "Nhẹ",
  moderate: "Vừa",
  major: "Nghiêm trọng",
  canon_breaking: "Phá vỡ canon",
};

export const KNOWLEDGE_STATE_LABELS: Record<ContinuityKnowledgeState, string> = {
  knows: "Đã biết",
  does_not_know: "Chưa biết",
  believes_false: "Tin điều sai",
  doubts: "Đang nghi ngờ",
};

export type StudioChapter = {
  id: string;
  title: string;
  sortOrder: number;
};

export type StudioStorySummary = {
  id: string;
  title: string;
  description: string | null;
  updatedAt: string;
  writingStatus: Database["public"]["Enums"]["story_writing_status"];
  coverImageUrl: string | null;
};

export type ContinuityStudioData = {
  story: StudioStorySummary;
  chapters: StudioChapter[];
  entities: ContinuityEntity[];
  facts: ContinuityFact[];
  evidence: ContinuityEvidence[];
  threads: ContinuityPlotThread[];
  analysisRuns: ContinuityAnalysisRun[];
  inboxItems: ContinuityInboxItemWithEvidence[];
  reviewedEvidence: ContinuityInboxEvidence[];
  timelineEvents: ContinuityTimelineEvent[];
  characterKnowledge: ContinuityCharacterKnowledge[];
  p1Available: boolean;
};

export type StudioActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const EMPTY_STUDIO_ACTION_STATE: StudioActionState = {
  status: "idle",
  message: "",
};
