-- CreateEnum
CREATE TYPE "backup_status" AS ENUM ('running', 'ok', 'failed');

-- CreateEnum
CREATE TYPE "layout_kind" AS ENUM ('header', 'footer');

-- CreateEnum
CREATE TYPE "topic_sort" AS ENUM ('activity', 'created');

-- CreateEnum
CREATE TYPE "revision_action" AS ENUM ('edit', 'delete', 'hide', 'unhide');

-- CreateEnum
CREATE TYPE "source_type" AS ENUM ('upload', 'gsheet', 'onedrive');

-- CreateEnum
CREATE TYPE "source_status" AS ENUM ('ok', 'unavailable', 'auth_expired');

-- CreateEnum
CREATE TYPE "cell_type" AS ENUM ('empty', 'text', 'number', 'bool', 'date', 'error');

-- CreateEnum
CREATE TYPE "form_mode" AS ENUM ('modification', 'ligne', 'ajout');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('pending', 'validated', 'rejected', 'modified', 'invalidated');

-- CreateEnum
CREATE TYPE "template_type" AS ENUM ('form', 'page', 'topic');

-- CreateEnum
CREATE TYPE "actor_kind" AS ENUM ('user', 'system', 'cli');
