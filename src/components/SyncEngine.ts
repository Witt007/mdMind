import { Editor } from 'obsidian';
import { IPureNode } from 'markmap-common';
import { MarkdownEdit, MarkmapSettings, NodeMappingInfo, SyncDirection, SyncState } from '../types';
import { NodeMappingManager } from './NodeMapping';
import {
    changeHeadingLevel,
    changeListIndent,
    extractListItemWithChildren,
    getHeadingLevel,
    getListIndent,
    isListItem,
    moveListItem,
    parseMarkdownStructure,
} from '../utils/markdown';

export interface SyncEngineOptions {
    onSyncStart?: (direction: SyncDirection) => void;
    onSyncComplete?: (direction: SyncDirection) => void;
    onSyncError?: (error: Error) => void;
    onNodeChange?: (nodeId: string, changes: Partial<NodeMappingInfo>) => void;
}

export class SyncEngine {
    private settings: MarkmapSettings;
    private options: SyncEngineOptions;
    private mappingManager: NodeMappingManager;
    private syncState: SyncState = {
        isSyncing: false,
        lastSyncTime: 0,
        source: null,
    };
    private pendingEdits: MarkdownEdit[] = [];

    constructor(settings: MarkmapSettings, options: SyncEngineOptions = {}) {
        this.settings = settings;
        this.options = options;
        this.mappingManager = new NodeMappingManager();
    }

    updateSettings(settings: MarkmapSettings): void {
        this.settings = settings;
    }

    markdownToMarkmap(editor: Editor, currentRoot: IPureNode | null): IPureNode | null {
        if (this.syncState.isSyncing && this.syncState.source === 'markmap') {
            return currentRoot;
        }

        this.syncState = {
            isSyncing: true,
            lastSyncTime: Date.now(),
            source: 'editor',
        };

        try {
            if (this.options.onSyncStart) {
                this.options.onSyncStart('markdown-to-markmap');
            }

            const content = editor.getValue();

            this.mappingManager.updateContent(content);

            if (this.options.onSyncComplete) {
                this.options.onSyncComplete('markdown-to-markmap');
            }

            return null;
        } catch (error) {
            if (this.options.onSyncError) {
                this.options.onSyncError(error as Error);
            }
            return currentRoot;
        } finally {
            this.syncState.isSyncing = false;
            this.syncState.source = null;
        }
    }
    // the entrance of writing data from markmap to markdown
    async markmapToMarkdown(
        editor: Editor,
        node: IPureNode,
        operation: 'edit' | 'move' | 'delete' | 'indent' | 'outdent' | 'insert-sibling' | 'insert-child',
        params?: unknown
    ): Promise<{ success: boolean; line?: number }> {
        if (this.syncState.isSyncing && this.syncState.source === 'editor') {
            return { success: false };
        }

        this.syncState = {
            isSyncing: true,
            lastSyncTime: Date.now(),
            source: 'markmap',
        };

        try {
            if (this.options.onSyncStart) {
                this.options.onSyncStart('markmap-to-markdown');
            }

            const edits = this.generateEdits(editor, node, operation, params);

            if (edits.length === 0) {
                return { success: false };
            }

            await this.applyEdits(editor, edits);


            if (this.options.onSyncComplete) {
                this.options.onSyncComplete('markmap-to-markdown');
            }

            let line: number | undefined;
            if (operation === 'insert-sibling' || operation === 'insert-child') {
                line = edits[0].fromLine;
                if (edits[0].newText.startsWith('\n')) {
                    line += 1;
                }
            }

            return { success: true, line };
        } catch (error) {
            if (this.options.onSyncError) {
                this.options.onSyncError(error as Error);
            }
            return { success: false };
        } finally {
            this.syncState.isSyncing = false;
            this.syncState.source = null;
        }
    }

    isSyncing(): boolean {
        return this.syncState.isSyncing;
    }

    getSyncSource(): 'editor' | 'markmap' | null {
        return this.syncState.source;
    }

    getMappingManager(): NodeMappingManager {
        return this.mappingManager;
    }

    updateMappings(root: IPureNode, markdown: string): void {
        this.mappingManager.buildMappings(root, markdown);
    }

    getNodeLine(nodeContent: string): number {
        return this.mappingManager.getAllMappings().find(
            m => m.content.toLowerCase().includes(nodeContent.toLowerCase())
        )?.startLine ?? -1;
    }

    canSync(): boolean {
        return !this.syncState.isSyncing;
    }

    private generateEdits(
        editor: Editor,
        node: IPureNode,
        operation: string,
        params?: unknown
    ): MarkdownEdit[] {
        const content = editor.getValue();
        const lines = content.split('\n');

        const nodeId = (node.payload as any)?.nodeId;
        let targetLine = -1;

        if (nodeId) {
            const mapping = this.mappingManager.getMappingById(nodeId);
            if (mapping) {
                targetLine = mapping.startLine;
            }
        }

        /*  if (targetLine === -1) {
             this.mappingManager.updateContent(content);
             const nodeContent = typeof node.content === 'string' ? node.content : '';
             targetLine = this.mappingManager.findLineByContent(this.mappingManager.extractTextContent(nodeContent));
         } */

        if (targetLine === -1) return [];

        switch (operation) {
            case 'edit':
                return this.generateEditEdits(lines, targetLine, params as string);

            case 'delete':
                return this.generateDeleteEdits(lines, targetLine);

            case 'indent':
                return this.generateIndentEdits(lines, targetLine, 1);

            case 'outdent':
                return this.generateIndentEdits(lines, targetLine, -1);

            case 'move':
                return this.generateMoveEdits(lines, targetLine, params as { toLine: number; toAfter: boolean });

            case 'insert-sibling':
                return this.generateInsertSiblingEdits(lines, targetLine);

            case 'insert-child':
                return this.generateInsertChildEdits(lines, targetLine);

            default:
                return [];
        }
    }

    private generateEditEdits(lines: string[], line: number, newContent: string): MarkdownEdit[] {
        const oldLine = lines[line];
        let newLine: string;

        const headingLevel = getHeadingLevel(oldLine);
        if (headingLevel > 0) {
            newLine = `${'#'.repeat(headingLevel)} ${newContent}`;
        } else if (isListItem(oldLine)) {
            const prefix = oldLine.match(/^(\s*)(?:[-*+]|\d+\.)\s/)?.[0] || '';
            newLine = prefix + newContent;
        } else {
            newLine = newContent;
        }

        return [{
            fromLine: line,
            fromCh: 0,
            toLine: line,
            toCh: oldLine.length,
            newText: newLine,
            oldText: oldLine,
        }];
    }

    private generateDeleteEdits(lines: string[], startLine: number): MarkdownEdit[] {
        const baseLevel = getHeadingLevel(lines[startLine]);
        let endLine: number;

        if (baseLevel > 0) {
            endLine = startLine;
            for (let i = startLine + 1; i < lines.length; i++) {
                const level = getHeadingLevel(lines[i]);
                if (level > 0 && level <= baseLevel) break;
                endLine = i;
            }
        } else {
            const itemLines = extractListItemWithChildren(lines, startLine);
            endLine = startLine + itemLines.length - 1;
        }

        return [{
            fromLine: startLine,
            fromCh: 0,
            toLine: endLine,
            toCh: lines[endLine]?.length || 0,
            newText: '',
        }];
    }

    private generateIndentEdits(lines: string[], line: number, delta: number): MarkdownEdit[] {
        const oldLine = lines[line];
        const headingLevel = getHeadingLevel(oldLine);

        let newLine: string;
        if (headingLevel > 0) {
            const newLevel = Math.max(1, Math.min(6, headingLevel + delta));
            newLine = changeHeadingLevel(oldLine, newLevel);
        } else if (isListItem(oldLine)) {
            const oldIndent = getListIndent(oldLine);
            const newIndent = Math.max(0, oldIndent + delta * 2);
            newLine = changeListIndent(oldLine, newIndent);
        } else {
            return [];
        }

        return [{
            fromLine: line,
            fromCh: 0,
            toLine: line,
            toCh: oldLine.length,
            newText: newLine,
            oldText: oldLine,
        }];
    }

    private generateMoveEdits(
        lines: string[],
        fromLine: number,
        params: { toLine: number; toAfter: boolean }
    ): MarkdownEdit[] {
        return moveListItem(lines, fromLine, params.toLine, params.toAfter);
    }

    private generateInsertSiblingEdits(lines: string[], targetLine: number): MarkdownEdit[] {
        const currentLine = lines[targetLine];
        const headingLevel = getHeadingLevel(currentLine);
        let newLine: string;

        if (headingLevel > 0) {
            // Heading: insert same-level heading after current node's last line
            const endLine = this.findNodeEndLine(lines, targetLine, headingLevel);
            newLine = `${'#'.repeat(headingLevel)} New Node`;
            return [{
                fromLine: endLine,
                fromCh: lines[endLine]?.length ?? 0,
                toLine: endLine,
                toCh: lines[endLine]?.length ?? 0,
                newText: '\n' + newLine,
            }];
        } else if (isListItem(currentLine)) {
            // List item: insert same-level list item after current item's children
            const itemLines = extractListItemWithChildren(lines, targetLine);
            const endLine = targetLine + itemLines.length - 1;
            const prefix = currentLine.match(/^(\s*)(?:[-*+]|\d+\.)\s/)?.[1] || '';
            const listMarker = currentLine.match(/^\s*([-*+]|\d+\.)\s/)?.[1] || '-';
            const marker = /^\d+\.$/.test(listMarker) ? '- ' : (listMarker + ' ');
            newLine = prefix + marker + 'New Node';
            return [{
                fromLine: endLine,
                fromCh: lines[endLine]?.length ?? 0,
                toLine: endLine,
                toCh: lines[endLine]?.length ?? 0,
                newText: '\n' + newLine,
            }];
        }

        // Fallback: just insert a new line after
        return [{
            fromLine: targetLine,
            fromCh: currentLine.length,
            toLine: targetLine,
            toCh: currentLine.length,
            newText: '\nNew Node',
        }];
    }

    private generateInsertChildEdits(lines: string[], targetLine: number): MarkdownEdit[] {
        const currentLine = lines[targetLine];
        const headingLevel = getHeadingLevel(currentLine);
        let newLine: string;

        if (headingLevel > 0) {
            const endLine = this.findNodeEndLine(lines, targetLine, headingLevel);
            if (headingLevel >= 6) {
                newLine = '- New Node';
            } else {
                newLine = `${'#'.repeat(headingLevel + 1)} New Node`;
            }
            return [{
                fromLine: endLine,
                fromCh: lines[endLine]?.length ?? 0,
                toLine: endLine,
                toCh: lines[endLine]?.length ?? 0,
                newText: '\n' + newLine,
            }];
        } else if (isListItem(currentLine)) {
            const itemLines = extractListItemWithChildren(lines, targetLine);
            const endLine = targetLine + itemLines.length - 1;
            const currentIndent = getListIndent(currentLine);
            const listMarker = currentLine.match(/^\s*([-*+]|\d+\.)\s/)?.[1] || '-';
            const marker = /^\d+\.$/.test(listMarker) ? '- ' : (listMarker + ' ');
            newLine = ' '.repeat(currentIndent + 2) + marker + 'New Node';
            return [{
                fromLine: endLine,
                fromCh: lines[endLine]?.length ?? 0,
                toLine: endLine,
                toCh: lines[endLine]?.length ?? 0,
                newText: '\n' + newLine,
            }];
        }

        // Fallback
        return [{
            fromLine: targetLine,
            fromCh: currentLine.length,
            toLine: targetLine,
            toCh: currentLine.length,
            newText: '\n  New Node',
        }];
    }

    private findNodeEndLine(lines: string[], startLine: number, nodeDepth: number): number {
        let endLine = startLine;
        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === '') {
                endLine = i;
                continue;
            }
            const level = getHeadingLevel(line);
            if (level > 0 && level <= nodeDepth) {
                break;
            }
            endLine = i;
        }
        return endLine;
    }

    private async applyEdits(editor: Editor, edits: MarkdownEdit[]): Promise<void> {
        const doc = editor.getDoc();

        edits.sort((a, b) => b.fromLine - a.fromLine);

        for (const edit of edits) {
            const from = { line: edit.fromLine, ch: edit.fromCh || 0 };
            const to = { line: edit.toLine, ch: edit.toCh ?? editor.getLine(edit.toLine).length };
            console.log('start line at', from.line, ';end line at', to.line);

            doc.replaceRange(edit.newText, from, to);
        }
    }

    /*   private findLineByContent(lines: string[], content: string): number {
          return this.mappingManager.findLineByContent(content, 0);
      } */
}
