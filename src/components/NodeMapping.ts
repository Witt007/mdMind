import {IPureNode} from 'markmap-common';
import {LineNodeMap, NodeMappingInfo} from '../types';
import {generateNodeId} from '../utils/markdown';

export class NodeMappingManager {
    private mappings: Map<string, NodeMappingInfo> = new Map();
    private lineMap: LineNodeMap = {};
    private contentLines: string[] = [];
    private normalizedLines: string[] = [];

    private lastFoundLine = -1;

    buildMappings(root: IPureNode, markdown: string): void {
        this.mappings.clear();
        this.lineMap = {};
        this.contentLines = markdown.split('\n');
        this.normalizedLines = this.contentLines.map(line => this.normalizeLine(line));
        this.lastFoundLine = -1;

        this.processNode(root, 0, undefined);
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
        this.normalizedLines = this.contentLines.map(line => this.normalizeLine(line));
    }

    clear(): void {
        this.mappings.clear();
        this.lineMap = {};
        this.contentLines = [];
        this.normalizedLines = [];
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

    // the purpose is just mapping the node to the line, so we can find the node by line number when we click on the line, and find the line number by node when we click on the node;
    private processNode(node: IPureNode, depth: number, parentId?: string): void {
        const content = this.extractTextContent(node.content);
        let startLine = this.findLineByContent(content, this.lastFoundLine + 1);
        console.info('from lastFoundLine',this.lastFoundLine+1,'\nreturned lastFoundLine:',startLine,'\ncontent:',content,'\nnormalines:',this.normalizedLines)
        //if (startLine === -1) return;//if (node.payload?.nodeId=="filenode"){startLine=0;}else
        this.lastFoundLine = startLine;

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

        if (node.children) { // when a specific node's position changed, its children have to be changed;
            for (const child of node.children) {
                this.processNode(child, depth + 1, nodeId);
            }
        }
    }

    public findLineByContent(content: string, startIndex: number = 0): number {
        const normalizedContent = this.normalizeLine(content);

        // Exact match
        for (let i = startIndex; i < this.normalizedLines.length; i++) {
            if (this.normalizedLines[i] === normalizedContent) {
                return i;
            } else console.log(`Line ${i} does not match. Expected: "${normalizedContent}", Actual: "${this.normalizedLines[i]}"`);
        }

        // Partial match fallback if exact match fails
     /*   for (let i = startIndex; i < this.normalizedLines.length; i++) {
            if (this.normalizedLines[i].includes(normalizedContent) || normalizedContent.includes(this.normalizedLines[i])) {
                if (this.normalizedLines[i].length > 0 && normalizedContent.length > 0) {
                    return i;
                }
            }
        }*/
        return -1;
    }

    private normalizeLine(line: string): string {
        return line
            .replace(/^#{1,6}\s*/, '')
            .replace(/^\s*[-*+]\s*/, '')
            .replace(/^\s*\d+\.\s*/, '')
            .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
            .replace(/(\*|_)(.*?)\1/g, '$2')   // Italic
            .replace(/~~(.*?)~~/g, '$1')       // Strikethrough
            .replace(/==(.*?)==/g, '$1')       // Highlight
            .replace(/`([^`]+)`/g, '$1')       // Inline code
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links [text](url)
            .replace(/[\\`*_{}[\]()#+\-.!]/g, '') // Remove remaining markdown special chars
            .trim()
            .toLowerCase();
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
