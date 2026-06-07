-- batch-05 — genererad 2026-06-07T07:23:49.443Z
begin;
update recipes set ingredients = ARRAY(SELECT jsonb_array_elements_text($q$["sojasås med låg salthalt (3 msk, uppdelat)","risvinäger (2 msk)","jordnötssmör (2 msk)","röd currypasta (1 msk)","strösocker (1 tsk)","salt (0,5 tsk)","vegetabilisk olja eller olivolja (3 msk)","creminisvamp, tunt skivad (225 g)","shiitakesvamp, grova stjälkar borttagna (170 g)","salladslök, trimmad och grovhackad (1 knippe)","vitlöksklyfta, pressad (2)","färsk ingefära, finhackad (1 msk)","ägg, vispade (3 stora)","kokt vitt ris (6 dl)","hackade jordnötter och rostad sesamolja till garnering (valfritt)"]$q$::jsonb))::text[] where id = 124; -- Svampstekt ris med röd curry och jordnötssås
commit;
