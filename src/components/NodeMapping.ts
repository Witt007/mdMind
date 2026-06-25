import { IPureNode } from 'markmap-common';
import { LineNodeMap, NodeMappingInfo } from '../types';
import { generateNodeId } from '../utils/markdown';

export class NodeMappingManager {
    private mappings: Map<string, NodeMappingInfo> = new Map();
    private lineMap: LineNodeMap = {};
    private contentLines: string[] = [];

    getLenOfContentLines(): number { return this.contentLines.length }


    buildMappings(root: IPureNode, markdown: string): void {
        this.mappings.clear();
        this.lineMap = {};
        this.contentLines = markdown.split('\n');

        /*  if (root.content === '') {
             if (root.children) {
                 for (const child of root.children) {
                     this.processNode(child, 1, undefined);
                 }
             }
         } else  */
        this.processNode(root, 0, undefined);
    }

    public extractTextContent(content: string): string {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            return doc.body.textContent || doc.body.innerText || content;
        } catch (e) {
            return content;
        }
    }

    getMappingById(nodeId: string): NodeMappingInfo | undefined {
        return this.mappings.get(nodeId);
    }

    getMappingByLine(line: number): NodeMappingInfo | undefined {
        const nodeId = this.lineMap[line];
        if (!nodeId) return undefined;
        return this.mappings.get(nodeId);
    }

    getNodeIdAtLine(line: number): string {
        return this.lineMap[line] || '';
    }

    getAllMappings(): NodeMappingInfo[] {
        return Array.from(this.mappings.values());
    }

    getFirstNodeId(): string {
        return this.mappings.keys().next().value || 'mm-node-0'
    }

    updateContent(markdown: string): void {
        this.contentLines = markdown.split('\n');
    }

    public getContentLines(): string[] {
        return this.contentLines;
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

    findNextNodeLine(fromLine: number, toLine: number): number | null {
        for (let line = fromLine; line <= toLine; line++) {
            const nodeId = this.lineMap[line];
            if (!nodeId) continue;
            return line;
        }
        return null;
    }

    // the purpose is just mapping the node to the line, so we can find the node by line number when we click on the line, and find the line number by node when we click on the node;
    private processNode(node: IPureNode, depth: number, parentId?: string): void {
        const nodeId = (node.payload as any)?.nodeId //|| generateNodeId(startLine, node.content);
        const lines = (node.payload?.lines as string)?.split(',').map(Number);
        if (!lines) {
            if (node.children) {
                for (const child of node.children) {
                    this.processNode(child, depth + 1, nodeId);
                }
            }
            return console.warn('startLine or endLine is not defined', node);
        }
        let [startLine, endLine] = lines;
        if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) return console.warn('startLine or endLine is not defined', node);


        const info: NodeMappingInfo = {
            nodeId,
            startLine,
            endLine,
            depth,
            content: node.content,
            parentId,
        };

        this.mappings.set(nodeId, info);

        this.lineMap[startLine] = nodeId;

        if (node.children) {
            for (const child of node.children) {
                this.processNode(child, depth + 1, nodeId);
            }
        }
    }


    private buildNodeStartLineIndex(lines: string[]): boolean[] {
        const isStart: boolean[] = new Array(lines.length).fill(false);
        let inCodeBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            if (inCodeBlock) continue;

            // Only headings and list items represent nodes in the markmap structure.
            const isHeading = /^#{1,6}\s/.test(line);
            const isListItem = /^\s*(?:[-*+]|\d+\.)\s/.test(line);
            isStart[i] = isHeading || isListItem;
        }

        return isStart;
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

        const startIsListItem = /^\s*[-*+]|^\s*\d+\./.test(this.contentLines[startLine] || '');

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
            } else if (startIsListItem && isListItem && indent <= baseIndent) {
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
