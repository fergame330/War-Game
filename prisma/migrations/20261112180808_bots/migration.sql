-- AlterTable
ALTER TABLE "RoomPlayer" ADD COLUMN     "botName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;
