-- CreateEnum
CREATE TYPE "ChallengeKind" AS ENUM ('STANDARD', 'PROJECT50');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('ACTIVE', 'FAILED', 'COMPLETED');

-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN     "kind" "ChallengeKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "RuleCheck" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuleCheck_challengeId_dayKey_idx" ON "RuleCheck"("challengeId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "RuleCheck_challengeId_dayKey_ruleId_key" ON "RuleCheck"("challengeId", "dayKey", "ruleId");

-- AddForeignKey
ALTER TABLE "RuleCheck" ADD CONSTRAINT "RuleCheck_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
