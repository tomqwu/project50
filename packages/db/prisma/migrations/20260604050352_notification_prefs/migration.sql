-- AlterTable
ALTER TABLE "User" ADD COLUMN     "quietHoursEnd" INTEGER,
ADD COLUMN     "quietHoursStart" INTEGER,
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;
