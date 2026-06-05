-- CreateIndex
CREATE INDEX "Challenge_kind_visibility_status_startDate_idx" ON "Challenge"("kind", "visibility", "status", "startDate");
