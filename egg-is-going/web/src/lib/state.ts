// DB의 현재 상태 → 에이전트 입력. (이전 단계 결과를 다시 계산하지 않고 원장에서 읽는다)
import { db, parse } from "./db";
import type {
  ActionOut, Decision, IdeaChange, ItemStatus, LockedState, MeetingIn, ParticipantIn, SegmentIn, TemplateRules, Topic,
} from "./agents/types";

export type ItemContent = {
  value: string | null;
  hold_reason: string | null;
  revisit: string | null;
  confidence: number;
  intent: string | null;
  idea_changes: IdeaChange[];
};

export async function participantsOf(meetingId: string) {
  const ps = await db.participant.findMany({ where: { meetingId }, orderBy: { id: "asc" } });
  // 키는 등록 순서(정렬 고정)로 p1, p2… — 실행마다 같은 키가 되도록 id 대신 displayName 순서를 쓰지 않는다
  const ordered = [...ps].sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
  const toKey = new Map(ordered.map((p, i) => [p.id, `p${i + 1}`]));
  const toId = new Map(ordered.map((p, i) => [`p${i + 1}`, p.id]));
  const list: ParticipantIn[] = ordered.map((p, i) => ({ key: `p${i + 1}`, name: p.displayName, role_label: p.roleLabel, team: p.team as ParticipantIn["team"] }));
  return { list, toKey, toId, rows: ordered };
}

export async function meetingIn(meetingId: string): Promise<MeetingIn & { program: string }> {
  const [m, { list }] = await Promise.all([
    db.meeting.findUniqueOrThrow({ where: { id: meetingId }, include: { program: true } }),
    participantsOf(meetingId),
  ]);
  const occurred = fmtKst(m.occurredAt);
  return { title: m.title, occurred_at: occurred, participants: list, program: m.program.name };
}

export async function latestTranscript(meetingId: string) {
  return db.transcriptVersion.findFirst({
    where: { recording: { meetingId } },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    include: { segments: { orderBy: { startMs: "asc" } }, recording: true },
  });
}

export async function segmentsIn(meetingId: string): Promise<SegmentIn[]> {
  const [tv, { toKey }] = await Promise.all([latestTranscript(meetingId), participantsOf(meetingId)]);
  if (!tv) return [];
  return tv.segments.map((s) => ({
    segment_id: s.segKey,
    start_ms: s.startMs,
    end_ms: s.endMs,
    speaker: s.speakerParticipantId ? toKey.get(s.speakerParticipantId) ?? null : null,
    text: s.text,
    uncertain: s.uncertain,
  }));
}

/** 안건별 최신 판단 (status "removed" 제외) */
export async function currentItems(meetingId: string) {
  const items = await db.discussionItem.findMany({
    where: { meetingId },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1, include: { evidence: { include: { segment: true } } } } },
  });
  return items
    .map((it) => ({ item: it, rev: it.revisions[0] }))
    .filter((x) => x.rev && x.rev.status !== "removed")
    .map((x) => ({ ...x, content: parse<ItemContent>(x.rev!.contentJson, emptyContent()) }));
}

export const emptyContent = (): ItemContent => ({ value: null, hold_reason: null, revisit: null, confidence: 0.5, intent: null, idea_changes: [] });

export async function decisionsAndTopics(meetingId: string): Promise<{ decisions: Decision[]; topics: Topic[] }> {
  const cur = await currentItems(meetingId);
  const decisions: Decision[] = [];
  const topics: Topic[] = [];
  for (const { item, rev, content } of cur) {
    topics.push({ item_key: item.key, title: item.title, intent: content.intent, idea_changes: content.idea_changes });
    if (rev!.status === "unknown") continue;
    decisions.push({
      item_key: item.key,
      title: item.title,
      status: rev!.status as ItemStatus,
      value: content.value,
      hold_reason: content.hold_reason,
      revisit: content.revisit,
      evidence: rev!.evidence.map((e) => ({ segment_id: e.segment.segKey })),
      confidence: rev!.locked ? 1 : content.confidence,
    });
  }
  return { decisions, topics };
}

export async function actionsOut(meetingId: string): Promise<ActionOut[]> {
  const [{ toKey }, rows] = await Promise.all([
    participantsOf(meetingId),
    db.actionItem.findMany({ where: { meetingId, active: true }, orderBy: { key: "asc" } }),
  ]);
  return rows.map((a) => ({
    action_key: a.key,
    description: a.description,
    assignee: a.assigneeParticipantId ? toKey.get(a.assigneeParticipantId) ?? null : null,
    due_at: a.dueAt,
    evidence: parse<{ segment_id: string }[]>(a.evidenceJson, []),
  }));
}

export async function lockedState(meetingId: string): Promise<LockedState> {
  const [{ toKey }, cur, actions] = await Promise.all([
    participantsOf(meetingId), currentItems(meetingId),
    db.actionItem.findMany({ where: { meetingId, active: true, locked: true } }),
  ]);
  return {
    items: cur
      .filter((x) => x.rev!.locked && x.rev!.status !== "unknown")
      .map((x) => ({ item_key: x.item.key, title: x.item.title, status: x.rev!.status as ItemStatus, value: x.content.value })),
    actions: actions.map((a) => ({
      action_key: a.key,
      description: a.description,
      assignee: a.assigneeParticipantId ? toKey.get(a.assigneeParticipantId) ?? null : null,
      due_at: a.dueAt,
    })),
  };
}

/** 사람이 답했거나 고정한 target — 검증·질문에서 다시 묻지 않는다 */
export async function humanConfirmed(meetingId: string): Promise<string[]> {
  const [tasks, cur, locked] = await Promise.all([
    db.humanTask.findMany({ where: { run: { meetingId }, status: "answered" }, select: { target: true } }),
    currentItems(meetingId),
    db.actionItem.findMany({ where: { meetingId, active: true, locked: true }, select: { key: true } }),
  ]);
  return [
    ...tasks.map((t) => t.target),
    ...cur.filter((x) => x.rev!.locked).map((x) => `d:${x.item.key}.status`),
    ...locked.flatMap((a) => [`a:${a.key}.due_at`, `a:${a.key}.assignee`]),
  ];
}

export async function templateRules(templateVersionId: string): Promise<TemplateRules> {
  const tv = await db.templateVersion.findUniqueOrThrow({ where: { id: templateVersionId }, include: { template: true } });
  const rules = parse<Partial<TemplateRules>>(tv.rulesJson, {});
  return { name: tv.template.name, version: tv.version, fields: rules.fields ?? [] };
}

export async function latestDocumentVersion(meetingId: string) {
  return db.documentVersion.findFirst({
    where: { document: { meetingId } },
    orderBy: { version: "desc" },
    include: { templateVersion: { include: { template: true } }, reviewRequests: { orderBy: { createdAt: "desc" }, include: { actions: { orderBy: { createdAt: "asc" } } } } },
  });
}

/** 2026-10-21 10:00 (한국 시간) */
export const fmtKst = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);
