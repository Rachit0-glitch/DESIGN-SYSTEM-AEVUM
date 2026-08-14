begin;

create or replace function public.aevum_bootstrap_project(
  p_workspace_id text,
  p_workspace_name text,
  p_actor_subject text,
  p_project_id text,
  p_project_name text,
  p_document_id text,
  p_document jsonb,
  p_created_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor_subject, 0));

  if exists (
    select 1 from public.workspace_memberships
    where actor_subject = p_actor_subject and status = 'ACTIVE'
  ) then
    raise exception 'AEVUM_BOOTSTRAP_ALREADY_EXISTS';
  end if;

  if coalesce((p_document ->> 'documentVersion')::integer, 0) <> 1
    or p_document -> 'metadata' ->> 'id' <> p_document_id
    or p_document -> 'metadata' ->> 'projectId' <> p_project_id then
    raise exception 'AEVUM_INVALID_BOOTSTRAP_DOCUMENT';
  end if;

  insert into public.workspaces (id, name, created_at, updated_at)
  values (p_workspace_id, p_workspace_name, p_created_at, p_created_at);

  insert into public.workspace_memberships (
    workspace_id, actor_subject, status, role, permissions, project_ids, created_at, updated_at
  ) values (
    p_workspace_id, p_actor_subject, 'ACTIVE', 'OWNER', '{}', array[p_project_id], p_created_at, p_created_at
  );

  insert into public.projects (
    id, workspace_id, name, status, current_document_id, current_document_version, created_at, updated_at
  ) values (
    p_project_id, p_workspace_id, p_project_name, 'ACTIVE', p_document_id, 1, p_created_at, p_created_at
  );

  insert into public.documents (
    id, workspace_id, project_id, current_version, content, created_at, updated_at
  ) values (
    p_document_id, p_workspace_id, p_project_id, 1, p_document, p_created_at, p_created_at
  );

  insert into public.document_versions (
    workspace_id, project_id, document_id, version, content, actor_id, created_at
  ) values (
    p_workspace_id, p_project_id, p_document_id, 1, p_document, p_actor_subject, p_created_at
  );
end;
$$;

revoke all on function public.aevum_bootstrap_project(text, text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.aevum_bootstrap_project(text, text, text, text, text, text, jsonb, timestamptz)
  to service_role;

create index if not exists projects_workspace_status_idx
  on public.projects(workspace_id, status, updated_at desc);
create index if not exists documents_project_version_idx
  on public.documents(workspace_id, project_id, current_version desc);

insert into public.aevum_schema_versions(version)
values ('202608140001')
on conflict do nothing;

commit;
