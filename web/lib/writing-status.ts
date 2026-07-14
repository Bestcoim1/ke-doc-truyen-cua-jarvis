import type { Database } from "@/database.types";

export type WritingStatus = Database["public"]["Enums"]["story_writing_status"];

export const DEFAULT_WRITING_STATUS: WritingStatus = "drafting";

export const WRITING_STATUS_OPTIONS: {
  value: WritingStatus;
  label: string;
  description: string;
  progressPct: number;
}[] = [
  {
    value: "idea",
    label: "Lên ý tưởng",
    description: "Đang gom chất liệu và hướng đi.",
    progressPct: 10,
  },
  {
    value: "outlining",
    label: "Lập dàn ý",
    description: "Đang dựng cấu trúc, hồi, chương.",
    progressPct: 25,
  },
  {
    value: "drafting",
    label: "Đang thực hiện",
    description: "Đang viết hoặc dịch bản thảo chính.",
    progressPct: 55,
  },
  {
    value: "revising",
    label: "Đang chỉnh sửa",
    description: "Đang đọc lại, sửa nhịp, sửa câu.",
    progressPct: 80,
  },
  {
    value: "completed",
    label: "Hoàn thành",
    description: "Bản thảo đã khép lại.",
    progressPct: 100,
  },
  {
    value: "paused",
    label: "Tạm dừng",
    description: "Tạm gác, vẫn giữ trong kệ.",
    progressPct: 45,
  },
];

export const WRITING_STATUS_VALUES = WRITING_STATUS_OPTIONS.map(
  (option) => option.value,
);

export function getWritingStatusMeta(status: WritingStatus | null | undefined) {
  return (
    WRITING_STATUS_OPTIONS.find((option) => option.value === status) ??
    WRITING_STATUS_OPTIONS.find(
      (option) => option.value === DEFAULT_WRITING_STATUS,
    )!
  );
}
