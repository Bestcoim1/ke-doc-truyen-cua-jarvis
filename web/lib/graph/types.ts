export const STORED_RELATIONSHIP_TYPES = [
  "sequel",
  "spinoff",
  "side_story",
  "adaptation",
  "related",
] as const;

export type StoredRelationshipType =
  (typeof STORED_RELATIONSHIP_TYPES)[number];

export type RelationshipPerspective =
  | "sequel"
  | "prequel"
  | "spinoff"
  | "original_of_spinoff"
  | "side_story"
  | "main_story"
  | "adaptation"
  | "source_material"
  | "related";

export type GraphNodeType = "story" | "section" | "chapter";
export type GraphNodeId =
  | `story:${string}`
  | `section:${string}`
  | `chapter:${string}`;

export type GraphNode = {
  id: GraphNodeId;
  entityId: string;
  label: string;
  type: GraphNodeType;
  storyId: string;
  sectionType?: "volume" | "arc" | "part";
  chapterKind?: "regular" | "extra";
  childCount?: number;
  isPrimaryStory?: boolean;
  isExpanded?: boolean;
};

export type GraphLink = {
  id: string;
  source: GraphNodeId;
  target: GraphNodeId;
  type: "contains" | StoredRelationshipType;
  label?: string;
  relationshipId?: string;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

export type GraphStory = {
  id: string;
  title: string;
  createdAt?: string;
};

export type GraphSection = {
  id: string;
  storyId: string;
  parentSectionId: string | null;
  title: string;
  type: "volume" | "arc" | "part";
  sortOrder: number;
};

export type GraphChapter = {
  id: string;
  storyId: string;
  sectionId: string | null;
  title: string;
  kind: "regular" | "extra";
  sortOrder: number;
};

export type StoryHierarchy = {
  story: GraphStory;
  sections: GraphSection[];
  chapters: GraphChapter[];
};

export type StoryRelationship = {
  id: string;
  sourceStoryId: string;
  targetStoryId: string;
  relationshipType: StoredRelationshipType;
};

export type RelationshipView = {
  otherStoryId: string;
  perspective: RelationshipPerspective;
  isCurrentStorySource: boolean;
};

export type StoryOption = {
  id: string;
  title: string;
};

export type StoryGraphShell = {
  story: GraphStory;
  graph: GraphData;
  relationships: StoryRelationship[];
  relatedStories: StoryOption[];
  availableStories: StoryOption[];
};

export type ConnectedStoryComponent = {
  id: string;
  representativeStory: GraphStory & { createdAt: string };
  stories: (GraphStory & { createdAt: string })[];
  relationships: StoryRelationship[];
  relationshipTypeCounts: Partial<Record<StoredRelationshipType, number>>;
};

export type GraphFilters = {
  showSections: boolean;
  showChapters: boolean;
};

export type GraphActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const EMPTY_GRAPH_ACTION_STATE: GraphActionState = {
  status: "idle",
  message: "",
};

export type HierarchyLoadResult =
  | { ok: true; hierarchy: StoryHierarchy }
  | { ok: false; message: string };

export type GraphQueryResult<T> = {
  data: T | null;
  error: string | null;
};
