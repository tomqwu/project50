-- CreateEnum
CREATE TYPE "RecapKind" AS ENUM ('DAY', 'WEEK', 'FIFTY');

-- CreateTable
CREATE TABLE "Recap" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "kind" "RecapKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recap_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Recap" ADD CONSTRAINT "Recap_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
