-- History-only reconciliation for legacy migration versions whose schema changes
-- are already present, superseded by later migrations, or restored in dedicated
-- current-app compatibility migrations. This is idempotent on a clean replay:
-- when an older migration ran normally, its version is already present and the
-- matching history row is left untouched.
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES
('20260804172806', ARRAY[]::text[], '19b2dcdc-f645-4316-ae4c-b72ce71ab371'),
('20260804172840', ARRAY[]::text[], '15f0ce97-d3da-4c7e-9d8d-95cce9585746'),
('20260804172922', ARRAY[]::text[], 'a0af4f8e-46ed-425b-9725-74ac7e11e4ce'),
('20260804180511', ARRAY[]::text[], '0ed70259-dff0-4d5a-9ed7-ad451c2430fe'),
('20260805073101', ARRAY[]::text[], 'a843f54c-277a-468f-b978-a3a631055d61'),
('20260805073838', ARRAY[]::text[], '89a27e6c-cf60-4235-9861-da32f8521906'),
('20260806170856', ARRAY[]::text[], 'd543e756-2a26-4a15-ae4e-d3296ae2abe6'),
('20260806170959', ARRAY[]::text[], 'c4c4e3fe-58de-4766-afb0-a382c0b297ee'),
('20260807032219', ARRAY[]::text[], '3c128980-55b6-4abf-963b-32fe8bcecd1a'),
('20260807032909', ARRAY[]::text[], '0672f21d-97c6-4580-84c8-d36613104e40'),
('20260807070955', ARRAY[]::text[], 'cba7f147-6341-44a2-8f5c-e516ae98b96d'),
('20260808053101', ARRAY[]::text[], '12522092-923b-4dae-9765-da3ca73e3c8d'),
('20260809071901', ARRAY[]::text[], '38b72a7d-f199-448e-a837-b794789f7f2d'),
('20260809073217', ARRAY[]::text[], 'b096f2de-ab20-4d51-9a2d-d48d472794cf'),
('20260903160421', ARRAY[]::text[], '6c7f2ca8-4114-439b-81ab-e01d0fae8b76'),
('20260903165100', ARRAY[]::text[], '0bbf9f9c-aa5d-4669-bbbf-8586b7c9a1a2'),
('20260904044802', ARRAY[]::text[], '80c937cf-d092-42d0-a2c6-32efabc12f83'),
('20260906043242', ARRAY[]::text[], 'fbdbc116-b58f-4c5d-ae43-09092c564f1c'),
('20260906043308', ARRAY[]::text[], '4fc7c98f-4f30-4c9f-b268-37946db0dded'),
('20260908064400', ARRAY[]::text[], '0225136b-71ea-4005-9ac0-41439bdbb022'),
('20260925120000', ARRAY[]::text[], 'allow_admin_quiz_grade_visibility'),
('20261003120000', ARRAY[]::text[], 'quiz_attempt_integrity'),
('20261003180000', ARRAY[]::text[], 'onyx_business_features'),
('20261003180100', ARRAY[]::text[], 'onyx_feature_enforcement'),
('20261003180200', ARRAY[]::text[], 'harden_reports_and_notifications'),
('20261003180300', ARRAY[]::text[], 'storage_quota_enforcement'),
('20261003180400', ARRAY[]::text[], 'admin_entitlements_and_notification_repair'),
('20261003180500', ARRAY[]::text[], 'align_onyx_pricing'),
('20261003230000', ARRAY[]::text[], 'assignment_attachments_storage'),
('20261004000000', ARRAY[]::text[], 'retire_plus_plan')
ON CONFLICT (version) DO NOTHING;
