-- CreateTable
CREATE TABLE "FacebookCommentReply" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "postId" TEXT,
    "pageId" TEXT,
    "fromId" TEXT,
    "fromName" TEXT,
    "message" TEXT,
    "commentedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detail" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "recipientId" TEXT,
    "privateMessageId" TEXT,
    "publicReplyId" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookCommentReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacebookCommentReply_commentId_key" ON "FacebookCommentReply"("commentId");

-- CreateIndex
CREATE INDEX "FacebookCommentReply_status_updatedAt_idx" ON "FacebookCommentReply"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "FacebookCommentReply_fromId_status_idx" ON "FacebookCommentReply"("fromId", "status");

-- CreateIndex
CREATE INDEX "FacebookCommentReply_createdAt_idx" ON "FacebookCommentReply"("createdAt");
