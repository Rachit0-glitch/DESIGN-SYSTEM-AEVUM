-- Originals and derivatives share one private content-addressed bucket.
insert into storage.buckets (id, name, public)
values ('aevum-assets', 'aevum-assets', false)
on conflict (id) do nothing;
