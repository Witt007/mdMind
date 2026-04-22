import {IPureNode} from 'markmap-common';
import {LineNodeMap, NodeMappingInfo} from '../types';
import {generateNodeId} from '../utils/markdown';

export class NodeMappingManager {
    private mappings: Map<string, NodeMappingInfo> = new Map();
    private lineMap: LineNodeMap = {};
    private contentLines: string[] = [];

    buildMappings(root: IPureNode, markdown: string): void {
        this.mappings.clear();
        this.lineMap = {};
        this.contentLines = markdown.split('\n');

        if (root.children) {
            for (const node of root.children) {
                this.processNode(node, 0, undefined);
            }
        }
    }

    public extractTextContent(content: string): string {
        const temp = document.createElement('div');
        temp.innerHTML = content;
        return temp.textContent || temp.innerText || content;
    }

    getMappingById(nodeId: string): NodeMappingInfo | undefined {
        return this.mappings.get(nodeId);
    }

    getMappingByLine(line: number): NodeMappingInfo | undefined {
        const nodeIds = this.lineMap[line];
        if (!nodeIds || nodeIds.length === 0) return undefined;
        return this.mappings.get(nodeIds[0]);
    }

    getNodeIdsAtLine(line: number): string[] {
        return this.lineMap[line] || [];
    }

    getAllMappings(): NodeMappingInfo[] {
        return Array.from(this.mappings.values());
    }

    updateContent(markdown: string): void {
        this.contentLines = markdown.split('\n');
    }

    clear(): void {
        this.mappings.clear();
        this.lineMap = {};
        this.contentLines = [];
    }

    findNearestNode(line: number): NodeMappingInfo | undefined {
        for (let i = line; i >= 0; i--) {
            const mapping = this.getMappingByLine(i);
            if (mapping) return mapping;
        }
        return undefined;
    }

    getSiblings(nodeId: string): NodeMappingInfo[] {
        const node = this.mappings.get(nodeId);
        if (!node) return [];

        return this.getAllMappings().filter(
            m => m.parentId === node.parentId && m.nodeId !== nodeId
        );
    }

    getChildren(nodeId: string): NodeMappingInfo[] {
        return this.getAllMappings().filter(m => m.parentId === nodeId);
    }

    private processNode(node: IPureNode, depth: number, parentId?: string): void {
        const content = this.extractTextContent(node.content);
        const startLine = this.findLineByContent(content);

        if (startLine === -1) return;

        const endLine = this.findNodeEndLine(startLine, depth);
        // Use renderer-assigned nodeId from node.payload if available, otherwise fall back
        const nodeId = (node.payload as any)?.nodeId || generateNodeId(startLine, content);

        const info: NodeMappingInfo = {
            nodeId,
            startLine,
            endLine,
            depth,
            content,
            parentId,
        };

        this.mappings.set(nodeId, info);

        if (!this.lineMap[startLine]) {
            this.lineMap[startLine] = [];
        }
        this.lineMap[startLine].push(nodeId);

        if (node.children) {
            for (const child of node.children) {
                this.processNode(child, depth + 1, nodeId);
            }
        }
    }

    private findLineByContent(content: string): number {
        content = this.extractTextContent(content);
        const normalizedContent = content.trim().toLowerCase();

        for (let i = 0; i < this.contentLines.length; i++) {
            const line = this.contentLines[i];
            const normalizedLine = line
                .replace(/^#{1,6}\s*/, '')
                .replace(/^\s*[-*+]\s*/, '')
                .replace(/^\s*\d+\.\s*/, '')
                .trim()
                .toLowerCase();

            if (normalizedLine === normalizedContent) {
                return i;
            }
        }

        return -1;
    }

    private findNodeEndLine(startLine: number, depth: number): number {
        const baseIndent = this.getLineIndent(startLine);
        let endLine = startLine;

        for (let i = startLine + 1; i < this.contentLines.length; i++) {
            const line = this.contentLines[i];

            if (line.trim() === '') {
                endLine = i;
                continue;
            }

            const indent = this.getLineIndent(i);
            const isHeading = /^#{1,6}\s/.test(line);
            const isListItem = /^\s*[-*+]|^\s*\d+\./.test(line);

            if (isHeading) {
                const level = line.match(/^(#{1,6})/)?.[1].length || 0;
                if (level <= depth + 1) {
                    break;
                }
            } else if (isListItem && indent <= baseIndent) {
                break;
            }

            endLine = i;
        }

        return endLine;
    }

    private getLineIndent(lineIndex: number): number {
        const line = this.contentLines[lineIndex] || '';
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }
}
