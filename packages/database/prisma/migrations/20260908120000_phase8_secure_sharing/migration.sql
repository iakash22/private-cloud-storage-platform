-- CreateEnum
CREATE TYPE "ShareVisibility" AS ENUM ('PRIVATE', 'TEAM', 'ORGANIZATION', 'PUBLIC_LINK');

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "TeamMember_organizationId_idx" ON "TeamMember"("organizationId");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN "visibility" "ShareVisibility" NOT NULL DEFAULT 'PUBLIC_LINK';
ALTER TABLE "ShareLink" ADD COLUMN "teamId" TEXT;
ALTER TABLE "ShareLink" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "ShareLink" ADD COLUMN "allowView" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShareLink" ADD COLUMN "maxDownloads" INTEGER;
ALTER TABLE "ShareLink" ADD COLUMN "tokenPrefix" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ShareLink" ALTER COLUMN "tokenPrefix" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "ShareLink_teamId_idx" ON "ShareLink"("teamId");

-- CreateIndex
CREATE INDEX "ShareLink_organizationId_visibility_idx" ON "ShareLink"("organizationId", "visibility");

-- CreateIndex
CREATE INDEX "ShareLink_tokenPrefix_idx" ON "ShareLink"("tokenPrefix");

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
