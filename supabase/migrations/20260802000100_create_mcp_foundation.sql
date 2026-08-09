begin;

create table if not exists public.aevum_schema_versions (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id text primary key check (id ~ '^workspace_[0-9a-fA-F-]{36}$'),
  name text not null check (char_length(name) between 1 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  actor_subject text not null,
  status text not null check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  role text not null check (role in ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'AGENT', 'SERVICE')),
  permissions text[] not null default '{}',
  project_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, actor_subject)
);

create index if not exists workspace_memberships_actor_idx
  on public.workspace_memberships(actor_subject, status);

create table if not exists public.projects (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  current_document_id text not null,
  current_document_version integer not null check (current_document_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index if not exists projects_workspace_idx on public.projects(workspace_id, updated_at desc);

create table if not exists public.documents (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  current_version integer not null check (current_version > 0),
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, project_id),
  unique (workspace_id, project_id, id)
);

create table if not exists public.document_versions (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  document_id text not null references public.documents(id) on delete cascade,
  version integer not null check (version > 0),
  content jsonb not null,
  actor_id text not null,
  transaction_id text,
  created_at timestamptz not null default now(),
  primary key (document_id, version)
);

create index if not exists document_versions_scope_idx
  on public.document_versions(workspace_id, project_id, document_id, version desc);

create table if not exists public.mcp_audit_logs (
  id text primary key,
  request_id text not null,
  correlation_id text not null,
  actor_id text not null,
  workspace_id text,
  project_id text,
  document_id text,
  tool text not null,
  tool_version text not null,
  input_hash text not null,
  dry_run boolean not null,
  base_version integer,
  result_version integer,
  transaction_id text,
  command_ids text[] not null default '{}',
  status text not null check (status in ('SUCCEEDED', 'FAILED', 'DENIED')),
  error_code text,
  duration_ms double precision not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists mcp_audit_scope_idx
  on public.mcp_audit_logs(workspace_id, project_id, created_at desc);
create index if not exists mcp_audit_actor_idx on public.mcp_audit_logs(actor_id, created_at desc);

create table if not exists public.mcp_idempotency_records (
  actor_id text not null,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null,
  tool text not null,
  input_hash text not null,
  status text not null check (status in ('COMPLETED', 'FAILED')),
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, workspace_id, idempotency_key)
);

create index if not exists mcp_idempotency_expiry_idx on public.mcp_idempotency_records(expires_at);

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.mcp_audit_logs enable row level security;
alter table public.mcp_idempotency_records enable row level security;
alter table public.aevum_schema_versions enable row level security;

revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_memberships from anon, authenticated;
revoke all on public.projects from anon, authenticated;
revoke all on public.documents from anon, authenticated;
revoke all on public.document_versions from anon, authenticated;
revoke all on public.mcp_audit_logs from anon, authenticated;
revoke all on public.mcp_idempotency_records from anon, authenticated;
revoke all on public.aevum_schema_versions from anon, authenticated;

grant select, insert, update, delete on public.workspaces to service_role;
grant select, insert, update, delete on public.workspace_memberships to service_role;
grant select, insert, update, delete on public.projects to service_role;
grant select, insert, update, delete on public.documents to service_role;
grant select, insert on public.document_versions to service_role;
grant select, insert on public.mcp_audit_logs to service_role;
grant select, insert, delete on public.mcp_idempotency_records to service_role;
grant select, insert on public.aevum_schema_versions to service_role;

create or replace function public.aevum_mcp_commit_document(
  p_workspace_id text,
  p_project_id text,
  p_document_id text,
  p_expected_version integer,
  p_document jsonb,
  p_actor_id text,
  p_transaction_id text,
  p_audit jsonb,
  p_idempotency jsonb default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_next integer;
begin
  select current_version into v_current
  from public.documents
  where workspace_id = p_workspace_id and project_id = p_project_id and id = p_document_id
  for update;

  if v_current is null then
    raise exception 'AEVUM_DOCUMENT_NOT_FOUND';
  end if;
  if v_current <> p_expected_version then
    raise exception 'AEVUM_VERSION_CONFLICT:%', v_current;
  end if;

  v_next := p_expected_version + 1;
  if coalesce((p_document ->> 'documentVersion')::integer, 0) <> v_next then
    raise exception 'AEVUM_INVALID_NEXT_VERSION';
  end if;

  if p_idempotency is not null and exists (
    select 1 from public.mcp_idempotency_records
    where actor_id = p_idempotency ->> 'actor_id'
      and workspace_id = p_workspace_id
      and idempotency_key = p_idempotency ->> 'idempotency_key'
  ) then
    raise exception 'AEVUM_IDEMPOTENCY_CONFLICT';
  end if;

  update public.documents
  set current_version = v_next, content = p_document, updated_at = now()
  where workspace_id = p_workspace_id and project_id = p_project_id and id = p_document_id;

  update public.projects
  set current_document_version = v_next, updated_at = now()
  where workspace_id = p_workspace_id and id = p_project_id;

  insert into public.document_versions (
    workspace_id, project_id, document_id, version, content, actor_id, transaction_id, created_at
  ) values (
    p_workspace_id, p_project_id, p_document_id, v_next, p_document, p_actor_id, p_transaction_id, now()
  );

  insert into public.mcp_audit_logs (
    id, request_id, correlation_id, actor_id, workspace_id, project_id, document_id, tool, tool_version,
    input_hash, dry_run, base_version, result_version, transaction_id, command_ids, status, error_code,
    duration_ms, created_at
  ) values (
    p_audit ->> 'id', p_audit ->> 'request_id', p_audit ->> 'correlation_id', p_audit ->> 'actor_id',
    p_workspace_id, p_project_id, p_document_id, p_audit ->> 'tool', p_audit ->> 'tool_version',
    p_audit ->> 'input_hash', (p_audit ->> 'dry_run')::boolean,
    nullif(p_audit ->> 'base_version', '')::integer, nullif(p_audit ->> 'result_version', '')::integer,
    p_transaction_id, coalesce(array(select jsonb_array_elements_text(p_audit -> 'command_ids')), '{}'),
    p_audit ->> 'status', nullif(p_audit ->> 'error_code', ''),
    (p_audit ->> 'duration_ms')::double precision, (p_audit ->> 'created_at')::timestamptz
  );

  if p_idempotency is not null then
    insert into public.mcp_idempotency_records (
      actor_id, workspace_id, idempotency_key, tool, input_hash, status, result, expires_at, created_at
    ) values (
      p_idempotency ->> 'actor_id', p_workspace_id, p_idempotency ->> 'idempotency_key',
      p_idempotency ->> 'tool', p_idempotency ->> 'input_hash', p_idempotency ->> 'status',
      p_idempotency -> 'result', (p_idempotency ->> 'expires_at')::timestamptz,
      (p_idempotency ->> 'created_at')::timestamptz
    );
  end if;

  return v_next;
end;
$$;

revoke all on function public.aevum_mcp_commit_document(text, text, text, integer, jsonb, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.aevum_mcp_commit_document(text, text, text, integer, jsonb, text, text, jsonb, jsonb)
  to service_role;

insert into public.aevum_schema_versions(version) values ('202608020001') on conflict do nothing;

commit;
