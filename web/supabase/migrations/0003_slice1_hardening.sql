-- Slice 1 hardening (review follow-up):
-- 1. Cross-story integrity triggers per PRD §11.11 ("Mọi FK giữa
--    Section/Chapter/Revision/Progress phải dùng constraint hoặc trigger
--    để bảo đảm các row thuộc cùng một Story; không chỉ kiểm tra ở UI").
--    RLS alone allows an owner to point rows across their own stories,
--    which would corrupt tree traversal and progress resume.
-- 2. upsert_reading_progress now also maintains stories.last_read_at —
--    previously nothing wrote it, so Library sorting and the
--    "Đọc tiếp"/"Bắt đầu đọc" label never activated (FR-02).

-- 1a. Sections: parent must belong to the same story (extends the existing
--     depth check; CREATE OR REPLACE keeps the trigger binding intact).
create or replace function public.validate_section_depth()
returns trigger
language plpgsql
as $$
declare
  parent_row record;
begin
  if new.parent_section_id is not null then
    select parent_section_id, story_id into parent_row
    from public.sections
    where id = new.parent_section_id;

    if parent_row is null then
      raise exception 'parent_section_id does not exist';
    end if;

    if parent_row.story_id <> new.story_id then
      raise exception 'parent section belongs to a different story';
    end if;

    if parent_row.parent_section_id is not null then
      raise exception 'sections may not exceed 2 levels';
    end if;
  end if;
  return new;
end;
$$;

-- 1b. Chapters: section (when set) must belong to the same story.
create or replace function public.validate_chapter_section()
returns trigger
language plpgsql
as $$
begin
  if new.section_id is not null then
    if not exists (
      select 1 from public.sections s
      where s.id = new.section_id and s.story_id = new.story_id
    ) then
      raise exception 'section belongs to a different story';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_validate_section on public.chapters;
create trigger chapters_validate_section
  before insert or update on public.chapters
  for each row
  execute function public.validate_chapter_section();

-- 1c. reading_progress: chapter must belong to story_id, and the revision
--     must belong to that chapter.
create or replace function public.validate_reading_progress_refs()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.chapters c
    where c.id = new.chapter_id and c.story_id = new.story_id
  ) then
    raise exception 'chapter belongs to a different story';
  end if;

  if not exists (
    select 1 from public.chapter_revisions r
    where r.id = new.chapter_revision_id and r.chapter_id = new.chapter_id
  ) then
    raise exception 'revision belongs to a different chapter';
  end if;
  return new;
end;
$$;

drop trigger if exists reading_progress_validate_refs on public.reading_progress;
create trigger reading_progress_validate_refs
  before insert or update on public.reading_progress
  for each row
  execute function public.validate_reading_progress_refs();

-- 1d. chapter_read_states: chapter must belong to story_id.
create or replace function public.validate_chapter_read_state_refs()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.chapters c
    where c.id = new.chapter_id and c.story_id = new.story_id
  ) then
    raise exception 'chapter belongs to a different story';
  end if;
  return new;
end;
$$;

drop trigger if exists chapter_read_states_validate_refs on public.chapter_read_states;
create trigger chapter_read_states_validate_refs
  before insert or update on public.chapter_read_states
  for each row
  execute function public.validate_chapter_read_state_refs();

-- 2. Recreate upsert_reading_progress: on an accepted (non-stale) write,
--    also advance stories.last_read_at. greatest() keeps it monotonic even
--    if a slightly older-but-accepted write lands after a newer one.
create or replace function public.upsert_reading_progress(
  p_story_id uuid,
  p_chapter_id uuid,
  p_chapter_revision_id uuid,
  p_paragraph_anchor_id text,
  p_paragraph_fingerprint text,
  p_paragraph_ordinal integer,
  p_paragraph_offset_ratio numeric,
  p_chapter_progress_pct numeric,
  p_write_id uuid,
  p_observed_at timestamptz
)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.reading_progress (
    user_id, story_id, chapter_id, chapter_revision_id,
    paragraph_anchor_id, paragraph_fingerprint, paragraph_ordinal,
    paragraph_offset_ratio, chapter_progress_pct, last_write_id,
    observed_at, updated_at
  ) values (
    auth.uid(), p_story_id, p_chapter_id, p_chapter_revision_id,
    p_paragraph_anchor_id, p_paragraph_fingerprint, p_paragraph_ordinal,
    p_paragraph_offset_ratio, p_chapter_progress_pct, p_write_id,
    p_observed_at, now()
  )
  on conflict (user_id, story_id) do update set
    chapter_id = excluded.chapter_id,
    chapter_revision_id = excluded.chapter_revision_id,
    paragraph_anchor_id = excluded.paragraph_anchor_id,
    paragraph_fingerprint = excluded.paragraph_fingerprint,
    paragraph_ordinal = excluded.paragraph_ordinal,
    paragraph_offset_ratio = excluded.paragraph_offset_ratio,
    chapter_progress_pct = excluded.chapter_progress_pct,
    last_write_id = excluded.last_write_id,
    observed_at = excluded.observed_at,
    updated_at = now()
  where excluded.observed_at > public.reading_progress.observed_at
     or (excluded.observed_at = public.reading_progress.observed_at
         and excluded.last_write_id = public.reading_progress.last_write_id);

  -- FOUND is true only when the insert happened or the guarded update
  -- actually applied — stale/duplicate writes never touch last_read_at.
  if found then
    update public.stories
    set last_read_at = greatest(coalesce(last_read_at, 'epoch'::timestamptz), p_observed_at)
    where id = p_story_id and owner_id = auth.uid();
  end if;
end;
$$;
