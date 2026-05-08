-- Manual chunk ranked keyword search v6.3.
-- Adds a non-AI RPC for better phrase/all-term/full-text/fallback relevance.

create or replace function public.search_manual_chunks(
  search_query text,
  aircraft_filter text default null,
  manual_type_filter text default null,
  result_limit integer default 20
)
returns table (
  id bigint,
  manual_document_id bigint,
  manual_code text,
  title text,
  aircraft text,
  manual_type text,
  page_number integer,
  chunk_index integer,
  chunk_text text,
  storage_path text,
  rank_score double precision
)
language sql
stable
as $$
  with input as (
    select
      regexp_replace(trim(coalesce(search_query, '')), '\s+', ' ', 'g') as q,
      lower(regexp_replace(trim(coalesce(search_query, '')), '\s+', ' ', 'g')) as q_lower,
      nullif(trim(coalesce(aircraft_filter, '')), '') as aircraft_filter,
      nullif(trim(coalesce(manual_type_filter, '')), '') as manual_type_filter,
      greatest(1, least(coalesce(result_limit, 20), 50)) as safe_limit
  ),
  terms as (
    select
      input.*,
      array(
        select distinct word
        from regexp_split_to_table(input.q_lower, '\s+') as word
        where length(word) > 1
      ) as words,
      plainto_tsquery('simple', input.q) as ts_query
    from input
    where input.q <> ''
  ),
  candidates as (
    select
      manual_chunks.*,
      terms.q_lower,
      terms.words,
      terms.ts_query,
      terms.safe_limit,
      lower(manual_chunks.chunk_text) as chunk_text_lower,
      lower(coalesce(manual_chunks.title, '')) as title_lower,
      lower(coalesce(manual_chunks.manual_code, '')) as manual_code_lower,
      to_tsvector('simple', manual_chunks.chunk_text) as chunk_tsv
    from public.manual_chunks
    cross join terms
    where manual_chunks.status = 'active'
      and (terms.aircraft_filter is null or manual_chunks.aircraft = terms.aircraft_filter)
      and (terms.manual_type_filter is null or manual_chunks.manual_type = terms.manual_type_filter)
      and (
        lower(manual_chunks.chunk_text) like '%' || terms.q_lower || '%'
        or lower(coalesce(manual_chunks.title, '')) like '%' || terms.q_lower || '%'
        or lower(coalesce(manual_chunks.manual_code, '')) like '%' || terms.q_lower || '%'
        or to_tsvector('simple', manual_chunks.chunk_text) @@ terms.ts_query
        or exists (
          select 1
          from unnest(terms.words) as word
          where lower(manual_chunks.chunk_text) like '%' || word || '%'
             or lower(coalesce(manual_chunks.title, '')) like '%' || word || '%'
             or lower(coalesce(manual_chunks.manual_code, '')) like '%' || word || '%'
        )
      )
  ),
  scored as (
    select
      candidates.*,
      (
        case
          when candidates.chunk_text_lower like '%' || candidates.q_lower || '%' then 1000
          else 0
        end
        + case
          when candidates.title_lower like '%' || candidates.q_lower || '%'
            or candidates.manual_code_lower like '%' || candidates.q_lower || '%' then 800
          else 0
        end
        + case
          when cardinality(candidates.words) > 0
            and not exists (
              select 1
              from unnest(candidates.words) as word
              where candidates.chunk_text_lower not like '%' || word || '%'
            ) then 600
          else 0
        end
        + case
          when candidates.chunk_tsv @@ candidates.ts_query
            then 300 + (ts_rank_cd(candidates.chunk_tsv, candidates.ts_query) * 200)
          else 0
        end
        + (
          select count(*) * 45
          from unnest(candidates.words) as word
          where candidates.chunk_text_lower like '%' || word || '%'
             or candidates.title_lower like '%' || word || '%'
             or candidates.manual_code_lower like '%' || word || '%'
        )
        - case
          when candidates.chunk_text_lower ~ '(table of contents|abbreviations|abbreviation list|revision log|revision record|title page|intentionally blank|chapter index)' then 220
          else 0
        end
        - case
          when coalesce(candidates.page_number, 999999) <= 10
            and candidates.chunk_text_lower ~ '(preface|copyright|proprietary|revision)' then 120
          else 0
        end
        - case
          when length(candidates.chunk_text) < 120 then 80
          else 0
        end
      )::double precision as computed_rank_score
    from candidates
  )
  select
    scored.id,
    scored.manual_document_id,
    scored.manual_code,
    scored.title,
    scored.aircraft,
    scored.manual_type,
    scored.page_number,
    scored.chunk_index,
    scored.chunk_text,
    scored.storage_path,
    scored.computed_rank_score as rank_score
  from scored
  order by
    scored.computed_rank_score desc,
    scored.manual_code asc nulls last,
    scored.page_number asc nulls last,
    scored.chunk_index asc nulls last
  limit (select safe_limit from terms);
$$;

grant execute on function public.search_manual_chunks(text, text, text, integer) to anon, authenticated;
