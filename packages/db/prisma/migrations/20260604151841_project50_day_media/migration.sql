-- CreateTable
CREATE TABLE "Project50DayMedia" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project50DayMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project50DayMedia_challengeId_dayKey_idx" ON "Project50DayMedia"("challengeId", "dayKey");

-- AddForeignKey
ALTER TABLE "Project50DayMedia" ADD CONSTRAINT "Project50DayMedia_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
