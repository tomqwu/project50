-- CreateTable
CREATE TABLE "DayJournal" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "wins" TEXT NOT NULL DEFAULT '',
    "lessons" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DayJournal_challengeId_idx" ON "DayJournal"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "DayJournal_challengeId_dayKey_key" ON "DayJournal"("challengeId", "dayKey");

-- AddForeignKey
ALTER TABLE "DayJournal" ADD CONSTRAINT "DayJournal_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
