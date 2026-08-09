begin;

-- Audit rows remain client-immutable. The trusted service role needs delete only
-- for configured retention and verified production-smoke cleanup.
grant delete on public.mcp_audit_logs to service_role;

insert into public.aevum_schema_versions(version)
values ('202608090001')
on conflict do nothing;

commit;
