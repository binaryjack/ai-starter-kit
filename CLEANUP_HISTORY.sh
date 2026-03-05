#!/bin/bash
# CAUTION: This script removes all history of internal-strategy-docs/ from git
# WARNING: This is DESTRUCTIVE and will rewrite all commit history
# All team members must re-clone or reset their local repos after this

echo "⚠️  DESTRUCTIVE OPERATION: Removing internal-strategy-docs/ from git history"
echo "This will rewrite all commit history and requires a force push"
echo ""
echo "Steps to complete this cleanup:"
echo ""

echo "1️⃣  Create a backup (just in case)"
echo "   git clone . ../ai-starter-kit-backup"
echo ""

echo "2️⃣  Remove from current tracking"
echo "   git rm --cached -r internal-strategy-docs/"
echo ""

echo "3️⃣  Rewrite git history (remove ALL mentions of these files)"
echo "   git filter-branch --tree-filter 'rm -rf internal-strategy-docs/' --prune-empty HEAD"
echo ""

echo "4️⃣  Force push to remote (CAUTION: will rewrite remote history)"
echo "   git push origin --force-with-lease HEAD:main"
echo ""

echo "5️⃣  Clean up git references"
echo "   git gc --aggressive --prune=now"
echo "   git reflog expire --expire=now --all"
echo "   git gc --aggressive --prune=now"
echo ""

echo "6️⃣  Notify team members to re-clone"
echo "   After force push, all team members should:"
echo "   - Backup their local repos (if any local changes)"
echo "   - Delete and re-clone: rm -rf . && git clone <url>"
echo ""

echo "To execute these commands, copy and run them one by one."
