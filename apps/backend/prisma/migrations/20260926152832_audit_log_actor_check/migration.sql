-- Un utilisateur est identifié ; « system » et « cli » n'ont pas d'actor_id (14 §11).
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_check"
  CHECK (("actor_kind" = 'user') = ("actor_id" IS NOT NULL));
