-- CreateTable
CREATE TABLE "ProjectDeletion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "deletedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskCount" INTEGER NOT NULL,
    "dependencyCount" INTEGER NOT NULL,
    "resourceCount" INTEGER NOT NULL,

    CONSTRAINT "ProjectDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDeletion_deletedById_idx" ON "ProjectDeletion"("deletedById");

-- CreateIndex
CREATE INDEX "ProjectDeletion_deletedAt_idx" ON "ProjectDeletion"("deletedAt");

-- AddForeignKey
ALTER TABLE "ProjectDeletion" ADD CONSTRAINT "ProjectDeletion_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
