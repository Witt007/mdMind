import {IPureNode} from 'markmap-common';
import {MarkdownEdit, NodeMappingInfo} from '../types';

export function getHeadingLevel(line: string): number {
    const match = line.match(/^(#{1,6})\s/);
    return match ? match[1].length : 0;
}

export function isListItem(line: string): boolean {
    return /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line);
}

export function getListIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
}

export function getListPrefix(line: string): string {
    const match = line.match(/^(\s*)(?:[-*+]|\d+\.)\s/);
    return match ? match[0] : '';
}

export function parseMarkdownStructure(content: string): EditorNodeInfo[] {
    const lines = content.split('\n');
    const nodes: EditorNodeInfo[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }

        if (inCodeBlock) continue;

        const headingLevel = getHeadingLevel(line);
        if (headingLevel > 0) {
            nodes.push({
                line: i,
                ch: 0,
                content: line.replace(/^#{1,6}\s*/, '').trim(),
                level: headingLevel,
            });
        } else if (isListItem(line)) {
            const indent = getListIndent(line);
            const level = Math.floor(indent / 2) + 1;
            nodes.push({
                line: i,
                ch: indent,
                content: line.replace(/^\s*(?:[-*+]|\d+\.)\s*/, '').trim(),
                level,
            });
        }
    }

    return nodes;
}

export interface EditorNodeInfo {
    line: number;
    ch: number;
    content: string;
    level: number;
}

export function buildNodeTree(nodes: EditorNodeInfo[]): IPureNode[] {
    const root: IPureNode = {
        content: '',
        children: [],
    };
    const stack: IPureNode[] = [root];

    for (const nodeInfo of nodes) {
        const node: IPureNode = {
            content: nodeInfo.content,
            children: [],
        };

        while (stack.length > 1 && getNodeLevel(stack[stack.length - 1]) >= nodeInfo.level) {
            stack.pop();
        }

        const parent = stack[stack.length - 1];
        if (!parent.children) {
            parent.children = [];
        }
        parent.children.push(node);
        stack.push(node);
    }

    return root.children || [];
}

function getNodeLevel(node: IPureNode): number {
    if (!node.children || node.children.length === 0) return 1;
    return 1 + Math.max(...node.children.map(getNodeLevel), 0);
}

export function generateNodeId(line: number, content: string): string {
    const normalized = content.slice(0, 30).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, '');
    return `node-${line}-${normalized}`;
}

export function moveListItem(
    lines: string[],
    fromLine: number,
    toLine: number,
    toAfter: boolean
): MarkdownEdit[] {
    const itemLines = extractListItemWithChildren(lines, fromLine);
    const itemText = itemLines.join('\n');
    const newLines = [...lines];

    const targetLine = toAfter ? toLine + 1 : toLine;
    newLines.splice(targetLine, 0, itemText);

    const offset = targetLine < fromLine ? itemLines.length : 0;
    newLines.splice(fromLine + offset, itemLines.length);

    return [{
        fromLine: 0,
        toLine: lines.length - 1,
        newText: newLines.join('\n'),
    }];
}

export function extractListItemWithChildren(lines: string[], startLine: number): string[] {
    const result: string[] = [lines[startLine]];
    const baseIndent = getListIndent(lines[startLine]);

    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
            result.push(line);
            continue;
        }

        // Headings always break lists
        if (getHeadingLevel(line) > 0) {
            break;
        }

        const indent = getListIndent(line);
        if (indent > baseIndent || (indent === baseIndent && !isListItem(line))) {
            result.push(line);
        } else {
            break;
        }
    }

    return result;
}

export function changeHeadingLevel(line: string, newLevel: number): string {
    const content = line.replace(/^#{1,6}\s*/, '');
    return `${'#'.repeat(newLevel)} ${content}`;
}

export function changeListIndent(line: string, newIndent: number): string {
    const match = line.match(/^(\s*)((?:[-*+]|\d+\.)\s.*)$/);
    if (!match) return line;
    return ' '.repeat(newIndent) + match[2];
}

export function findNodeByLine(mappings: NodeMappingInfo[], line: number): NodeMappingInfo | null {
    return mappings.find(m => m.startLine <= line && m.endLine >= line) || null;
}

export function findNodeById(mappings: NodeMappingInfo[], id: string): NodeMappingInfo | null {
    return mappings.find(m => m.nodeId === id) || null;
}
