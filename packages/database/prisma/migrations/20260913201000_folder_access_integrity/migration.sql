ALTER TABLE "FolderAccessRule"
ADD CONSTRAINT "FolderAccessRule_exactly_one_subject_check"
CHECK (("userId" IS NOT NULL) <> ("teamId" IS NOT NULL));
