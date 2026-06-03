-- CreateIndex
CREATE INDEX "Activity_userId_idx" ON "Activity"("userId");

-- CreateIndex
CREATE INDEX "Challenge_ownerId_idx" ON "Challenge"("ownerId");

-- CreateIndex
CREATE INDEX "Challenge_ownerId_kind_status_idx" ON "Challenge"("ownerId", "kind", "status");

-- CreateIndex
CREATE INDEX "Follow_followeeId_idx" ON "Follow"("followeeId");

-- CreateIndex
CREATE INDEX "Identity_userId_idx" ON "Identity"("userId");

-- CreateIndex
CREATE INDEX "Reaction_activityId_idx" ON "Reaction"("activityId");

-- CreateIndex
CREATE INDEX "Recap_challengeId_idx" ON "Recap"("challengeId");
