-- Show settings (target show length, later the timeline) are optional: many
-- projects only collect and review submissions. Managers turn them on in Basics.
alter table projects add column show_enabled boolean not null default false;

-- Projects that already set a show length keep seeing the Show section.
update projects set show_enabled = true where target_show_seconds is not null;
