-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "randomTeams" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "RoomPlayer" ADD COLUMN     "team" INTEGER;
